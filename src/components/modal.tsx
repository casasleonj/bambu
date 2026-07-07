'use client'

import { useEffect, useCallback, useRef, useId } from 'react'

// Modal stack registry — tracks all open modals/overlays.
// Only the topmost layer responds to Escape key.
const modalStack: string[] = []

export function pushModal(id: string): void {
  if (!modalStack.includes(id)) {
    modalStack.push(id)
  }
}

export function removeModal(id: string): void {
  const idx = modalStack.indexOf(id)
  if (idx !== -1) modalStack.splice(idx, 1)
}

export function isTopModal(id: string): boolean {
  return modalStack.length > 0 && modalStack[modalStack.length - 1] === id
}

interface ModalProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  title?: string
  description?: string
  'data-testid'?: string
}

export function Modal({ open, onClose, children, className, title, description, 'data-testid': dataTestId }: ModalProps) {
  const id = useId()
  const overlayRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (!isTopModal(id)) return
      e.stopPropagation()
      onClose()
    }
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
  }, [onClose, id])

  const wasOpen = useRef(false)

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) {
        wasOpen.current = false
        removeModal(id)
        if (modalStack.length === 0) {
          document.body.style.overflow = ''
        }
      }
      return
    }
    if (!wasOpen.current) {
      wasOpen.current = true
      pushModal(id)
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
        removeModal(id)
        if (modalStack.length === 0) {
          document.body.style.overflow = ''
        }
        clearTimeout(timer)
      }
    }
  }, [open, id])

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown, id])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-describedby={description ? 'modal-description' : undefined}
      data-testid={dataTestId}
      className="fixed inset-0 bg-black/50 flex items-start md:items-center justify-center z-50 overflow-y-auto p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={contentRef}
        className={className || 'bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto mx-auto mt-10 md:mt-0'}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 id="modal-title" className="sr-only">{title}</h2>}
        {description && <p id="modal-description" className="sr-only">{description}</p>}
        {children}
      </div>
    </div>
  )
}
