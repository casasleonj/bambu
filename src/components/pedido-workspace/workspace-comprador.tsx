'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { celularLegible, explicarCoincidencia } from '@/lib/cliente-coincidencia'
import { nombreCompleto, opcionesComprador, type NegocioComprador, type OpcionComprador } from '@/lib/comprador-opciones'
import { TipoNegocioSelect } from '@/components/tipo-negocio-select'
import { Motivo, Resaltado } from '@/components/pedido-form-unified/cliente-resultado'
import type { NuevoClienteForm } from '@/components/pedido-form-unified/pedido-context-panel'
import type { Cliente } from '@/components/pedido-form-unified/types'
import type { PatronConsumo } from '@/components/pedido-form-unified'
import type { FiadoStatus } from '@/modules/pedidos/domain/types'

const FUENTES: string[] = ['Página web', 'Instagram', 'Facebook', 'Referido', 'WhatsApp']

export interface WorkspaceCompradorProps {
  /** venta rápida: nace «Sin identificar» y el comprador se identifica con un enlace. */
  capturaRapida: boolean
  canal: 'PUNTO' | 'DOMICILIO'
  clienteSeleccionado: Cliente | null
  negocioId: string | null
  searchTerm: string
  onSearchTermChange: (value: string) => void
  resultados: Cliente[]
  buscando?: boolean
  errorBusqueda?: boolean
  onReintentar?: () => void
  onSeleccionar: (cliente: Cliente, negocio: NegocioComprador | null) => void
  /** quita al comprador elegido (en venta rápida vuelve a «Sin identificar»). */
  onQuitar: () => void
  fiadosStatus: FiadoStatus | null
  patron: PatronConsumo | null
  patronLoading: boolean
  patronAplicado: boolean
  onAplicarPatron: () => void
  onVerPatron: () => void
  onCrearNuevo: () => void
  mostrarNuevo: boolean
  onCerrarNuevo: () => void
  nuevoCliente: NuevoClienteForm
  onNuevoClienteChange: (updater: (prev: NuevoClienteForm) => NuevoClienteForm) => void
}

/** Resuelve el negocio elegido: del cliente si ya viene, o del servidor (pedido con `negocioId` precargado). */
function useNegocioElegido(cliente: Cliente | null, negocioId: string | null): NegocioComprador | null {
  const conocido = useMemo(
    () => (cliente && negocioId ? cliente.negocios?.find((n) => n.id === negocioId) ?? null : null),
    [cliente, negocioId],
  )
  const [traido, setTraido] = useState<{ clienteId: string; negocios: NegocioComprador[] } | null>(null)
  const clienteId = cliente?.id ?? null

  useEffect(() => {
    if (!clienteId || !negocioId || conocido) return
    let vigente = true
    fetch(`/api/negocios?clienteId=${clienteId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (vigente && data?.success) setTraido({ clienteId, negocios: data.data as NegocioComprador[] })
      })
      .catch(() => undefined)
    return () => { vigente = false }
  }, [clienteId, negocioId, conocido])

  if (conocido) return conocido
  if (traido && traido.clienteId === clienteId) return traido.negocios.find((n) => n.id === negocioId) ?? null
  return null
}

function Avisos({ cliente }: { cliente: Cliente }) {
  const deuda = cliente.saldoPendiente ?? 0
  if (!cliente.bloqueado && !(deuda > 0)) return null
  return (
    <span className="flex shrink-0 flex-wrap justify-end gap-1">
      {cliente.bloqueado && (
        <span data-testid="cliente-search-bloqueado" className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Bloqueado</span>
      )}
      {deuda > 0 && (
        <span data-testid="cliente-search-deuda" className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Debe {formatCurrency(deuda)}</span>
      )}
    </span>
  )
}

function Fila({ opcion, term, onSeleccionar }: {
  opcion: OpcionComprador<Cliente>
  term: string
  onSeleccionar: (cliente: Cliente, negocio: NegocioComprador | null) => void
}) {
  const { cliente } = opcion
  const dueno = nombreCompleto(cliente)

  if (opcion.tipo === 'persona') {
    const motivos = explicarCoincidencia(cliente, term)
    const detalle = [cliente.telefono ? celularLegible(cliente.telefono) : null, cliente.barrio].filter(Boolean).join(' · ')
    return (
      <button
        type="button"
        data-testid="cliente-search-result"
        data-tipo="persona"
        onClick={() => onSeleccionar(cliente, null)}
        className="w-full text-left px-3 py-2.5 min-h-[44px] hover:bg-gray-50 border-b last:border-b-0 text-sm"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium">👤 <Resaltado texto={dueno} term={term} /></span>
          {opcion.avisos && <Avisos cliente={cliente} />}
        </div>
        {motivos.filter((m) => m.tipo !== 'negocio').map((m, i) => (
          <div key={i} data-testid="cliente-search-motivo" className="mt-0.5 text-xs text-blue-700"><Motivo motivo={m} term={term} /></div>
        ))}
        {detalle && <div className="mt-0.5 text-xs text-gray-500">{detalle}</div>}
      </button>
    )
  }

  const { negocio, anidada } = opcion
  const detalle = [anidada ? null : `de ${dueno}`, negocio.barrio, negocio.direccion].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      data-testid="cliente-search-result"
      data-tipo="negocio"
      onClick={() => onSeleccionar(cliente, negocio)}
      className={`w-full text-left px-3 py-2.5 min-h-[44px] hover:bg-gray-50 border-b last:border-b-0 text-sm ${anidada ? 'pl-8 bg-gray-50/60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">
          🏪 <Resaltado texto={negocio.nombre} term={term} />
          {negocio.tipoNegocio && negocio.tipoNegocio !== negocio.nombre && (
            <span className="font-normal text-gray-500"> · <Resaltado texto={negocio.tipoNegocio} term={term} /></span>
          )}
        </span>
        {opcion.avisos && <Avisos cliente={cliente} />}
      </div>
      {detalle && <div className="mt-0.5 text-xs text-gray-500">{detalle}</div>}
    </button>
  )
}

/**
 * WorkspaceComprador (P1-3, #394) — UN bloque para decir a quién se vende:
 * una tienda o una persona. Reemplaza las tarjetas «Cliente» y «Negocio /
 * Sucursal» del workspace: se elige de una vez (sin segundo paso) y nada viene
 * preseleccionado. En venta rápida nace «Sin identificar» y se identifica con
 * un enlace.
 */
export function WorkspaceComprador(props: WorkspaceCompradorProps) {
  const {
    capturaRapida, canal, clienteSeleccionado, negocioId, searchTerm, onSearchTermChange, resultados,
    buscando = false, errorBusqueda = false, onReintentar, onSeleccionar, onQuitar,
    fiadosStatus, patron, patronLoading, patronAplicado, onAplicarPatron, onVerPatron,
    onCrearNuevo, mostrarNuevo, onCerrarNuevo, nuevoCliente, onNuevoClienteChange,
  } = props
  const [identificando, setIdentificando] = useState(false)
  const negocio = useNegocioElegido(clienteSeleccionado, negocioId)
  const opciones = useMemo(
    () => (searchTerm ? opcionesComprador(resultados, searchTerm) : []),
    [resultados, searchTerm],
  )

  const cancelarIdentificar = () => {
    setIdentificando(false)
    onSearchTermChange('')
    onQuitar()
  }

  return (
    <div className="bg-white border rounded-xl p-4" data-testid="workspace-comprador">
      <h3 className="font-semibold text-gray-700 text-sm mb-3">Comprador</h3>

      {clienteSeleccionado ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2" data-testid="comprador-elegido">
            <div className="min-w-0">
              <div className="font-medium text-sm truncate" data-testid="comprador-nombre">
                {negocioId && negocio ? `🏪 ${negocio.nombre}` : negocioId ? '🏪 Negocio' : `👤 ${nombreCompleto(clienteSeleccionado)}`}
              </div>
              <div className="text-xs text-gray-500 truncate" data-testid="comprador-detalle">
                {negocioId ? `de ${nombreCompleto(clienteSeleccionado)}` : (clienteSeleccionado.telefono ? celularLegible(clienteSeleccionado.telefono) : '')}
              </div>
            </div>
            <button
              type="button"
              data-testid="comprador-cambiar"
              onClick={() => { setIdentificando(true); onQuitar() }}
              className="shrink-0 px-2 py-1 min-h-[36px] text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Cambiar
            </button>
          </div>

          {fiadosStatus && fiadosStatus.nivel !== 'ok' && (
            <div
              data-testid="fiado-status-banner"
              className={`px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${
                fiadosStatus.nivel === 'limite' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-amber-50 border border-amber-200 text-amber-700'
              }`}
            >
              <span>{fiadosStatus.nivel === 'limite' ? '🔒' : '⚠️'}</span>
              <span>
                {fiadosStatus.nivel === 'limite'
                  ? `Cliente tiene ${fiadosStatus.count}/${fiadosStatus.limite} pedidos fiados (límite alcanzado). Debe pagar antes de crear otro.`
                  : `Cliente tiene ${fiadosStatus.count}/${fiadosStatus.limite} pedidos fiados. Al crear este pedido, quedará al límite.`}
              </span>
            </div>
          )}

          {patron && (patron.frecuenciaSugerida || patron.productosSugeridos.length > 0) && (
            <div data-testid="patron-consumo-banner" className="px-3 py-2 rounded-lg text-xs bg-blue-50 border border-blue-200 text-blue-800 space-y-1.5">
              <p className="font-semibold uppercase text-[11px] text-blue-700">Patrón de consumo (guía)</p>
              {patron.frecuenciaSugerida && <p>Compra {patron.frecuenciaSugerida.label.toLowerCase()}</p>}
              {patron.productosSugeridos.length > 0 && (
                <p>Suele pedir: {patron.productosSugeridos.map((p) => `${p.cantidadPromedio} ${p.nombre} (${p.frecuencia}%)`).join(', ')}</p>
              )}
              {patron.productosSugeridos.length > 0 && (
                patronAplicado ? (
                  <p className="italic text-blue-600">Cantidades aplicadas — puedes ajustarlas abajo.</p>
                ) : (
                  <button type="button" data-testid="aplicar-sugerencia-btn" onClick={onAplicarPatron} className="px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition">
                    Aplicar sugerencia
                  </button>
                )
              )}
            </div>
          )}
          {!patron && !patronLoading && (
            <button type="button" onClick={onVerPatron} className="text-xs text-blue-600 hover:text-blue-700 underline">Ver patrón de consumo</button>
          )}
          {patronLoading && <p className="text-xs text-gray-400">Cargando patrón de consumo…</p>}
        </div>
      ) : capturaRapida && !identificando && !mostrarNuevo ? (
        <div className="flex items-center justify-between gap-2" data-testid="workspace-venta-rapida">
          <span className="text-sm">
            <strong>Sin identificar</strong> <span className="text-xs text-gray-500">· venta de mostrador</span>
          </span>
          <button
            type="button"
            data-testid="workspace-identificar"
            onClick={() => setIdentificando(true)}
            className="px-2 py-1 min-h-[36px] text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Identificar
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            data-testid="cliente-search-input"
            placeholder="Buscar por nombre, negocio o teléfono..."
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            autoFocus={capturaRapida}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          {searchTerm && buscando && opciones.length === 0 && (
            <p className="text-xs text-gray-400" data-testid="cliente-search-buscando">Buscando…</p>
          )}
          {searchTerm && errorBusqueda && opciones.length === 0 && (
            <p className="text-xs text-red-600" data-testid="cliente-search-error">
              No se pudo buscar (sin conexión o muy lenta).{' '}
              {onReintentar && (
                <button type="button" data-testid="cliente-search-retry" onClick={onReintentar} className="underline font-medium">Reintentar</button>
              )}
            </p>
          )}
          {opciones.length > 0 && (
            <div className="border rounded-lg max-h-72 overflow-y-auto" data-testid="comprador-resultados">
              {opciones.map((o) => (
                <Fila key={o.clave} opcion={o} term={searchTerm} onSeleccionar={onSeleccionar} />
              ))}
            </div>
          )}
          {searchTerm && !buscando && !errorBusqueda && opciones.length === 0 && (
            <p className="text-xs text-gray-500" data-testid="comprador-sin-resultados">Nadie coincide con «{searchTerm}».</p>
          )}
          <div className="flex items-center justify-between gap-2">
            {searchTerm ? (
              <button type="button" onClick={onCrearNuevo} className="text-sm text-blue-600 hover:text-blue-700">+ Crear cliente nuevo en vez de estos</button>
            ) : <span />}
            {capturaRapida && (
              <button type="button" data-testid="workspace-identificar-cancelar" onClick={cancelarIdentificar} className="text-sm text-gray-500 hover:text-gray-700">
                Dejar sin identificar
              </button>
            )}
          </div>
          {mostrarNuevo && (
            <div onKeyDown={(e) => { if (e.key === 'Escape') onCerrarNuevo() }} className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Nuevo cliente</span>
                <button type="button" onClick={onCerrarNuevo} className="lg:hidden text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Nombre *" value={nuevoCliente.nombre} onChange={(e) => onNuevoClienteChange((p) => ({ ...p, nombre: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
                <input placeholder="Apellido" value={nuevoCliente.apellido} onChange={(e) => onNuevoClienteChange((p) => ({ ...p, apellido: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
                <input placeholder="Teléfono *" value={nuevoCliente.telefono} onChange={(e) => onNuevoClienteChange((p) => ({ ...p, telefono: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
                <input placeholder={canal === 'DOMICILIO' ? 'Dirección *' : 'Dirección'} value={nuevoCliente.direccion} onChange={(e) => onNuevoClienteChange((p) => ({ ...p, direccion: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm col-span-2" />
                <input placeholder={canal === 'DOMICILIO' ? 'Barrio *' : 'Barrio'} value={nuevoCliente.barrio} onChange={(e) => onNuevoClienteChange((p) => ({ ...p, barrio: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm col-span-2" />
                <div className="col-span-2">
                  <TipoNegocioSelect options={FUENTES} value={nuevoCliente.fuente} onChange={(val) => onNuevoClienteChange((p) => ({ ...p, fuente: val }))} placeholder="¿Cómo nos conoció?" apiUrl="/api/clientes/fuentes" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
