'use client'

import { Fragment, useMemo, useState } from 'react'
import { useAhora } from '@/hooks/use-ahora'
import { clasificarFranja, textoTiempoRestante } from '@/lib/pedidos-franja'
import { getProductoEmoji } from '@/hooks/use-productos-domicilio'
import {
  filtrarPedidosSeleccionables,
  tieneFiadoPendiente,
  type PedidoSeleccionable,
  type UrgenciaBucket,
} from './filtrar-pedidos'
import { derivarCarga, resumenSeleccion } from './derivar-carga'
import type { WizardState, WizardAction } from './wizard-reducer'

interface PasoPedidosProps {
  state: WizardState
  dispatch: React.Dispatch<WizardAction>
  onCancel: () => void
}

function productosResumen(p: PedidoSeleccionable): string {
  return Object.entries(derivarCarga([p]))
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${getProductoEmoji(k)} ${n}`)
    .join('  ')
}

function fechaChip(p: PedidoSeleccionable): { texto: string; tono: string } | null {
  if (!p.fechaEntrega) return null
  const f = new Date(p.fechaEntrega)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const soloF = new Date(f)
  soloF.setHours(0, 0, 0, 0)
  const dias = Math.round((soloF.getTime() - hoy.getTime()) / 86400000)
  if (dias < 0) return { texto: `Vencido ${-dias}d`, tono: 'bg-red-100 text-red-700' }
  if (dias === 0) return { texto: 'Hoy', tono: 'bg-amber-100 text-amber-700' }
  if (dias === 1) return { texto: 'Mañana', tono: 'bg-blue-100 text-blue-700' }
  return { texto: `En ${dias}d`, tono: 'bg-gray-100 text-gray-600' }
}

/** #836 F2b: encabezados por tiempo restante; solo aparecen si algún pedido tiene hora acordada. */
const GRUPO: Record<UrgenciaBucket, { clave: string; etiqueta: string; tono: string }> = {
  vencido: { clave: 'atrasados', etiqueta: 'Atrasados', tono: 'bg-amber-100 text-amber-900' },
  hoy_ya_toca: { clave: 'ya_toca', etiqueta: 'Ya toca', tono: 'bg-red-100 text-red-800' },
  hoy_sin_hora: { clave: 'normales', etiqueta: 'Normales', tono: 'bg-gray-100 text-gray-600' },
  hoy_con_hora: { clave: 'normales', etiqueta: 'Normales', tono: 'bg-gray-100 text-gray-600' },
  sin_fecha: { clave: 'normales', etiqueta: 'Normales', tono: 'bg-gray-100 text-gray-600' },
  hoy_mas_tarde: { clave: 'mas_tarde', etiqueta: 'Más tarde hoy', tono: 'bg-indigo-50 text-indigo-800' },
  futuro: { clave: 'futuros', etiqueta: 'Futuros', tono: 'bg-blue-50 text-blue-800' },
}

export function PasoPedidos({ state, dispatch, onCancel }: PasoPedidosProps) {
  const { data, fase } = state
  const ahora = useAhora()
  const [tardeAbierto, setTardeAbierto] = useState(false)

  const lista = useMemo(
    () =>
      filtrarPedidosSeleccionables(data.pedidos, {
        verFuturos: data.verFuturos,
        buscar: data.buscar,
        ahora,
      }),
    [data.pedidos, data.verFuturos, data.buscar, ahora],
  )
  const hayHoras = lista.some((p) => p.entregaNoAntesDe)
  const nMasTarde = lista.filter((p) => p._bucket === 'hoy_mas_tarde').length

  const seleccionados = data.pedidos.filter((p) => data.selectedIds.includes(p.id))
  const { unidades, pesoKg } = resumenSeleccion(seleccionados)
  const nSel = data.selectedIds.length

  if (fase === 'LOADING_ORDERS') {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <>
      <div className="px-5 pt-3 pb-2 space-y-2 border-b">
        <p className="text-xs text-gray-500">
          Elegí los pedidos que van en este embarque. Aparecen los pendientes con
          entrega para hoy o vencida.
        </p>
        <input
          type="search"
          value={data.buscar}
          onChange={(e) => dispatch({ type: 'SET_BUSCAR', value: e.target.value })}
          placeholder="Filtrar la lista por cliente o negocio…"
          data-testid="pedidos-buscar"
          className="w-full px-3 py-2 border rounded-lg text-sm"
        />
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={data.verFuturos}
            onChange={(e) => dispatch({ type: 'SET_VER_FUTUROS', value: e.target.checked })}
            data-testid="ver-futuros"
          />
          Ver pedidos futuros
        </label>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-2" data-testid="pedidos-lista">
        {lista.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            No hay pedidos pendientes para hoy.
            {!data.verFuturos && ' Activá "Ver pedidos futuros" para adelantar una entrega.'}
            <br />
            <span className="text-xs">Los pedidos se crean en la sección Pedidos, no acá.</span>
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {lista.map((p, i) => {
              const checked = data.selectedIds.includes(p.id)
              const chip = fechaChip(p)
              const grupo = GRUPO[p._bucket]
              const nuevoGrupo = hayHoras && (i === 0 || GRUPO[lista[i - 1]._bucket].clave !== grupo.clave)
              const plegado = p._bucket === 'hoy_mas_tarde' && !tardeAbierto
              const restante = textoTiempoRestante(clasificarFranja(p, ahora).minutosFaltantes)
              return (
                <Fragment key={p.id}>
                  {nuevoGrupo && (
                    <li className={`my-2 flex items-center justify-between rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${grupo.tono}`} data-testid={`franja-${grupo.clave}`}>
                      <span>{grupo.etiqueta}{grupo.clave === 'mas_tarde' ? ` · ${nMasTarde}` : ''}</span>
                      {grupo.clave === 'mas_tarde' && (
                        <button type="button" className="underline" aria-expanded={tardeAbierto} onClick={() => setTardeAbierto((v) => !v)} data-testid="franja-mas-tarde-toggle">
                          {tardeAbierto ? '▲ ocultar' : '▼ ver'}
                        </button>
                      )}
                    </li>
                  )}
                  {!plegado && (
                <li>
                  <label className="flex items-start gap-3 py-2.5 cursor-pointer min-h-[44px]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => dispatch({ type: 'TOGGLE_PEDIDO', id: p.id })}
                      data-testid={`pedido-check-${p.numero}`}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800 truncate">
                          {p.nombreNegocioCli || `${p.nombreCli ?? ''} ${p.apellidoCli ?? ''}`.trim()}
                        </span>
                        <span className="text-xs text-gray-400">#{p.numero}</span>
                        {chip && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${chip.tono}`}>
                            {chip.texto}
                          </span>
                        )}
                        {p.entregaNoAntesDe && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-800 font-medium" data-testid={`hora-acordada-${p.numero}`}>
                            🕐 {p.entregaNoAntesDe}{restante ? ` · ${restante}` : ''}
                          </span>
                        )}
                        {p.horaPreferida && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600">
                            {p.horaPreferida}
                          </span>
                        )}
                        {tieneFiadoPendiente(p) && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-100 text-orange-700">
                            fiado
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{p.barrioCli || 'Sin barrio'}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{productosResumen(p)}</p>
                    </div>
                  </label>
                </li>
                  )}
                </Fragment>
              )
            })}
          </ul>
        )}
      </div>

      <div className="px-5 py-3 border-t bg-gray-50 flex items-center gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-2.5 text-sm border rounded-lg hover:bg-gray-100"
        >
          Cancelar
        </button>
        <div className="flex-1 text-xs text-gray-600" data-testid="pedidos-resumen">
          {nSel === 0 ? 'Ningún pedido' : `${nSel} pedido${nSel > 1 ? 's' : ''} · ${unidades} unidades · ${Math.round(pesoKg)} kg`}
        </div>
        <button
          onClick={() => dispatch({ type: 'GOTO_CONFIRM' })}
          data-testid="wizard-siguiente"
          className="px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Siguiente →
        </button>
      </div>
    </>
  )
}
