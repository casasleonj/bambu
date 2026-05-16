import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/modal'
import { formatCurrency, formatLocalDate } from '@/lib/utils'
import type { Proveedor, ProveedorDetail } from './types'

function getAvatarColor(name: string): string {
  const colors = [
    "bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500",
    "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500",
    "bg-orange-500", "bg-pink-500",
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

export function ProveedorDetailModal({
  open,
  onClose,
  proveedor,
  onEdit,
}: {
  open: boolean
  onClose: () => void
  proveedor: Proveedor | null
  onEdit: (p: Proveedor) => void
}) {
  const [detail, setDetail] = useState<ProveedorDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('info')

  useEffect(() => {
    if (!open || !proveedor) return
    setActiveTab('info')
    setLoading(true)
    fetch(`/api/proveedores/${proveedor.id}`)
      .then(r => {
        if (!r.ok) throw new Error(`Error ${r.status}`)
        return r.json()
      })
      .then(d => {
        if (d.proveedor) setDetail(d.proveedor)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error cargando detalle'))
      .finally(() => setLoading(false))
  }, [open, proveedor])

  if (!proveedor) return null

  return (
    <Modal open={open} onClose={onClose} className="w-full max-w-2xl rounded-xl bg-white shadow-xl dark:bg-zinc-900 max-h-[90vh] overflow-hidden flex flex-col">
      {loading ? (
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-200 animate-pulse" />
            <div className="space-y-2 flex-1">
              <div className="h-5 bg-gray-200 rounded w-48 animate-pulse" />
              <div className="h-3 bg-gray-200 rounded w-24 animate-pulse" />
            </div>
          </div>
          <div className="h-32 bg-gray-200 rounded-xl animate-pulse" />
          <div className="h-48 bg-gray-200 rounded-xl animate-pulse" />
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white ${getAvatarColor(proveedor.nombre)}`}>
                  {proveedor.nombre.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{proveedor.nombre}</h2>
                  {proveedor.tipoProducto && (
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {proveedor.tipoProducto}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-1 transition dark:hover:bg-zinc-800"
                aria-label="Cerrar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 mt-3">
              {proveedor.telefono && (
                <a
                  href={`tel:${proveedor.telefono}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Llamar
                </a>
              )}
              {proveedor.email && (
                <a
                  href={`mailto:${proveedor.email}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Email
                </a>
              )}
              <button
                onClick={() => { onClose(); onEdit(proveedor) }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-100 transition dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Editar
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100 dark:border-zinc-800">
            {[
              { key: 'info', label: 'Información', icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )},
              { key: 'insumos', label: 'Insumos', icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              )},
              { key: 'compras', label: 'Compras', icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              )},
            ].map((tab) => {
              const count = tab.key === 'insumos' ? (detail?.insumos?.length ?? 0)
                : tab.key === 'compras' ? (detail?.compras?.length ?? 0)
                : 0
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs sm:text-sm font-medium transition ${
                    activeTab === tab.key
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                  {count > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded-full font-bold dark:bg-zinc-800 dark:text-zinc-400">
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'info' && (
              <div className="space-y-5">
                {/* Contact */}
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    Contacto
                  </h3>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3 dark:bg-zinc-800/50">
                    {proveedor.telefono ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span className="text-sm text-gray-500 dark:text-zinc-400">Teléfono</span>
                        </div>
                        <a href={`tel:${proveedor.telefono}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                          {proveedor.telefono}
                        </a>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">Teléfono</span>
                        <span className="text-sm text-gray-400">-</span>
                      </div>
                    )}
                    {proveedor.email ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <span className="text-sm text-gray-500 dark:text-zinc-400">Email</span>
                        </div>
                        <a href={`mailto:${proveedor.email}`} className="font-medium text-blue-600 hover:underline truncate max-w-[60%] dark:text-blue-400">
                          {proveedor.email}
                        </a>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">Email</span>
                        <span className="text-sm text-gray-400">-</span>
                      </div>
                    )}
                    {proveedor.direccion ? (
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="text-sm text-gray-500 dark:text-zinc-400">Dirección</span>
                        </div>
                        <span className="font-medium text-right max-w-[60%]">{proveedor.direccion}</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">Dirección</span>
                        <span className="text-sm text-gray-400">-</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Products/Services */}
                {proveedor.tipoProducto && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      Productos / Servicios
                    </h3>
                    <div className="bg-blue-50 rounded-xl p-4 dark:bg-blue-900/20">
                      <span className="text-sm font-medium text-blue-800 dark:text-blue-300">{proveedor.tipoProducto}</span>
                    </div>
                  </div>
                )}

                {/* Observaciones */}
                {proveedor.observaciones && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Observaciones
                    </h3>
                    <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4 dark:bg-yellow-900/20 dark:border-yellow-900/30">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap dark:text-zinc-300">{proveedor.observaciones}</p>
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Información
                  </h3>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3 dark:bg-zinc-800/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500 dark:text-zinc-400">Registrado</span>
                      <span className="font-medium text-sm">{proveedor.createdAt ? formatLocalDate(proveedor.createdAt) : '-'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500 dark:text-zinc-400">Estado</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${proveedor.activo !== false ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'}`}>
                        {proveedor.activo !== false ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'insumos' && (
              <div>
                {!detail?.insumos || detail.insumos.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-zinc-800">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                    <p className="text-gray-500 font-medium">Sin insumos registrados</p>
                    <p className="text-sm text-gray-400 mt-1">Este proveedor no tiene insumos asociados</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detail.insumos.map((insumo) => (
                      <div
                        key={insumo.id}
                        className={`bg-white border rounded-xl p-4 hover:shadow-sm transition dark:bg-zinc-800/50 dark:border-zinc-700 ${
                          Number(insumo.stock) <= Number(insumo.stockMin) ? 'border-red-300 bg-red-50/30 dark:border-red-900/30 dark:bg-red-900/10' : ''
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-medium text-sm">{insumo.nombre}</div>
                            <div className="text-xs text-muted-foreground">{insumo.unidad}</div>
                          </div>
                          <div className="text-right">
                            <div className={`font-medium text-sm ${Number(insumo.stock) <= Number(insumo.stockMin) ? 'text-red-600' : ''}`}>
                              {insumo.stock} / {insumo.stockMin} min
                            </div>
                            <div className="text-xs text-muted-foreground">{formatCurrency(Number(insumo.precioUnit))}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'compras' && (
              <div>
                {!detail?.compras || detail.compras.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-zinc-800">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <p className="text-gray-500 font-medium">Sin compras registradas</p>
                    <p className="text-sm text-gray-400 mt-1">No hay historial de compras a este proveedor</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detail.compras.map((compra) => (
                      <div
                        key={compra.id}
                        className="bg-white border rounded-xl p-4 hover:shadow-sm transition dark:bg-zinc-800/50 dark:border-zinc-700"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-gray-400">{compra.numero}</span>
                              <span className="font-medium text-sm">{compra.insumo.nombre}</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {compra.insumo.unidad} · {compra.cantidad} unidades
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-sm">{formatCurrency(Number(compra.montoTotal))}</div>
                            <div className="text-xs text-muted-foreground">{formatLocalDate(compra.fecha)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end dark:bg-zinc-800/50 dark:border-zinc-800">
            <span className="text-xs text-gray-400 dark:text-zinc-500">
              {detail?.insumos?.length ?? 0} insumos · {detail?.compras?.length ?? 0} compras
            </span>
          </div>
        </>
      )}
    </Modal>
  )
}
