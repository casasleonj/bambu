import type { Pedido } from '../pedidos-client/types'
import { formatoTramo } from '@/lib/tramo-volumen'

export type AccionDetalleKey = 'editar' | 'enviar' | 'cancelar' | 'entregar' | 'entregar-retiro' | 'volver-pendiente' | 'anular' | 'registrar-entrega' | 'corregir-canal'

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
/** Pedido de un embarque que ya salió: el botón ya trae la respuesta (quién entregó). */
const ENTREGAR_REPARTIDOR: AccionDetalle = { key: 'entregar', label: '🚚 Entregó el repartidor', labelBusy: 'Entregando...', tone: 'primary' }
const ENTREGAR_RETIRO: AccionDetalle = { key: 'entregar-retiro', label: '🏢 Cliente retiró', labelBusy: 'Entregando...', tone: 'neutral' }
const VOLVER: AccionDetalle = { key: 'volver-pendiente', label: 'Volver a Pendiente', tone: 'neutral' }
const ANULAR: AccionDetalle = { key: 'anular', label: 'Anular Pedido', labelBusy: 'Anulando...', tone: 'danger' }
/** TEMPORAL-SIN-EMBARQUE(#472): el ADMIN registra la entrega desde la oficina, sin embarque. */
const REGISTRAR_ENTREGA: AccionDetalle = { key: 'registrar-entrega', label: 'Registrar entrega', tone: 'primary' }

/** TEMPORAL-SIN-EMBARQUE(#472): el ADMIN corrige el canal (PUNTO ↔ DOMICILIO) de un pedido abierto. */
const CORREGIR_CANAL: AccionDetalle = { key: 'corregir-canal', label: 'Corregir canal', tone: 'neutral' }

export interface OpcionesAcciones {
  /** TEMPORAL-SIN-EMBARQUE(#472): ADMIN con la gestión temporal activa. */
  gestionAdmin?: boolean
}

/**
 * Mismas acciones y rótulos que el modal anterior, ordenadas por estado.
 * Con el pedido en un embarque EN_RUTA, «Marcar Entregado» se divide en
 * «Entregó el repartidor» / «Cliente retiró»: el mismo clic de antes, sin pantallas
 * intermedias. En cualquier otro caso (sin embarque, o embarque que aún no sale)
 * sigue un solo botón y el sistema decide solo (ver `resolverEntrega`).
 */
export function accionesDetalle(estadoEntrega: string, embarqueEstado?: string | null, opciones: OpcionesAcciones = {}): AccionesDetalle {
  if (opciones.gestionAdmin) {
    const base = accionesDetalle(estadoEntrega, embarqueEstado)
    if (estadoEntrega === 'PENDIENTE') {
      return { primaria: REGISTRAR_ENTREGA, secundarias: [ENVIAR, CORREGIR_CANAL, ...base.secundarias], sinAcciones: null }
    }
    if (estadoEntrega === 'NO_ENTREGADO') {
      return { primaria: REGISTRAR_ENTREGA, secundarias: [CORREGIR_CANAL], sinAcciones: null }
    }
    if (estadoEntrega === 'EN_RUTA') {
      return { ...base, secundarias: [REGISTRAR_ENTREGA, ...base.secundarias] }
    }
    return base
  }
  switch (estadoEntrega) {
    case 'PENDIENTE':
      return { primaria: ENVIAR, secundarias: [EDITAR, CANCELAR], sinAcciones: null }
    case 'EN_RUTA':
      return embarqueEstado === 'EN_RUTA'
        ? { primaria: ENTREGAR_REPARTIDOR, secundarias: [ENTREGAR_RETIRO, VOLVER], sinAcciones: null }
        : { primaria: ENTREGAR, secundarias: [VOLVER], sinAcciones: null }
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

export interface OrigenPrecio {
  label: string
  tone: 'ok' | 'warn' | 'info' | 'neutral'
  /** Explicación corta (tooltip / lector de pantalla). */
  ayuda: string
}

/** Roles que pueden revisar un precio manual sin autorizar (ven la advertencia ámbar). */
export function puedeVerAlertaPrecioManual(rol: string | null | undefined): boolean {
  return rol === 'ADMIN' || rol === 'CONTADOR'
}

/**
 * Insignia del origen del precio guardado en la línea; `base` no lleva insignia.
 * El precio manual es una operación normal: se ve neutro para todos y solo
 * ADMIN/CONTADOR ven la advertencia "sin autorizar" (son quienes pueden revisarla).
 */
export function origenPrecio(
  item: {
    precioOrigen?: string
    autorizadoPorAdmin?: boolean
    tramoVolumen?: { cantMin: number; cantMax: number | null } | null
  },
  rol?: string | null,
): OrigenPrecio | null {
  switch (item.precioOrigen) {
    case 'manual':
      if (item.autorizadoPorAdmin) {
        return { label: 'manual ✓ autorizado', tone: 'ok', ayuda: 'Precio escrito a mano; un administrador lo autorizó.' }
      }
      return puedeVerAlertaPrecioManual(rol)
        ? { label: 'manual · sin autorizar', tone: 'warn', ayuda: 'Precio escrito a mano que ningún administrador ha autorizado. Conviene revisarlo.' }
        : { label: 'manual', tone: 'neutral', ayuda: 'Precio escrito a mano al crear el pedido.' }
    case 'volumen':
      return item.tramoVolumen
        ? { label: `volumen ${formatoTramo(item.tramoVolumen)}`, tone: 'info', ayuda: `Precio por volumen: tramo de ${formatoTramo(item.tramoVolumen)}.` }
        : { label: 'volumen', tone: 'info', ayuda: 'Precio por volumen según la cantidad pedida.' }
    case 'cliente':
      return { label: 'especial', tone: 'info', ayuda: 'Precio especial acordado con el cliente o su negocio.' }
    default:
      return null
  }
}
