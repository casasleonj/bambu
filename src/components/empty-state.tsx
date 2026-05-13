'use client'

import { ReactNode, useState } from 'react'

interface GuidedStep {
  label: string
  description?: string
  onClick?: () => void
  disabled?: boolean
}

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  guidedSteps?: GuidedStep[]
  learnMoreUrl?: string
  compact?: boolean
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  guidedSteps,
  learnMoreUrl,
  compact = false,
}: EmptyStateProps) {
  const [expanded, setExpanded] = useState(false)

  const paddingClass = compact ? 'py-8' : 'py-16'

  return (
    <div className={`flex flex-col items-center justify-center ${paddingClass} text-center`} role="status" aria-live="polite">
      {icon && (
        <div className={`${compact ? 'mb-2' : 'mb-4'} text-gray-300`}>
          {icon}
        </div>
      )}

      <h3 className={`${compact ? 'text-base' : 'text-lg'} font-medium text-gray-900`}>{title}</h3>

      {description && (
        <p className={`mt-1 ${compact ? 'text-xs' : 'text-sm'} text-gray-500 max-w-sm leading-relaxed`}>{description}</p>
      )}

      {/* Primary action */}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className={`mt-4 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 text-sm font-medium transition shadow-sm inline-flex items-center gap-2`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          {actionLabel}
        </button>
      )}

      {/* Guided steps - onboarding */}
      {guidedSteps && guidedSteps.length > 0 && (
        <div className="mt-6 w-full max-w-sm">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 mx-auto"
          >
            {expanded ? 'Ocultar' : 'Ver'} guía para empezar
            <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expanded && (
            <div className="mt-3 bg-blue-50 rounded-xl p-4 text-left space-y-3">
              <p className="text-xs text-blue-700 font-medium">Sigue estos pasos:</p>
              {guidedSteps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                    step.disabled ? 'bg-gray-200 text-gray-400' : 'bg-blue-600 text-white'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    {step.onClick ? (
                      <button
                        onClick={step.onClick}
                        disabled={step.disabled}
                        className={`text-sm font-medium text-left ${step.disabled ? 'text-gray-400 cursor-not-allowed' : 'text-gray-800 hover:text-blue-700'}`}
                      >
                        {step.label}
                      </button>
                    ) : (
                      <span className={`text-sm font-medium ${step.disabled ? 'text-gray-400' : 'text-gray-800'}`}>{step.label}</span>
                    )}
                    {step.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Learn more */}
      {learnMoreUrl && (
        <a
          href={learnMoreUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          ¿Qué es esto y para qué sirve?
        </a>
      )}
    </div>
  )
}

// Specialized empty states for common scenarios
export function EmptySearch({ searchTerm, onClear }: { searchTerm: string; onClear: () => void }) {
  return (
    <EmptyState
      icon={
        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      }
      title={`No hay resultados para "${searchTerm}"`}
      description="Intenta con otro término o revisa la ortografía"
      actionLabel="Limpiar búsqueda"
      onAction={onClear}
      compact
    />
  )
}

export function EmptyFilter({ filterCount, onClear }: { filterCount: number; onClear: () => void }) {
  return (
    <EmptyState
      icon={
        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
      }
      title={`${filterCount} filtro${filterCount > 1 ? 's' : ''} activo${filterCount > 1 ? 's' : ''}`}
      description="No hay registros que coincidan con los filtros seleccionados"
      actionLabel="Limpiar filtros"
      onAction={onClear}
      compact
    />
  )
}
