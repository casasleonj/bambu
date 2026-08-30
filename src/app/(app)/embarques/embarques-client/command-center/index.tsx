'use client'

import { useMemo } from 'react'
import { EmptyState } from '@/components/empty-state'
import { useOnlineStatus } from '@/hooks/use-online-status'
import {
  FASES_ORDEN,
  derivarEstadoUI,
  toUIEstadoInput,
  type FaseUIEmbarque,
} from '@/lib/embarque-ui-estado'
import type { Embarque } from '../types'
import { FaseSection } from './fase-section'
import { KpiRow } from './kpi-row'

/**
 * Command Center (Fase 3) — reemplaza la lista plana de la tab "Embarques".
 *
 * Regla central: los embarques se agrupan por FASE DERIVADA en cliente
 * (`derivarEstadoUI`), nunca por un estado nuevo persistido. El backend sigue
 * teniendo 4 estados reales. Ver docs/embarques/01-ux-contract.md §2.
 *
 * Estado de red: si `online` es false, muestra un badge y conserva los datos
 * que ya tenía (no navega a ErrorState). No hay caché de lista en Dexie en
 * este repo — decisión documentada en docs/embarques/fase3-command-center.md.
 */
export function CommandCenter({
  embarques,
  onNuevo,
}: {
  embarques: Embarque[]
  onNuevo: () => void
}) {
  const online = useOnlineStatus()

  const porFase = useMemo(() => {
    const map = new Map<FaseUIEmbarque, Embarque[]>()
    for (const fase of FASES_ORDEN) map.set(fase, [])
    for (const e of embarques) {
      const fase = derivarEstadoUI(toUIEstadoInput(e)).fase
      map.get(fase)!.push(e)
    }
    return map
  }, [embarques])

  if (embarques.length === 0) {
    return (
      <div data-testid="command-center">
        <EmptyState
          icon={<span className="text-3xl">📦</span>}
          title="No hay embarques"
          description="Los embarques agrupan pedidos por zona para optimizar las rutas de entrega. Si buscás embarques de días anteriores, usá el filtro de fecha o «Ver últimos 30 días»."
          actionLabel="+ Crear Embarque"
          onAction={onNuevo}
        />
      </div>
    )
  }

  return (
    <div data-testid="command-center">
      {!online && (
        <div
          data-testid="command-center-offline-badge"
          className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm"
        >
          <span aria-hidden="true">📴</span>
          Sin conexión — se actualiza al reconectar
        </div>
      )}

      <KpiRow embarques={embarques} />

      {/* Un solo árbol: columnas por fase en desktop (`lg:grid-cols-3`),
          secciones apiladas en mobile. Sin duplicación desktop/mobile. */}
      <div
        data-testid="command-center-grid"
        className="grid gap-4 lg:grid-cols-3 items-start"
      >
        {FASES_ORDEN.map((fase) => (
          <FaseSection key={fase} fase={fase} embarques={porFase.get(fase)!} />
        ))}
      </div>
    </div>
  )
}
