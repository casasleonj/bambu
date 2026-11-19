/**
 * #836 F2b — «Programar entrega» al crear un pedido: de lo que escribe la persona (fecha y/o hora)
 * a lo que se guarda (`fechaEntrega` + `entregaNoAntesDe`). Sin nada, no se guarda nada: el pedido
 * se comporta como hoy y quien no programa no nota cambios.
 *
 *  - Hora sin fecha  → hoy (hora de Bogotá) con esa hora.
 *  - Hoy sin hora    → nada (equivale al comportamiento por defecto).
 *  - Fecha pasada    → error (se puede cambiar después, pero no se crea ya vencido).
 */
import { esHoraValida } from '@/lib/pedidos-franja'

export interface ProgramacionEntrega {
  fechaEntrega?: string
  entregaNoAntesDe?: string
  error?: string
}

export function resolverProgramacion(fecha: string, hora: string, hoyBogota: string): ProgramacionEntrega {
  const f = fecha.trim()
  const h = hora.trim()
  if (h && !esHoraValida(h)) return { error: 'La hora debe tener formato HH:MM.' }
  if (f && !/^\d{4}-\d{2}-\d{2}$/.test(f)) return { error: 'Elige una fecha válida.' }
  if (f && f < hoyBogota) return { error: 'La fecha ya pasó. Elige hoy o una fecha futura.' }
  const dia = f || hoyBogota
  const fechaNormalizada = new Date(`${dia}T12:00:00-05:00`)
  // JS normaliza algunos días imposibles (p. ej. 30 de febrero); no aceptarlos.
  if (!Number.isFinite(fechaNormalizada.getTime()) || fechaNormalizada.toISOString().slice(0, 10) !== dia) return { error: 'Elige una fecha válida.' }
  if (dia === hoyBogota && !h) return {}
  return {
    // Mediodía de Bogotá: el día calendario no deriva por zona horaria (#753).
    fechaEntrega: fechaNormalizada.toISOString(),
    ...(h ? { entregaNoAntesDe: h } : {}),
  }
}
