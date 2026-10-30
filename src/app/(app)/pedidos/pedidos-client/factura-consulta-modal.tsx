'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/modal'
import { FacturaDetail } from '../../facturas/facturas-client/factura-detail'
import type { Factura } from '../../facturas/facturas-client/types'
import '../../facturas/facturas-client/factura-print.css'

interface Props {
  documento: { id: string; volver: string; pedidoId?: string; pedidoNumero?: number; consulta?: string } | null
  onClose: () => void
  onOpenPedido: (id: string) => void
  onVolverConsulta?: () => void
}
/** Consulta por ID, sin depender del listado ni de su paginación/fecha. */
export function FacturaConsultaModal({ documento, onClose, onOpenPedido,onVolverConsulta }: Props) {
  const [factura, setFactura] = useState<Factura | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!documento) return
    const controller = new AbortController()
    // El estado pertenece a una solicitud concreta; la respuesta anterior no
    // debe aparecer bajo el identificador del nuevo documento.
    /* eslint-disable react-hooks/set-state-in-effect */
    setFactura(null); setError(null); setLoading(true)
    /* eslint-enable react-hooks/set-state-in-effect */
    void fetch(`/api/facturas/${encodeURIComponent(documento.id)}`, { signal: controller.signal })
      .then(async res => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Factura no encontrada.' : res.status === 403
          ? 'Tu perfil no tiene acceso a esta factura.' : 'No se pudo consultar la factura.')
        const data = await res.json()
        if (!data.factura || data.factura.id !== documento.id) throw new Error('No se pudo identificar la factura solicitada.')
        if (documento.pedidoId && data.factura.pedidoId !== documento.pedidoId) throw new Error('La factura recibida no corresponde al pedido solicitado.')
        if (!controller.signal.aborted) setFactura(data.factura)
      }).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'No se pudo consultar la factura.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [documento, retry])
  return <Modal open={!!documento} onClose={onClose} title="Consulta de factura" data-testid="factura-consulta-modal"
    overlayClassName="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
    className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
    <header className="flex shrink-0 items-center justify-between border-b p-4"><h2 className="text-lg font-semibold">{factura ? `Factura ${factura.numero}` : 'Consulta de factura'}</h2><button className="min-h-11 min-w-11 rounded border px-3" aria-label="Cerrar factura" onClick={onClose}>×</button></header>
    <div className="min-h-0 overflow-y-auto p-4">
      {loading && <p role="status">Cargando factura…</p>}
      {error && <div role="alert"><h3 className="font-semibold">No se pudo abrir la factura</h3><p className="mt-2 text-sm">{error} Conservamos la vista de origen.</p><button className="mt-3 min-h-11 rounded border px-4" onClick={() => setRetry(n => n + 1)}>Reintentar</button></div>}
      {factura && <FacturaDetail factura={factura} empresaConfig={{ nombre: factura.empresaNombre || 'Agua Bambú',
        nit: factura.empresaNit || '', direccion: factura.empresaDireccion || '', telefono: factura.empresaTelefono || '', email: factura.empresaEmail || '' }}
        volverPedidos={documento?.consulta} onOpenPedido={id => { onClose(); onOpenPedido(id) }} />}
    </div>
    <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-white p-4">{documento?.pedidoId&&<button className="min-h-11 rounded-lg border border-blue-200 px-4 font-semibold text-blue-700" onClick={()=>{onClose();onOpenPedido(documento.pedidoId!)}}>Volver al pedido{documento.pedidoNumero?` #${documento.pedidoNumero}`:''}</button>}<button className="min-h-11 rounded-lg bg-blue-600 px-4 text-white" onClick={onVolverConsulta??onClose}>{documento?.volver || 'Volver a Fiados'}</button></footer>
  </Modal>
}
