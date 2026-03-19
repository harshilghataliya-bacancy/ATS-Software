'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useCallback } from 'react'
import { Bold, Italic, List, ListOrdered, Undo, Redo } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RichTextEditorProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  rows?: number
  className?: string
}

export function RichTextEditor({ value, onChange, placeholder, rows = 5, className }: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder || 'Start typing...' }),
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

  // Sync external value changes (e.g. AI-generated description)
  useEffect(() => {
    if (editor && value !== undefined && editor.getHTML() !== value) {
      editor.commands.setContent(value, { emitUpdate: false })
    }
  }, [editor, value])

  const ToolbarButton = useCallback(({
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
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50/50">
        <ToolbarButton
          title="Bold"
          isActive={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          isActive={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <ToolbarButton
          title="Bullet List"
          isActive={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered List"
          isActive={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <ToolbarButton
          title="Undo"
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Redo"
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
