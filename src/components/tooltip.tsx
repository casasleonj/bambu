'use client'

import { useState, useRef, useEffect } from 'react'

interface TooltipProps {
  children: React.ReactNode
  content: string
  title?: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  maxWidth?: number
  delay?: number
  disabled?: boolean
}

export function Tooltip({
  children,
  content,
  title,
  position = 'top',
  maxWidth = 280,
  delay = 300,
  disabled = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    if (disabled) return
    timerRef.current = setTimeout(() => {
      setVisible(true)
      updatePosition()
    }, delay)
  }

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }

  const updatePosition = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const scrollX = window.scrollX || window.pageXOffset
    const scrollY = window.scrollY || window.pageYOffset

    let x = 0, y = 0
    switch (position) {
      case 'top':
        x = rect.left + rect.width / 2 + scrollX
        y = rect.top + scrollY - 8
        break
      case 'bottom':
        x = rect.left + rect.width / 2 + scrollX
        y = rect.bottom + scrollY + 8
        break
      case 'left':
        x = rect.left + scrollX - 8
        y = rect.top + rect.height / 2 + scrollY
        break
      case 'right':
        x = rect.right + scrollX + 8
        y = rect.top + rect.height / 2 + scrollY
        break
    }
    setCoords({ x, y })
  }

  useEffect(() => {
    if (visible) updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [visible])

  const positionStyles: Record<string, React.CSSProperties> = {
    top: { left: coords.x, top: coords.y, transform: 'translate(-50%, -100%)' },
    bottom: { left: coords.x, top: coords.y, transform: 'translate(-50%, 0)' },
    left: { left: coords.x, top: coords.y, transform: 'translate(-100%, -50%)' },
    right: { left: coords.x, top: coords.y, transform: 'translate(0, -50%)' },
  }

  const arrowClasses = {
    top: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45',
    bottom: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45',
    left: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 rotate-45',
    right: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45',
  }

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="inline-flex"
      >
        {children}
      </div>

      {visible && (
        <div
          ref={tooltipRef}
          style={{
            ...positionStyles[position],
            maxWidth,
            position: 'fixed',
            zIndex: 9999,
          }}
          className="pointer-events-none"
        >
          <div className="relative bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl">
            {title && <p className="font-semibold mb-1 text-white/90">{title}</p>}
            <p className="leading-relaxed">{content}</p>
            <div className={`absolute w-2 h-2 bg-gray-900 ${arrowClasses[position]}`} />
          </div>
        </div>
      )}
    </>
  )
}

// Help badge with inline explanation
interface HelpBadgeProps {
  text: string
  className?: string
}

export function HelpBadge({ text, className = '' }: HelpBadgeProps) {
  return (
    <Tooltip content={text} position="top">
      <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold cursor-help hover:bg-gray-300 transition ${className}`}>
        ?
      </span>
    </Tooltip>
  )
}

// Info banner for contextual help
interface InfoBannerProps {
  title?: string
  children: React.ReactNode
  type?: 'info' | 'tip' | 'warning'
  dismissible?: boolean
  onDismiss?: () => void
  className?: string
}

export function InfoBanner({ title, children, type = 'info', dismissible, onDismiss, className = '' }: InfoBannerProps) {
  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    tip: 'bg-amber-50 border-amber-200 text-amber-800',
    warning: 'bg-red-50 border-red-200 text-red-800',
  }

  const icons = {
    info: (
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    tip: (
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    warning: (
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
  }

  return (
    <div className={`rounded-lg border p-3 flex items-start gap-2.5 ${styles[type]} ${className}`}>
      {icons[type]}
      <div className="flex-1 min-w-0">
        {title && <p className="text-xs font-semibold mb-0.5">{title}</p>}
        <div className="text-xs leading-relaxed opacity-90">{children}</div>
      </div>
      {dismissible && onDismiss && (
        <button onClick={onDismiss} className="text-current opacity-50 hover:opacity-100 transition p-0.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
