'use client'

import { useEffect, useCallback, useRef } from 'react'

let modalOpenCount = 0

interface ModalProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  title?: string
  description?: string
}

export function Modal({ open, onClose, children, className, title, description }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Tab' && contentRef.current) {
      const focusable = contentRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }, [onClose])

  useEffect(() => {
    if (!open) return
    modalOpenCount++
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    const timer = setTimeout(() => {
      if (contentRef.current) {
        const focusable = contentRef.current.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        focusable?.focus()
      }
    }, 50)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      modalOpenCount--
      if (modalOpenCount <= 0) {
        document.body.style.overflow = ''
        modalOpenCount = 0
      }
      clearTimeout(timer)
    }
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-describedby={description ? 'modal-description' : undefined}
      className="fixed inset-0 bg-black/50 flex items-start md:items-center justify-center z-50 overflow-y-auto p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={contentRef}
        className={className || 'bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto mx-auto mt-10 md:mt-0'}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
