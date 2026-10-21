import type { Pedido } from '../pedidos-client/types'

export type AccionDetalleKey = 'editar' | 'enviar' | 'cancelar' | 'entregar' | 'volver-pendiente' | 'anular'

export interface AccionDetalle {
  key: AccionDetalleKey
  label: string
  /** Texto mientras la acción está en curso (updatingId). */
  labelBusy?: string
  tone: 'primary' | 'warn' | 'neutral' | 'danger'
}

export interface AccionesDetalle {
  primaria: AccionDetalle | null
  secundarias: AccionDetalle[]
  /** Mensaje cuando el estado ya no admite acciones. */
  sinAcciones: string | null
}

const EDITAR: AccionDetalle = { key: 'editar', label: '✏️ Editar', tone: 'warn' }
const ENVIAR: AccionDetalle = { key: 'enviar', label: '🚚 Enviar', labelBusy: 'Enviando...', tone: 'primary' }
const CANCELAR: AccionDetalle = { key: 'cancelar', label: 'Cancelar', tone: 'neutral' }
const ENTREGAR: AccionDetalle = { key: 'entregar', label: '✅ Marcar Entregado', labelBusy: 'Entregando...', tone: 'primary' }
const VOLVER: AccionDetalle = { key: 'volver-pendiente', label: 'Volver a Pendiente', tone: 'neutral' }
const ANULAR: AccionDetalle = { key: 'anular', label: 'Anular Pedido', labelBusy: 'Anulando...', tone: 'danger' }

/** Mismas acciones y rótulos que el modal anterior, ordenadas por estado. */
export function accionesDetalle(estadoEntrega: string): AccionesDetalle {
  switch (estadoEntrega) {
    case 'PENDIENTE':
      return { primaria: ENVIAR, secundarias: [EDITAR, CANCELAR], sinAcciones: null }
    case 'EN_RUTA':
      return { primaria: ENTREGAR, secundarias: [VOLVER], sinAcciones: null }
    case 'ENTREGADO':
      return { primaria: null, secundarias: [ANULAR], sinAcciones: null }
    case 'CANCELADO':
      return { primaria: null, secundarias: [], sinAcciones: 'Pedido cancelado — Sin acciones disponibles' }
    case 'ANULADO':
      return { primaria: null, secundarias: [], sinAcciones: 'Pedido anulado — Sin acciones disponibles' }
    default:
      return { primaria: null, secundarias: [], sinAcciones: null }
  }
}

export interface PasoTiempo {
  key: 'creado' | 'en-ruta' | 'entregado'
  label: string
  estado: 'hecho' | 'actual' | 'pendiente' | 'cerrado'
  /** Fecha ISO real, o null si aún no ocurre / no hay dato. */
  fecha: string | null
  detalle: string | null
}

/** Línea de tiempo con datos reales (nada inventado: sin dato → fecha null). */
export function lineaDeTiempo(p: Pedido): PasoTiempo[] {
  const e = p.estadoEntrega
  const cerrado = e === 'CANCELADO' || e === 'ANULADO'
  const enRutaAlcanzado = e === 'EN_RUTA' || e === 'ENTREGADO'
  const embarque = p.embarqueResumen
  const rutaDetalle = embarque
    ? `Embarque #${embarque.numeroDia}${embarque.repartidor ? ` · ${embarque.repartidor}` : ''}`
    : null
  const fechaEntrega = p.entregaResumen?.fecha ?? p.entregadoAt ?? p.fechaEntrega ?? null
  return [
    {
      key: 'creado',
      label: 'Creado',
      estado: e === 'PENDIENTE' ? 'actual' : 'hecho',
      fecha: p.fecha,
      detalle: p.creadoPor ? `por ${p.creadoPor}` : null,
    },
    {
      key: 'en-ruta',
      label: 'En Ruta',
      estado: cerrado ? 'cerrado' : e === 'EN_RUTA' ? 'actual' : enRutaAlcanzado ? 'hecho' : 'pendiente',
      fecha: enRutaAlcanzado ? (embarque?.horaSalida ?? null) : null,
      detalle: enRutaAlcanzado ? rutaDetalle : null,
    },
    {
      key: 'entregado',
      label: 'Entregado',
      estado: cerrado ? 'cerrado' : e === 'ENTREGADO' ? 'hecho' : 'pendiente',
      fecha: e === 'ENTREGADO' ? fechaEntrega : null,
      detalle: null,
    },
  ]
}

/** Deja solo dígitos; antepone 57 (Colombia) si faltan. */
export function telefonoWhatsapp(telefono: string): string | null {
  const d = telefono.replace(/\D/g, '')
  if (d.length < 7) return null
  return d.length === 10 ? `57${d}` : d
}

export interface LinksContacto {
  llamar: string | null
  whatsapp: string | null
  mapa: string | null
}

export function linksContacto(p: Pick<Pedido, 'telefonoCli' | 'lat' | 'lng' | 'zonaCli' | 'barrioCli'>): LinksContacto {
  const tel = (p.telefonoCli ?? '').replace(/[^\d+]/g, '')
  const wa = telefonoWhatsapp(p.telefonoCli ?? '')
  const tieneCoords = typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  const texto = [p.zonaCli, p.barrioCli].filter(Boolean).join(', ')
  return {
    llamar: tel.length >= 7 ? `tel:${tel}` : null,
    whatsapp: wa ? `https://wa.me/${wa}` : null,
    mapa: tieneCoords
      ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`
      : texto
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(texto)}`
        : null,
  }
}

/** Porcentaje pagado acotado a 0–100. */
export function porcentajePagado(total: number, pagado: number): number {
  if (!(total > 0)) return 0
  return Math.max(0, Math.min(100, Math.round((pagado / total) * 100)))
}
