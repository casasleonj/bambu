'use client'

import { useState, useRef, useEffect, useOptimistic, startTransition, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { MoneyDisplay } from '@/components/money-display'
import { openBaseCajaModal } from '@/components/base-caja-loader'
import { useBaseCajaEditor } from '@/hooks/use-base-caja-editor'
import type { Role } from '@/lib/constants'

/**
 * Header del sidebar que muestra la base de caja.
 *
 * Comportamiento segun estado:
 * - loading: muestra un placeholder neutro.
 * - sin_base (con permisos): boton "Sin base — click para registrar" que abre
 *   el modal automatico. Sin permisos: texto neutro "Sin base registrada".
 * - con_base (con permisos): boton "Caja base" + monto → entra en edit inline.
 * - con_base (sin permisos / cerrado): solo display, no clickeable.
 * - cerrado: solo display con tooltip.
 */
export function CajaBaseHeader() {
  const { data: session } = useSession()
  const userRole = (session?.user as { role?: Role } | undefined)?.role
  const canEdit = userRole === 'ADMIN' || userRole === 'ASISTENTE'
  const { state, update, isPending } = useBaseCajaEditor()

  const [editing, setEditing] = useState(false)
  const [draftValue, setDraftValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // useOptimistic: durante el guardado, mostramos el valor nuevo al instante.
  // Si falla, React hace rollback automatico al terminar la transicion.
  const originalValue =
    state.status === 'con_base' ? state.valor : state.status === 'cerrado' ? state.valor ?? '' : ''
  const [optimisticValue, setOptimisticValue] = useOptimistic(originalValue)

  // Cuando se carga el state y entra en edit por primera vez, sincronizamos
  // el draft con el valor del server.
  useEffect(() => {
    if (editing && state.status === 'con_base' && draftValue === '') {
      setDraftValue(state.valor)
    }
  }, [editing, state, draftValue])

  // Autofocus al entrar en edit.
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startEditing = useCallback(() => {
    if (state.status === 'con_base') {
      setDraftValue(state.valor)
    } else {
      setDraftValue('')
    }
    setEditing(true)
  }, [state])

  const cancelEditing = useCallback(() => {
    setEditing(false)
    setDraftValue('')
  }, [])

  const saveEditing = useCallback(async () => {
    const trimmed = draftValue.replace(/\D/g, '').trim()
    if (!trimmed) {
      toast.error('Ingresa un monto válido')
      return
    }
    if (trimmed === originalValue) {
      // Sin cambios reales → no hace nada (como pediste).
      cancelEditing()
      return
    }

    startTransition(async () => {
      setOptimisticValue(trimmed)
      const result = await update(trimmed)
      if (result.ok) {
        if (result.offline) {
          toast.success('Base guardada. Se sincronizará al volver la conexión.')
        } else {
          toast.success('Base de caja actualizada')
        }
        setEditing(false)
        setDraftValue('')
      } else {
        toast.error(result.error ?? 'Error al guardar la base')
        // No seteamos editing=false para que el usuario vea y corrija.
      }
    })
  }, [draftValue, originalValue, update, cancelEditing, setOptimisticValue])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        void saveEditing()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelEditing()
      }
    },
    [saveEditing, cancelEditing],
  )

  const handleSinBaseClick = useCallback(() => {
    if (canEdit) openBaseCajaModal()
  }, [canEdit])

  // --- Render segun estado ---

  if (state.status === 'loading') {
    return (
      <div
        className="px-4 py-3 border-b bg-gray-50"
        data-testid="caja-base-header-loading"
        aria-busy="true"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Caja base</span>
          <span className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    )
  }

  if (state.status === 'sin_base') {
    if (canEdit) {
      return (
        <button
          type="button"
          onClick={handleSinBaseClick}
          data-testid="caja-base-header-sin-base"
          aria-label="Registrar base de caja"
          className="w-full text-left px-4 py-3 border-b bg-amber-50 hover:bg-amber-100 transition focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-amber-800">⚠️ Sin base</span>
            <span className="text-xs text-amber-700">Click para registrar</span>
          </div>
        </button>
      )
    }
    return (
      <div
        className="px-4 py-3 border-b bg-gray-50"
        data-testid="caja-base-header-sin-base-readonly"
        aria-label="Sin base registrada"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Caja base</span>
          <span className="text-xs text-gray-400">Sin registrar</span>
        </div>
      </div>
    )
  }

  // con_base o cerrado
  const currentValue =
    state.status === 'con_base' ? optimisticValue : state.valor ?? ''

  if (editing && canEdit && state.status === 'con_base') {
    return (
      <div
        className="px-4 py-3 border-b bg-blue-50"
        data-testid="caja-base-header-editing"
      >
        <label htmlFor="caja-base-input" className="block text-xs text-gray-500 mb-1">
          Caja base
        </label>
        <div className="flex items-center gap-1">
          <span className="text-sm text-gray-500">$</span>
          <input
            ref={inputRef}
            id="caja-base-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            role="spinbutton"
            aria-valuenow={Number(draftValue) || 0}
            aria-valuemin={0}
            aria-label="Editar monto de base de caja"
            value={draftValue}
            disabled={isPending}
            onChange={(e) => setDraftValue(e.target.value.replace(/\D/g, ''))}
            onBeforeInput={(e: React.FormEvent<HTMLInputElement>) => {
              const inputEvent = e.nativeEvent as InputEvent
              if (inputEvent.inputType === 'insertCompositionText') return
              if (inputEvent.data && /[^0-9]/.test(inputEvent.data)) {
                inputEvent.preventDefault()
              }
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 disabled:bg-gray-100"
          />
          {draftValue !== '' && draftValue !== originalValue && (
            <button
              type="button"
              onClick={() => void saveEditing()}
              disabled={isPending}
              data-testid="caja-base-header-save"
              aria-label="Guardar base de caja"
              className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded disabled:opacity-50"
            >
              {isPending ? (
                <span className="inline-block w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={cancelEditing}
            disabled={isPending}
            data-testid="caja-base-header-cancel"
            aria-label="Cancelar edición"
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  // Modo view (con base o cerrado)
  const isReadOnly = !canEdit || state.status === 'cerrado'
  const tooltip = state.status === 'cerrado' ? 'Día cerrado, no se puede editar' : undefined

  if (isReadOnly) {
    return (
      <div
        className="px-4 py-3 border-b bg-gray-50"
        data-testid="caja-base-header-readonly"
        title={tooltip}
        aria-label={tooltip ?? 'Caja base'}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Caja base</span>
          <MoneyDisplay
            value={currentValue ? Number(currentValue) : null}
            userRole={userRole}
            className="text-sm font-semibold text-gray-800"
          />
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      onKeyDown={(e) => {
        // WAI-ARIA: F2 también entra en edit
        if (e.key === 'F2') {
          e.preventDefault()
          startEditing()
        }
      }}
      data-testid="caja-base-header-view"
      aria-label="Editar base de caja"
      title="Click para editar (Enter o F2)"
      className="w-full text-left px-4 py-3 border-b bg-gray-50 hover:bg-gray-100 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">Caja base</span>
        <MoneyDisplay
          value={currentValue ? Number(currentValue) : null}
          userRole={userRole}
          className="text-sm font-semibold text-gray-800"
        />
      </div>
    </button>
  )
}
