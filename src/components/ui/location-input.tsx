'use client'

import { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { LOCATION_SUGGESTIONS } from '@/lib/constants'

interface LocationInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  id?: string
  name?: string
}

export function LocationInput({ value, onChange, placeholder = 'e.g. Mumbai, India', className = '', id, name }: LocationInputProps) {
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const filtered = value.trim()
    ? LOCATION_SUGGESTIONS.filter((loc) =>
        loc.toLowerCase().includes(value.toLowerCase())
      )
    : [...LOCATION_SUGGESTIONS]

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        id={id}
        name={name}
        value={value}
        placeholder={placeholder}
        className={className}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          setFocused(true)
          setOpen(true)
        }}
        onBlur={() => setFocused(false)}
        autoComplete="off"
      />
      {open && focused && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {filtered.map((loc) => (
            <button
              key={loc}
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(loc)
                setOpen(false)
              }}
            >
              {loc}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
