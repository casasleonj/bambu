'use client'

import { useContext } from 'react'
import { RealtimeContext } from '@/components/realtime-provider'

/**
 * Banner that informs the user when realtime is disabled.
 * Shown when NEXT_PUBLIC_REALTIME_ENABLED=false (emergency kill switch).
 * Tells users they need to reload the page to see changes from other sessions.
 */
export function RealtimeStatusBanner() {
  const ctx = useContext(RealtimeContext)
  if (!ctx?.disabled) return null

  return (
    <div
      role="alert"
      data-testid="realtime-disabled-banner"
      className="w-full bg-amber-500 text-amber-950 px-3 sm:px-4 py-2 text-center text-xs sm:text-sm font-medium flex items-center justify-center gap-2"
    >
      <svg
        className="w-4 h-4 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
        />
      </svg>
      <span>
        Actualizaciones en vivo pausadas. Recargá la página para ver cambios de otros usuarios.
      </span>
    </div>
  )
}
