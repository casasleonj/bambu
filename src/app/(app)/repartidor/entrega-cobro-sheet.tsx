'use client'

/**
 * Hoja «Entregado» del repartidor (issue #318): entrega + cobro en un solo toque.
 *
 * - El GPS se toma solo al abrir; si no se logra, se pide un motivo de una lista corta
 *   (queda registrado para revisión, no bloquea al repartidor frente al cliente).
 * - La foto es obligatoria.
 * - El estado de pago NO se elige: se anticipa («pagado / parcial / fiado») a partir
 *   de lo cobrado. Dejar deuda solo es posible si la oficina ya la aceptó (regla del
 *   servidor, opción A del PO); si no, la hoja explica que no se entrega.
 * - Sin red, `fetchResilient` encola el envío con el mismo `offlineId`: al volver la
 *   señal no se cobra dos veces.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { Modal } from '@/components/modal'
import { fetchResilient } from '@/lib/fetch-resilient'
import { generateUUID } from '@/lib/uuid'
import { formatCurrency } from '@/lib/utils'
import { compressImage } from '@/lib/image-compress'
import { capturarGpsSilencioso } from '@/lib/gps-silencioso'
import { resolverEntrega } from '@/lib/entrega-quien'
import { calcularCobroEntrega } from '@/lib/cobro-entrega'
import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'
import type { GPSCoordinates } from '@/lib/gps'

export interface PedidoParaEntregar {
  id: string
  numero: number
  clienteId: string
  nombre: string
  saldo: number
  promesaPagoFecha?: string | null
  items: Array<{ producto: string; cantPedido: number; cantEntrega: number }>
}

export const METODOS_COBRO = ['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO'] as const

export const MOTIVOS_SIN_GPS = [
  'Sin señal de satélite',
  'Dentro de un edificio',
  'Permiso de ubicación denegado',
] as const

interface Props {
  pedido: PedidoParaEntregar | null
  embarque: { id: string; estado: string }
  /** La config oculta precios al repartidor: no cobra, solo entrega. */
  preciosOcultos?: boolean
  onClose: () => void
  /** `offline` = quedó encolado para enviarse al volver la señal. */
  onDone: (r: { pedidoId: string; offline: boolean }) => void
}

export function EntregaCobroSheet({ pedido, embarque, preciosOcultos = false, onClose, onDone }: Props) {
  return (
    <Modal open={pedido !== null} onClose={onClose} className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-md w-full max-h-[92vh] overflow-y-auto">
      {pedido && <Contenido key={pedido.id} pedido={pedido} embarque={embarque} preciosOcultos={preciosOcultos} onClose={onClose} onDone={onDone} />}
    </Modal>
  )
}

function Contenido({ pedido, embarque, preciosOcultos, onClose, onDone }: Omit<Props, 'pedido'> & { pedido: PedidoParaEntregar }) {
  // Una clave por apertura de la hoja: el reintento tras un error o timeout la reutiliza.
  const offlineId = useRef(generateUUID()).current
  const fileRef = useRef<HTMLInputElement>(null)

  const [metodo, setMetodo] = useState<(typeof METODOS_COBRO)[number]>('EFECTIVO')
  const [monto, setMonto] = useState(String(pedido.saldo))
  const [foto, setFoto] = useState<string | null>(null)
  const [gps, setGps] = useState<GPSCoordinates | null>(null)
  const [gpsListo, setGpsListo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vivo = true
    void capturarGpsSilencioso(5000).then((c) => {
      if (!vivo) return
      setGps(c)
      setGpsListo(true)
    })
    return () => { vivo = false }
  }, [])

  const cobra = !preciosOcultos && pedido.saldo > 0
  const cobro = useMemo(
    () => calcularCobroEntrega({
      saldo: cobra ? pedido.saldo : 0,
      monto: Number(monto),
      deudaAceptada: Boolean(pedido.promesaPagoFecha),
      esAnonimo: pedido.clienteId === CANONICAL_CONSUMIDOR_FINAL_ID,
    }),
    [cobra, pedido.saldo, pedido.promesaPagoFecha, pedido.clienteId, monto],
  )

  const sinGpsPendiente = gpsListo && !gps && !motivo
  const puede = cobro.permitido && Boolean(foto) && gpsListo && !sinGpsPendiente && !enviando

  const textoBoton = !cobra || cobro.estado === 'PAGADO'
    ? (cobra ? `Cobrar ${formatCurrency(cobro.montoAplicado)} y entregar` : 'Entregar')
    : cobro.estado === 'PARCIAL' ? 'Entregar y dejar parcial' : 'Entregar y dejar fiado'

  const onFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setFoto(await compressImage(file, { maxDimension: 1280, quality: 0.8 }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo procesar la foto')
    }
  }

  const confirmar = async () => {
    if (!puede || !foto) return
    const { embarqueEntregaId } = resolverEntrega({ embarqueId: embarque.id, embarqueEstado: embarque.estado, quien: 'REPARTIDOR' })
    setEnviando(true)
    try {
      const itemsEntregados = pedido.items
        .map((i) => ({ producto: i.producto, cantidad: Math.max(0, i.cantPedido - i.cantEntrega) }))
        .filter((i) => i.cantidad > 0)
      const hayCobro = cobra && cobro.montoAplicado > 0
      const r = await fetchResilient<{ success: boolean; deduped?: boolean; pagosNoAplicados?: boolean }>(
        `/api/pedidos/${pedido.id}/entrega`,
        {
          method: 'POST',
          localEndpoint: 'entregar-pedido',
          body: {
            itemsEntregados,
            pagos: hayCobro ? [{ metodo, monto: cobro.montoAplicado }] : [],
            ...(hayCobro ? { embarqueId: embarque.id } : {}),
            ...(embarqueEntregaId ? { embarqueEntregaId } : {}),
            fotoEntrega: foto,
            ...(gps ? { gpsLat: gps.lat, gpsLng: gps.lng, gpsAccuracy: gps.accuracy } : { gpsJustificacion: motivo, entregadoConGps: false }),
            offlineId,
          },
        },
      )
      if (r.status === 'ok') {
        if (r.data.pagosNoAplicados) {
          toast.warning('Este pedido ya estaba entregado: el cobro NO se registró. Avisa a la oficina.', { duration: 12000 })
        } else {
          toast.success(r.data.deduped ? 'Este pedido ya estaba entregado.' : 'Entrega registrada')
        }
        onDone({ pedidoId: pedido.id, offline: false })
        return
      }
      if (r.status === 'offline') {
        toast.info('Sin conexión. La entrega quedó guardada y se enviará al volver la señal.')
        onDone({ pedidoId: pedido.id, offline: true })
        return
      }
      toast.error(r.error)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div data-testid="entrega-cobro-sheet">
      <div className="p-4 border-b flex justify-between items-center bg-emerald-50 rounded-t-2xl">
        <div>
          <h2 className="text-lg font-bold text-emerald-800">Entregar #{pedido.numero}</h2>
          <p className="text-xs text-emerald-700">{pedido.nombre}</p>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="text-gray-500 p-2 rounded-lg hover:bg-white/60">✕</button>
      </div>

      <div className="p-4 space-y-4">
        {cobra && (
          <section className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Debe</span>
              <span className="text-lg font-bold" data-testid="cobro-debe">{formatCurrency(pedido.saldo)}</span>
            </div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="cobro-monto">Cobrado</label>
            <input
              id="cobro-monto"
              data-testid="cobro-monto"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value.replace(/[^0-9.]/g, ''))}
              className="w-full rounded-lg border px-3 py-3 text-lg"
            />
            <div className="flex flex-wrap gap-2">
              {METODOS_COBRO.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetodo(m)}
                  data-testid={`cobro-metodo-${m}`}
                  className={`px-3 py-2 rounded-full text-xs font-medium border ${metodo === m ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700'}`}
                >
                  {m}
                </button>
              ))}
            </div>
            {metodo !== 'EFECTIVO' && cobro.montoAplicado > 0 && (
              <p className="text-xs text-gray-500">Se registra como reportado; la oficina lo confirma.</p>
            )}
            <p
              data-testid="cobro-mensaje"
              className={`text-sm rounded-lg px-3 py-2 ${cobro.permitido ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}
            >
              {cobro.estado !== 'PAGADO' && <strong>Quedan {formatCurrency(cobro.restante)}. </strong>}
              {cobro.mensaje}
            </p>
          </section>
        )}

        <section>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFoto} data-testid="entrega-foto-input" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            data-testid="entrega-foto-btn"
            className={`w-full py-3 rounded-lg border-2 border-dashed text-sm font-medium ${foto ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-300 bg-gray-50 text-gray-600'}`}
          >
            {foto ? '📷 Foto lista (toca para cambiarla)' : '📷 Tomar foto de la entrega'}
          </button>
          {foto && (
            <div className="relative mt-2 h-28 rounded-lg overflow-hidden">
              <Image src={foto} alt="Entrega" fill unoptimized className="object-cover" />
            </div>
          )}
        </section>

        <section className="text-xs" data-testid="entrega-gps-estado">
          {!gpsListo && <p className="text-gray-500">📍 Tomando ubicación…</p>}
          {gpsListo && gps && <p className="text-green-700">📍 Ubicación lista</p>}
          {gpsListo && !gps && (
            <div className="space-y-1">
              <p className="text-amber-700">📍 No se pudo tomar la ubicación. Elige el motivo para continuar (queda registrado):</p>
              <select
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                data-testid="entrega-gps-motivo"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Selecciona un motivo…</option>
                {MOTIVOS_SIN_GPS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}
        </section>

        <button
          type="button"
          disabled={!puede}
          onClick={confirmar}
          data-testid="entrega-confirmar"
          className="w-full py-4 rounded-xl bg-emerald-600 text-white font-semibold text-base disabled:opacity-50"
        >
          {enviando ? 'Enviando…' : textoBoton}
        </button>
        {!cobro.permitido && (
          <button type="button" onClick={onClose} data-testid="entrega-no-entregar" className="w-full py-3 rounded-xl border text-sm text-gray-700">
            No entregar (se devuelve en el embarque)
          </button>
        )}
      </div>
    </div>
  )
}
