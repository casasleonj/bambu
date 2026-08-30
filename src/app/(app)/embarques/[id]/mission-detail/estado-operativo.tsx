'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import type { EmbarqueDeudaResumen, EmbarqueResponsibilityCaseResumen, EmbarqueDetalle } from '../types'

/**
 * Estado operativo (Fase 5) — panel de excepciones abiertas del embarque.
 *
 * Lee las excepciones de datos REALES del backend (taxonomía de
 * `docs/embarques/03-exception-model.md`), nunca inventa tipos:
 *  - `PHYSICAL_MISMATCH` ← `ResponsibilityCase` DISCREPANCIA_INVENTARIO abierto ·
 *    `RecoveryDecision` SOBRANTE/FALTANTE · discrepancia de `EmbarqueProducto`
 *    (devueltas/cambios/rotas > 0).
 *  - `MONEY_MISMATCH`   ← `ResponsibilityCase` FALTANTE_CAJA / FIADO_NO_COBRADO
 *    abierto (contrato §13: el cierre ya no crea deuda automática, deja el caso
 *    PENDIENTE). `DeudaTrabajador` con saldo se mantiene como fuente legacy
 *    (embarques pre-migración / deuda ya materializada).
 *
 * El panel se renderiza solo si hay ≥1 excepción (aceptación Fase 5 §1):
 * sin excepciones no aparece. Cada fila lleva un CTA accionable (touch ≥44px).
 */

export type TipoExcepcion = 'PHYSICAL_MISMATCH' | 'MONEY_MISMATCH'

export interface ExcepcionUI {
  tipo: TipoExcepcion
  titulo: string
  descripcion: string
  ctaLabel: string
  cta: 'fisico' | 'trabajador'
}

export interface RecoveryResumen {
  id: string
  tipo: 'SOBRANTE' | 'FALTANTE'
  producto: string
  cantidad: number
}

export interface DerivarExcepcionesInput {
  deudas?: EmbarqueDeudaResumen[]
  responsibilityCases?: EmbarqueResponsibilityCaseResumen[]
  productos?: EmbarqueDetalle['productos']
  recovery?: RecoveryResumen[]
}

const RESPONSABILIDAD_LABEL: Record<string, string> = {
  FALTANTE_CAJA: 'Faltante de caja',
  DISCREPANCIA_INVENTARIO: 'Discrepancia de inventario',
  FIADO_NO_COBRADO: 'Fiado sin cobrar',
}

export function derivarExcepciones(input: DerivarExcepcionesInput): ExcepcionUI[] {
  const excepciones: ExcepcionUI[] = []

  // Casos de responsabilidad ABIERTOS (contrato §13). Es la fuente canónica de
  // MONEY_MISMATCH y de la discrepancia de inventario elevada a caso.
  for (const c of input.responsibilityCases ?? []) {
    const esFisico = c.tipo === 'DISCREPANCIA_INVENTARIO'
    const monto = c.montoEstimado != null && c.montoEstimado > 0
      ? ` · estimado ${c.montoEstimado.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}`
      : ''
    excepciones.push({
      tipo: esFisico ? 'PHYSICAL_MISMATCH' : 'MONEY_MISMATCH',
      titulo: RESPONSABILIDAD_LABEL[c.tipo] ?? 'Responsabilidad pendiente',
      descripcion: `${c.descripcion || c.tipo}${monto} — pendiente de resolución autorizada`,
      ctaLabel: esFisico ? 'Resolver en Físico' : 'Ver trabajador',
      cta: esFisico ? 'fisico' : 'trabajador',
    })
  }

  // Discrepancia física desde la carga (EmbarqueProducto): unidades que no
  // volvieron enteras — devueltas / cambios / rotas.
  for (const p of input.productos ?? []) {
    const devueltas = p.devueltas ?? 0
    const cambios = p.cambios ?? 0
    const rotas = p.rotas ?? 0
    if (devueltas <= 0 && cambios <= 0 && rotas <= 0) continue
    const label = getProductoIconConfig(p.producto).label
    const detalle: string[] = []
    if (devueltas > 0) detalle.push(`${devueltas} devueltas`)
    if (cambios > 0) detalle.push(`${cambios} cambios`)
    if (rotas > 0) detalle.push(`${rotas} rotas`)
    excepciones.push({
      tipo: 'PHYSICAL_MISMATCH',
      titulo: `Discrepancia física: ${label}`,
      descripcion: detalle.join(' · '),
      ctaLabel: 'Resolver en Físico',
      cta: 'fisico',
    })
  }

  // Sobrantes / faltantes (recovery): desviación del inventario de ruta.
  for (const r of input.recovery ?? []) {
    const label = getProductoIconConfig(r.producto).label
    const esSobrante = r.tipo === 'SOBRANTE'
    excepciones.push({
      tipo: 'PHYSICAL_MISMATCH',
      titulo: esSobrante ? `Sobrante: ${label}` : `Faltante: ${label}`,
      descripcion: `${r.cantidad} ${label} ${esSobrante ? 'sobrantes' : 'faltantes'}`,
      ctaLabel: 'Resolver en Físico',
      cta: 'fisico',
    })
  }

  // Fuente legacy: DeudaTrabajador ya materializada con saldo pendiente
  // (embarques pre-migración, o deuda creada por una resolución con cargo).
  for (const d of input.deudas ?? []) {
    if (d.montoPendiente <= 0) continue
    excepciones.push({
      tipo: 'MONEY_MISMATCH',
      titulo: 'Deuda del trabajador',
      descripcion: d.descripcion || d.tipo,
      ctaLabel: 'Ver trabajador',
      cta: 'trabajador',
    })
  }

  return excepciones
}

export function EstadoOperativo({
  embarqueId,
  deudas,
  responsibilityCases,
  productos,
  trabajadorId,
  onGoFisico,
}: {
  embarqueId: string
  deudas?: EmbarqueDeudaResumen[]
  responsibilityCases?: EmbarqueResponsibilityCaseResumen[]
  productos?: EmbarqueDetalle['productos']
  trabajadorId: string
  onGoFisico?: () => void
}) {
  const [recovery, setRecovery] = useState<RecoveryResumen[]>([])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/embarques/${embarqueId}/recovery`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.success) {
          setRecovery(
            (data.recovery || []).map((r: RecoveryResumen) => ({
              id: r.id,
              tipo: r.tipo,
              producto: r.producto,
              cantidad: r.cantidad,
            })),
          )
        }
      })
      .catch(() => {
        // Sin conexión o error: el panel simplemente no muestra recovery.
      })
    return () => {
      cancelled = true
    }
  }, [embarqueId])

  const excepciones = derivarExcepciones({ deudas, responsibilityCases, productos, recovery })

  if (excepciones.length === 0) return null

  return (
    <div data-testid="estado-operativo" className="bg-white rounded-xl shadow overflow-hidden border border-amber-200">
      <div className="px-4 py-3 border-b bg-amber-50/60 flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <h2 className="text-sm font-semibold text-amber-800">
          Estado operativo — {excepciones.length} pendiente{excepciones.length > 1 ? 's' : ''}
        </h2>
      </div>
      <ul className="divide-y divide-gray-100">
        {excepciones.map((e, i) => (
          <li
            key={`${e.tipo}-${i}`}
            className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{e.titulo}</p>
              <p className="text-xs text-gray-500">{e.descripcion}</p>
            </div>
            {e.cta === 'fisico' && onGoFisico && (
              <button
                data-testid="estado-operativo-cta-fisico"
                onClick={onGoFisico}
                className="min-h-[44px] shrink-0 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition"
              >
                {e.ctaLabel}
              </button>
            )}
            {e.cta === 'trabajador' && (
              <Link
                href={`/trabajadores/${trabajadorId}`}
                data-testid="estado-operativo-cta-trabajador"
                className="min-h-[44px] shrink-0 inline-flex items-center px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition"
              >
                {e.ctaLabel}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
