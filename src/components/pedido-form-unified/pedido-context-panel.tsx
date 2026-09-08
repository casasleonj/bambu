import { TipoNegocioSelect } from '@/components/tipo-negocio-select'
import { NegocioSelector } from '@/components/negocio-selector'
import type { FiadoStatus } from '@/modules/pedidos/domain/types'
import type { Cliente } from './types'
import type { PatronConsumo } from './index'

const FUENTES: string[] = [
  'Página web', 'Instagram', 'Facebook', 'Referido', 'WhatsApp',
]

export interface NuevoClienteForm {
  nombre: string
  apellido: string
  telefono: string
  direccion: string
  barrio: string
  fuente: string
}

export interface PedidoContextPanelProps {
  canal: 'PUNTO' | 'DOMICILIO'
  pedidoInicialId?: string

  clienteSeleccionado: Cliente | null
  onQuitarCliente: () => void

  fiadosStatus: FiadoStatus | null

  sugerenciaConsumo: PatronConsumo | null
  sugerenciaLoading: boolean
  sugerenciaAplicada: boolean
  aplicarSugerenciaDisabled: boolean
  onAplicarSugerencia: () => void
  onVerPatronConsumo: () => void

  negocioSeleccionado: string | null
  onNegocioSelected: (id: string | null, data: { direccion: string | null; barrio: string | null } | null) => void

  editDireccion: string
  onEditDireccionChange: (value: string) => void
  editBarrio: string
  onEditBarrioChange: (value: string) => void
  soloParaEstePedido: boolean
  onSoloParaEstePedidoChange: (value: boolean) => void

  searchTerm: string
  onSearchTermChange: (value: string) => void
  clientesCargando: boolean
  filteredClientes: Cliente[]
  onSelectCliente: (cliente: Cliente) => void
  onCrearNuevo: () => void

  mostrarNuevo: boolean
  onCerrarNuevo: () => void
  nuevoCliente: NuevoClienteForm
  onNuevoClienteChange: (updater: (prev: NuevoClienteForm) => NuevoClienteForm) => void
}

/**
 * PedidoContextPanel (ALS §5) — captura/contexto del cliente de un pedido:
 * búsqueda, cliente nuevo, banner de fiados, patrón de consumo, negocio y
 * dirección de entrega.
 *
 * Fase 3b del rediseño (docs/pedidos/00-plan-frontend-rediseno-integral.md):
 * segunda extracción del monolito `pedido-form-unified/index.tsx`, después
 * de `PedidoPricingSummary` (3a). A diferencia de esa pieza, este panel SÍ
 * depende de estado con efectos reales (fiado-status, patrón de consumo,
 * negocio, revalidación silenciosa de contacto) — por diseño, TODO ese
 * estado y sus efectos se quedan en el componente padre; este componente
 * solo recibe valores + callbacks ya resueltos (mismo patrón de "lift state
 * up" que evita duplicar o relocalizar debounces/efectos/refs). Cero lógica
 * nueva: es el mismo JSX que vivía inline, con los mismos handlers del
 * padre pasados como props en vez de closures directas.
 */
export function PedidoContextPanel({
  canal,
  pedidoInicialId,
  clienteSeleccionado,
  onQuitarCliente,
  fiadosStatus,
  sugerenciaConsumo,
  sugerenciaLoading,
  sugerenciaAplicada,
  aplicarSugerenciaDisabled,
  onAplicarSugerencia,
  onVerPatronConsumo,
  negocioSeleccionado,
  onNegocioSelected,
  editDireccion,
  onEditDireccionChange,
  editBarrio,
  onEditBarrioChange,
  soloParaEstePedido,
  onSoloParaEstePedidoChange,
  searchTerm,
  onSearchTermChange,
  clientesCargando,
  filteredClientes,
  onSelectCliente,
  onCrearNuevo,
  mostrarNuevo,
  onCerrarNuevo,
  nuevoCliente,
  onNuevoClienteChange,
}: PedidoContextPanelProps) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="font-semibold text-gray-700 text-sm mb-3">{canal === 'DOMICILIO' ? 'Cliente *' : 'Cliente (opcional)'}</h3>
      {clienteSeleccionado ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
            <div>
              <span className="font-medium text-sm">{clienteSeleccionado.nombre}{clienteSeleccionado.apellido ? ` ${clienteSeleccionado.apellido}` : ''}</span>
              <span className="text-xs text-gray-500 ml-2">{clienteSeleccionado.telefono}</span>
            </div>
            <button
              type="button"
              onClick={onQuitarCliente}
              className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
              title="Quitar cliente"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Banner de fiados */}
          {fiadosStatus && fiadosStatus.nivel !== 'ok' && (
            <div
              data-testid="fiado-status-banner"
              className={`px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${
                fiadosStatus.nivel === 'limite'
                  ? 'bg-red-50 border border-red-200 text-red-700'
                  : 'bg-amber-50 border border-amber-200 text-amber-700'
              }`}
            >
              <span>{fiadosStatus.nivel === 'limite' ? '🔒' : '⚠️'}</span>
              <span>
                {fiadosStatus.nivel === 'limite'
                  ? `Cliente tiene ${fiadosStatus.count}/${fiadosStatus.limite} pedidos fiados (límite alcanzado). Debe pagar antes de crear otro.`
                  : `Cliente tiene ${fiadosStatus.count}/${fiadosStatus.limite} pedidos fiados. Al crear este pedido, quedará al límite.`
                }
              </span>
            </div>
          )}

          {/* Patrón de consumo (guía) — solo lectura; aplicar cantidades
              es siempre una acción explícita del usuario, nunca automática. */}
          {sugerenciaConsumo && (sugerenciaConsumo.frecuenciaSugerida || sugerenciaConsumo.productosSugeridos.length > 0) && (
            <div
              data-testid="patron-consumo-banner"
              className="px-3 py-2 rounded-lg text-xs bg-blue-50 border border-blue-200 text-blue-800 space-y-1.5"
            >
              <p className="font-semibold uppercase text-[11px] text-blue-700">Patrón de consumo (guía)</p>
              {sugerenciaConsumo.frecuenciaSugerida && (
                <p>Compra {sugerenciaConsumo.frecuenciaSugerida.label.toLowerCase()}</p>
              )}
              {sugerenciaConsumo.productosSugeridos.length > 0 && (
                <p>
                  Suele pedir: {sugerenciaConsumo.productosSugeridos.map(p =>
                    `${p.cantidadPromedio} ${p.nombre} (${p.frecuencia}%)`
                  ).join(', ')}
                </p>
              )}
              {sugerenciaConsumo.productosSugeridos.length > 0 && (
                sugerenciaAplicada ? (
                  <p className="italic text-blue-600">Cantidades aplicadas — puedes ajustarlas abajo.</p>
                ) : (
                  <button
                    type="button"
                    data-testid="aplicar-sugerencia-btn"
                    onClick={onAplicarSugerencia}
                    disabled={aplicarSugerenciaDisabled}
                    className="px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Aplicar sugerencia
                  </button>
                )
              )}
            </div>
          )}
          {!sugerenciaConsumo && !sugerenciaLoading && (
            <button
              type="button"
              onClick={onVerPatronConsumo}
              className="text-xs text-blue-600 hover:text-blue-700 underline"
            >
              Ver patrón de consumo
            </button>
          )}
          {sugerenciaLoading && (
            <p className="text-xs text-gray-400">Cargando patrón de consumo…</p>
          )}

          {/* NEGOCIO SELECTOR */}
          <NegocioSelector
            clienteId={clienteSeleccionado.id}
            clienteNombre={clienteSeleccionado.nombre}
            clienteDireccion={clienteSeleccionado.direccion}
            clienteBarrio={clienteSeleccionado.barrio}
            clienteLinkUbicacion={clienteSeleccionado.linkUbicacion}
            selectedNegocioId={negocioSeleccionado}
            onNegocioSelected={onNegocioSelected}
            // FIX: editar un pedido existente NUNCA puede cambiar su
            // negocioId (ActualizarPedidoInput no tiene ese campo — el
            // backend siempre reusa el negocioId original). El selector
            // quedaba interactivo igual, sugiriendo una capacidad que no
            // existe. Se vuelve de solo lectura al editar.
            readOnly={Boolean(pedidoInicialId)}
          />

          {canal === 'DOMICILIO' && (
            <div className="space-y-2">
              {/* La dirección de destino (negocio o domicilio principal) ya se
                  muestra en el selector de arriba una sola vez (resumen
                  colapsado). Estos inputs son para AJUSTAR el texto de entrega
                  de este pedido puntual, no repiten el indicador de destino. */}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Dirección *"
                  value={editDireccion}
                  onChange={(e) => onEditDireccionChange(e.target.value)}
                  className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <input
                  type="text"
                  placeholder="Barrio *"
                  value={editBarrio}
                  onChange={(e) => onEditBarrioChange(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              {/* Solo tiene sentido para el domicilio principal: cuando hay
                  negocio seleccionado, la persistencia a Cliente ya está
                  bloqueada incondicionalmente (ver resolveActualizarCliente),
                  así que el checkbox sería ruido sin efecto. */}
              {!negocioSeleccionado && (
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={soloParaEstePedido}
                    onChange={(e) => onSoloParaEstePedidoChange(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  🕓 Solo para este pedido (no actualizar la dirección guardada)
                </label>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            data-testid="cliente-search-input"
            placeholder="Buscar cliente por nombre o teléfono..."
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          {searchTerm && clientesCargando && (
            // La lista completa de clientes se carga en background al
            // abrir /pedidos (ya no bloquea la apertura del modal
            // cuando viene con un cliente pre-seleccionado). Si el
            // usuario busca a OTRO cliente antes de que termine, se
            // avisa en vez de mostrar una lista vacía sin explicación.
            <p className="text-xs text-gray-400">Cargando lista completa de clientes…</p>
          )}
          {searchTerm && filteredClientes.length > 0 && (
            <div className="border rounded-lg max-h-40 overflow-y-auto">
              {filteredClientes.map(c => (
                <button key={c.id} type="button" data-testid="cliente-search-result" onClick={() => onSelectCliente(c)} className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0 text-sm">
                  <span className="font-medium">
                    {c.negocios?.[0]?.nombre || `${c.nombre}${c.apellido ? ` ${c.apellido}` : ''}`}
                  </span>
                  {c.negocios?.[0] && (
                    <span className="text-gray-400 ml-2 text-xs">de {c.nombre}{c.apellido ? ` ${c.apellido}` : ''}</span>
                  )}
                  <span className="text-gray-400 ml-2">{c.telefono}</span>
                </button>
              ))}
            </div>
          )}
          {searchTerm && (
            <button type="button" onClick={onCrearNuevo} className="text-sm text-blue-600 hover:text-blue-700">+ Crear cliente nuevo en vez de estos</button>
          )}
          {mostrarNuevo && (
            <div
              onKeyDown={(e) => { if (e.key === 'Escape') onCerrarNuevo() }}
              className="space-y-2"
            >
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Nuevo cliente</span>
                <button
                  type="button"
                  onClick={onCerrarNuevo}
                  className="lg:hidden text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancelar
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Nombre *" value={nuevoCliente.nombre} onChange={e => onNuevoClienteChange(p => ({ ...p, nombre: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
                <input placeholder="Apellido" value={nuevoCliente.apellido} onChange={e => onNuevoClienteChange(p => ({ ...p, apellido: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
                <input placeholder="Teléfono *" value={nuevoCliente.telefono} onChange={e => onNuevoClienteChange(p => ({ ...p, telefono: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
                <input placeholder={canal === 'DOMICILIO' ? 'Dirección *' : 'Dirección'} value={nuevoCliente.direccion} onChange={e => onNuevoClienteChange(p => ({ ...p, direccion: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm col-span-2" />
                <input placeholder={canal === 'DOMICILIO' ? 'Barrio *' : 'Barrio'} value={nuevoCliente.barrio} onChange={e => onNuevoClienteChange(p => ({ ...p, barrio: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm col-span-2" />
                <div className="col-span-2">
                  <TipoNegocioSelect options={FUENTES} value={nuevoCliente.fuente} onChange={(val) => onNuevoClienteChange(p => ({ ...p, fuente: val }))} placeholder="¿Cómo nos conoció?" apiUrl="/api/clientes/fuentes" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
