'use client'

import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TextAlign } from '@tiptap/extension-text-align'
import { Underline } from '@tiptap/extension-underline'
import { useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Undo, Redo, AlignLeft, AlignCenter, AlignRight,
  Table as TableIcon, Heading1, Heading2, Minus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface RichTextEditorHandle {
  insertText: (text: string) => void
  getEditor: () => Editor | null
}

interface RichTextEditorProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  rows?: number
  className?: string
  showTableTools?: boolean
  showHeadings?: boolean
  showAlignment?: boolean
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor({ value, onChange, placeholder, rows = 5, className, showTableTools, showHeadings, showAlignment }, ref) {
    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: placeholder || 'Start typing...' }),
        Underline,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
      ],
      content: value || '',
      editorProps: {
        attributes: {
          class: 'prose prose-sm max-w-none focus:outline-none min-h-[80px] px-3 py-2 text-[13px]',
          style: `min-height: ${rows * 24}px`,
        },
      },
      onUpdate: ({ editor }) => {
        onChange?.(editor.getHTML())
      },
    })

    useEffect(() => {
      if (editor && value !== undefined && editor.getHTML() !== value) {
        editor.commands.setContent(value, { emitUpdate: false })
      }
    }, [editor, value])

    useImperativeHandle(ref, () => ({
      insertText: (text: string) => {
        if (editor) {
          editor.chain().focus().insertContent(text).run()
        }
      },
      getEditor: () => editor,
    }), [editor])

    const Btn = useCallback(({
      isActive, onClick, children, title
    }: {
      isActive?: boolean; onClick: () => void; children: React.ReactNode; title: string
    }) => (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={cn(
          'p-1.5 rounded transition-colors',
          isActive ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
        )}
      >
        {children}
      </button>
    ), [])

    if (!editor) return null

    return (
      <div className={cn('rounded-md border border-input bg-white overflow-hidden', className)}>
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50/50 flex-wrap">
          {/* Headings */}
          {showHeadings && (
            <>
              <Btn title="Heading 1" isActive={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
                <Heading1 className="h-3.5 w-3.5" />
              </Btn>
              <Btn title="Heading 2" isActive={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
                <Heading2 className="h-3.5 w-3.5" />
              </Btn>
              <div className="w-px h-4 bg-gray-200 mx-1" />
            </>
          )}

          {/* Formatting */}
          <Btn title="Bold" isActive={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="h-3.5 w-3.5" />
          </Btn>
          <Btn title="Italic" isActive={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="h-3.5 w-3.5" />
          </Btn>
          <Btn title="Underline" isActive={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon className="h-3.5 w-3.5" />
          </Btn>
          <div className="w-px h-4 bg-gray-200 mx-1" />

          {/* Alignment */}
          {showAlignment && (
            <>
              <Btn title="Align Left" isActive={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
                <AlignLeft className="h-3.5 w-3.5" />
              </Btn>
              <Btn title="Align Center" isActive={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
                <AlignCenter className="h-3.5 w-3.5" />
              </Btn>
              <Btn title="Align Right" isActive={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
                <AlignRight className="h-3.5 w-3.5" />
              </Btn>
              <div className="w-px h-4 bg-gray-200 mx-1" />
            </>
          )}

          {/* Lists */}
          <Btn title="Bullet List" isActive={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List className="h-3.5 w-3.5" />
          </Btn>
          <Btn title="Numbered List" isActive={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="h-3.5 w-3.5" />
          </Btn>
          <Btn title="Horizontal Rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            <Minus className="h-3.5 w-3.5" />
          </Btn>

          {/* Table */}
          {showTableTools && (
            <>
              <div className="w-px h-4 bg-gray-200 mx-1" />
              <Btn title="Insert Table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
                <TableIcon className="h-3.5 w-3.5" />
              </Btn>
            </>
          )}

          <div className="w-px h-4 bg-gray-200 mx-1" />
          <Btn title="Undo" onClick={() => editor.chain().focus().undo().run()}>
            <Undo className="h-3.5 w-3.5" />
          </Btn>
          <Btn title="Redo" onClick={() => editor.chain().focus().redo().run()}>
            <Redo className="h-3.5 w-3.5" />
          </Btn>
        </div>
        <EditorContent editor={editor} />
      </div>
    )
  }
)
