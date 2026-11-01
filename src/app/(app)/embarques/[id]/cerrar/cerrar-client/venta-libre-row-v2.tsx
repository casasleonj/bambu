import { useMemo, useState } from 'react'
import { useProductosDomicilio } from '@/hooks/use-productos-domicilio'
import { useClienteSearch } from '@/hooks/use-cliente-search'
import { meetsMinSearchLength } from '@/lib/cliente-search'
import { ClienteResultado } from '@/components/pedido-form-unified/cliente-resultado'
import type { Cliente as ClienteBusqueda } from '@/components/pedido-form-unified/types'
import { formatCurrency } from '@/lib/utils'
import type { VentaLibre, PagoItem, Cliente } from './types'
import { METODOS_PAGO, calcularMontoPagado } from './types'
import { CONSUMIDOR_FINAL_ID, totalVentaLibre, validarVentaLibre, type PreciosVentaLibre } from './cierre-logic'

interface ProductoVentaCampo {
  key: keyof VentaLibre & string
  label: string
  codigo: string
}

const ALL_PRODUCTOS_VENTA: ProductoVentaCampo[] = [
  { key: 'cPacaAgua', label: 'Paca de agua', codigo: 'PACA_AGUA' },
  { key: 'cPacaHielo', label: 'Paca de hielo', codigo: 'PACA_HIELO' },
  // El botellón es UNA sola línea: la venta libre se resuelve a precio de domicilio.
  { key: 'cBotellonDom', label: 'Botellón', codigo: 'BOTELLON' },
  { key: 'cBolsaAgua', label: 'Bolsa de agua', codigo: 'BOLSA_AGUA' },
  { key: 'cBolsaHielo', label: 'Bolsa de hielo', codigo: 'BOLSA_HIELO' },
]

interface VentaLibreRowV2Props {
  venta: VentaLibre
  index: number
  clientes: Cliente[]
  precios: PreciosVentaLibre
  onUpdate: (index: number, field: keyof VentaLibre, value: unknown) => void
  onAgregarPago: (ventaIndex: number) => void
  onEliminarPago: (ventaIndex: number, pagoIndex: number) => void
  onUpdatePago: (ventaIndex: number, pagoIndex: number, field: keyof PagoItem, value: string | number) => void
  onRemove: (index: number) => void
}

export function VentaLibreRowV2({
  venta,
  index,
  clientes,
  precios,
  onUpdate,
  onAgregarPago,
  onEliminarPago,
  onUpdatePago,
  onRemove,
}: VentaLibreRowV2Props) {
  const { productos: productosDomicilio } = useProductosDomicilio()
  const domicilioCodes = new Set(productosDomicilio.map((p) => p.codigo))
  const productos = ALL_PRODUCTOS_VENTA.filter((p) => domicilioCodes.has(p.codigo))
  const [termino, setTermino] = useState('')

  const listaLocal = useMemo<ClienteBusqueda[]>(
    () => clientes.map((c) => ({ ...c, apellido: c.apellido ?? undefined })),
    [clientes],
  )
  const { resultados, buscando, error, reintentar } = useClienteSearch(termino, listaLocal)

  const total = totalVentaLibre(venta, precios)
  const pagado = calcularMontoPagado(venta.pagos)
  const saldo = Math.max(0, total - pagado)
  const motivos = validarVentaLibre(venta, total)
  const hayCliente = Boolean(venta.clienteId)

  function elegir(c: ClienteBusqueda) {
    const nombre = `${c.nombre}${c.apellido ? ` ${c.apellido}` : ''}`
    onUpdate(index, 'clienteId', c.id)
    onUpdate(index, 'clienteNombre', nombre)
    onUpdate(index, 'anonima', false)
    onUpdate(index, 'clienteBloqueado', Boolean(c.bloqueado))
    setTermino('')
  }

  function ventaAlPaso() {
    onUpdate(index, 'clienteId', CONSUMIDOR_FINAL_ID)
    onUpdate(index, 'clienteNombre', 'Venta al paso (sin cliente)')
    onUpdate(index, 'anonima', true)
    onUpdate(index, 'clienteBloqueado', false)
    setTermino('')
  }

  function cambiarCliente() {
    onUpdate(index, 'clienteId', '')
    onUpdate(index, 'clienteNombre', '')
    onUpdate(index, 'anonima', false)
    onUpdate(index, 'clienteBloqueado', false)
  }

  function cobrarTotal() {
    if (total <= 0) return
    if (venta.pagos.length === 0) {
      onAgregarPago(index)
      onUpdatePago(index, 0, 'monto', total)
    } else {
      onUpdatePago(index, venta.pagos.length - 1, 'monto', Math.max(0, total - (pagado - (venta.pagos[venta.pagos.length - 1].monto || 0))))
    }
  }

  return (
    <div className="mb-3 space-y-3 rounded-lg border p-3" data-testid={`venta-libre-v2-${index}`}>
      {hayCliente ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-blue-50 p-3">
          <div>
            <div className="text-sm font-semibold">{venta.clienteNombre}</div>
            {venta.clienteBloqueado && <div className="text-xs font-medium text-red-700">Cliente bloqueado: no se le puede dejar saldo.</div>}
            {venta.anonima && <div className="text-xs text-gray-600">Pago completo obligatorio.</div>}
          </div>
          <button type="button" onClick={cambiarCliente} className="min-h-11 rounded-lg border bg-white px-3 text-sm">
            Cambiar
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700" htmlFor={`vl-buscar-${index}`}>
            ¿A quién se le vendió?
          </label>
          <input
            id={`vl-buscar-${index}`}
            type="search"
            value={termino}
            onChange={(e) => setTermino(e.target.value)}
            placeholder="Nombre, apellido, tienda o celular"
            className="h-11 w-full rounded-lg border px-3 text-sm"
            autoComplete="off"
          />
          {meetsMinSearchLength(termino.trim()) && (
            <div className="rounded-lg border bg-white" data-testid="vl-resultados">
              {resultados.map((c) => (
                <ClienteResultado key={c.id} cliente={c} term={termino.trim()} onSelect={(sel) => elegir(sel)} />
              ))}
              {resultados.length === 0 && !buscando && !error && (
                <p className="p-3 text-sm text-gray-500">Sin resultados para «{termino.trim()}».</p>
              )}
              {buscando && <p className="p-3 text-sm text-gray-400">Buscando…</p>}
              {error && (
                <p className="p-3 text-sm text-amber-700">
                  No se pudo buscar en el servidor.{' '}
                  <button type="button" onClick={reintentar} className="underline">Reintentar</button>
                </p>
              )}
            </div>
          )}
          <button type="button" onClick={ventaAlPaso} className="min-h-11 rounded-lg border bg-white px-3 text-sm" data-testid="vl-venta-al-paso">
            Venta al paso (sin cliente)
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {productos.map(({ key, label, codigo }) => (
          <div key={key} className="min-w-0">
            <label className="text-xs text-gray-500" htmlFor={`vl-${index}-${key}`}>{label}</label>
            <input
              id={`vl-${index}-${key}`}
              type="number"
              inputMode="numeric"
              min={0}
              value={venta[key] as number}
              onChange={(e) => onUpdate(index, key, Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="h-11 w-full rounded-lg border px-2 text-sm"
            />
            <div className="text-[11px] text-gray-400">{precios[codigo as keyof PreciosVentaLibre] ? formatCurrency(precios[codigo as keyof PreciosVentaLibre] as number) : 'precio al guardar'} c/u</div>
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-lg bg-gray-50 p-3">
        <div className="flex justify-between text-sm"><span>Total estimado</span><b>{formatCurrency(total)}</b></div>
        <p className="text-[11px] text-gray-500">El servidor fija el precio final (domicilio, sin precios especiales de la tienda).</p>
        {venta.pagos.map((pago, pIdx) => (
          <div key={pIdx} className="flex gap-2">
            <select
              aria-label="Método de pago"
              value={pago.metodo}
              onChange={(e) => onUpdatePago(index, pIdx, 'metodo', e.target.value)}
              className="h-11 max-w-[45%] shrink-0 rounded-lg border px-2 text-sm"
            >
              {METODOS_PAGO.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              aria-label="Monto cobrado"
              value={pago.monto}
              onChange={(e) => onUpdatePago(index, pIdx, 'monto', parseFloat(e.target.value) || 0)}
              className="h-11 min-w-0 flex-1 rounded-lg border px-3 text-sm"
              placeholder="Monto"
            />
            <button type="button" aria-label="Quitar pago" onClick={() => onEliminarPago(index, pIdx)} className="h-11 w-11 shrink-0 rounded-lg text-red-600 hover:bg-red-50">
              ✕
            </button>
          </div>
        ))}
        <div className="flex gap-3">
          <button type="button" onClick={() => onAgregarPago(index)} className="min-h-11 text-sm font-medium text-blue-600">+ Agregar pago</button>
          {total > 0 && saldo > 0.01 && (
            <button type="button" onClick={cobrarTotal} className="min-h-11 text-sm font-medium text-blue-600" data-testid="vl-cobrar-total">
              Cobrar el total
            </button>
          )}
        </div>
        <div className={`rounded-lg p-2 text-sm font-semibold ${saldo > 0.01 ? 'bg-amber-100 text-amber-900' : 'bg-green-100 text-green-800'}`} data-testid="vl-saldo">
          {saldo > 0.01 ? `Queda por cobrar ${formatCurrency(saldo)}${hayCliente && !venta.anonima ? ` → fiado de ${venta.clienteNombre}` : ''}` : total > 0 ? 'Pagado completo' : 'Sin productos todavía'}
        </div>
      </div>

      {motivos.length > 0 && (
        <ul className="space-y-1 text-sm text-red-700" data-testid="vl-motivos">
          {motivos.map((m) => (
            <li key={m}>• {m}</li>
          ))}
        </ul>
      )}

      <button type="button" onClick={() => onRemove(index)} className="min-h-11 rounded-lg px-3 text-sm text-red-600 hover:bg-red-50">
        Eliminar venta
      </button>
    </div>
  )
}
