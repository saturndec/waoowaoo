'use client'

import { useEffect, useRef, useState } from 'react'
import { AppIcon, RatioPreviewIcon } from '@/components/ui/icons'

interface RatioIconProps {
  ratio: string
  size?: number
  selected?: boolean
}

interface RatioSelectorProps {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}

interface StyleSelectorProps {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string; preview: string }>
}

function RatioIcon({ ratio, size = 24, selected = false }: RatioIconProps) {
  return (
    <RatioPreviewIcon
      ratio={ratio}
      size={size}
      selected={selected}
      variant="surface"
    />
  )
}

export function RatioSelector({ value, onChange, options }: RatioSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedOption = options.find((option) => option.value === value)

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-md border border-input bg-background px-3 py-2.5 flex items-center justify-between gap-2 cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-3">
          <RatioIcon ratio={value} size={20} selected />
          <span className="text-sm text-foreground font-medium">
            {selectedOption?.label || value}
          </span>
        </div>
        <AppIcon name="chevronDown" className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className="rounded-xl border border-border bg-card shadow-lg absolute z-50 mt-1 left-0 right-0 p-3 max-h-60 overflow-y-auto custom-scrollbar"
          style={{ minWidth: '280px' }}
        >
          <div className="grid grid-cols-5 gap-2">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-muted transition-colors ${
                  value === option.value
                    ? 'bg-primary/10 shadow-[0_0_0_1px_rgba(79,128,255,0.35)]'
                    : ''
                }`}
              >
                <RatioIcon ratio={option.value} size={28} selected={value === option.value} />
                <span
                  className={`text-xs ${
                    value === option.value
                      ? 'text-primary font-medium'
                      : 'text-muted-foreground'
                  }`}
                >
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function StyleSelector({ value, onChange, options }: StyleSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedOption = options.find((option) => option.value === value) || options[0]

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-md border border-input bg-background px-3 py-2.5 flex items-center justify-between gap-2 cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{selectedOption.preview}</span>
          <span className="text-sm text-foreground font-medium">{selectedOption.label}</span>
        </div>
        <AppIcon name="chevronDown" className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="rounded-xl border border-border bg-card shadow-lg absolute z-50 mt-1 left-0 right-0 p-3">
          <div className="grid grid-cols-2 gap-2">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={`flex items-center gap-2 p-3 rounded-lg text-left transition-all ${
                  value === option.value
                    ? 'bg-primary/10 text-primary shadow-[0_0_0_1px_rgba(79,128,255,0.35)]'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
              >
                <span className="text-lg">{option.preview}</span>
                <span className="font-medium text-sm">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
