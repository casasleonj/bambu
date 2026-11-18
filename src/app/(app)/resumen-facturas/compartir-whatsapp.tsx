'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/modal'
import { enlaceWhatsapp, telefonoWhatsapp } from '@/lib/whatsapp'

type Fase = 'cerrado' | 'confirmar' | 'generando' | 'listo' | 'error' | 'sin-telefono'

interface Props {
  clienteId: string
  clienteNombre: string
  telefono: string
  /** Estado elegido en las pestañas. «ANULADA» no se comparte con el cliente. */
  estado: 'TODAS' | 'EMITIDA' | 'PARCIAL' | 'PAGADA' | 'ANULADA'
  desde: string | null
  hasta: string | null
  /** Facturas vigentes que irían en el PDF. */
  facturas: number
  saldo: number
}

function money(value: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)
}

function nombreDeArchivo(cabecera: string | null): string {
  const m = cabecera?.match(/filename="([^"]+)"/)
  return m?.[1] ?? 'Resumen-de-cuenta.pdf'
}

/**
 * Compartir el resumen por WhatsApp como PDF (#845). WhatsApp no recibe archivos
 * por enlace: se genera el PDF, se descarga y el usuario lo adjunta en el chat; en
 * celulares que lo permiten se ofrece el menú de compartir del sistema.
 * La comunicación es opcional y best-effort (ADR-COMUNICACIONES-001).
 */
export function CompartirWhatsapp({ clienteId, clienteNombre, telefono, estado, desde, hasta, facturas, saldo }: Props) {
  const [fase, setFase] = useState<Fase>('cerrado')
  const [mensajeError, setMensajeError] = useState('')
  const [archivo, setArchivo] = useState<{ file: File; url: string } | null>(null)
  const [puedeCompartirArchivo, setPuedeCompartirArchivo] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  /** Guarda de doble clic: el estado de React puede ir un render atrasado. */
  const enCursoRef = useRef(false)

  const whatsappOk = telefonoWhatsapp(telefono) !== null
  const sinFacturas = facturas === 0
  const bloqueadoPorEstado = estado === 'ANULADA'
  const deshabilitado = bloqueadoPorEstado || sinFacturas
  const motivo = bloqueadoPorEstado
    ? 'Las facturas anuladas no se comparten con el cliente'
    : sinFacturas
      ? 'No hay facturas para compartir con este filtro'
      : undefined

  const limpiarArchivo = useCallback(() => {
    setArchivo((actual) => {
      if (actual) URL.revokeObjectURL(actual.url)
      return null
    })
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  const cerrar = () => {
    if (fase === 'generando') return
    limpiarArchivo()
    setFase('cerrado')
  }

  const abrir = () => {
    setMensajeError('')
    setFase(whatsappOk ? 'confirmar' : 'sin-telefono')
  }

  const descargar = (a: { file: File; url: string }) => {
    const link = document.createElement('a')
    link.href = a.url
    link.download = a.file.name
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const generar = async (soloDescarga: boolean) => {
    if (enCursoRef.current) return // doble clic
    enCursoRef.current = true
    setFase('generando')
    setMensajeError('')
    limpiarArchivo()
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const query = new URLSearchParams({ estado })
      if (desde) query.set('desde', desde)
      if (hasta) query.set('hasta', hasta)
      const res = await fetch(`/api/clientes/${clienteId}/resumen-facturas/pdf?${query.toString()}`, { signal: ctrl.signal })
      if (!res.ok) {
        const err: unknown = await res.json().catch(() => null)
        const msg =
          typeof err === 'object' && err !== null && 'error' in err &&
          typeof (err as { error?: { message?: unknown } }).error?.message === 'string'
            ? (err as { error: { message: string } }).error.message
            : `Error ${res.status}`
        throw new Error(msg)
      }
      const blob = await res.blob()
      const file = new File([blob], nombreDeArchivo(res.headers.get('content-disposition')), { type: 'application/pdf' })
      const a = { file, url: URL.createObjectURL(file) }
      setArchivo(a)
      setPuedeCompartirArchivo(
        typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }),
      )
      descargar(a)
      if (soloDescarga) {
        toast.success('PDF descargado')
        setFase('cerrado')
        return
      }
      setFase('listo')
      // Best-effort: anotar que se preparó el envío. Un fallo aquí no bloquea nada.
      void fetch(`/api/clientes/${clienteId}/resumen-facturas/compartir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canal: 'whatsapp', estado: estado === 'ANULADA' ? undefined : estado, desde: desde ?? undefined, hasta: hasta ?? undefined, facturas }),
      }).catch(() => undefined)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setMensajeError(err instanceof Error ? err.message : 'Error desconocido')
      setFase('error')
    } finally {
      enCursoRef.current = false
    }
  }

  const textoMensaje = `Hola ${clienteNombre}, te comparto tu resumen de cuenta de Agua Bambú.${saldo > 0 ? ` Saldo a pagar: ${money(saldo)}.` : ''}`
  const enlaceChat = enlaceWhatsapp(telefono, textoMensaje)

  const compartirArchivo = async () => {
    if (!archivo) return
    try {
      await navigator.share({ files: [archivo.file], text: textoMensaje })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return // el usuario cerró el menú
      toast.error('No se pudo abrir el menú de compartir. Usa «Abrir WhatsApp» y adjunta el PDF.')
    }
  }

  return (
    <>
      <Button
        onClick={abrir}
        disabled={deshabilitado}
        title={motivo}
        aria-label="Compartir resumen por WhatsApp"
        data-testid="btn-compartir-whatsapp"
        className="bg-[#0b7a4b] hover:bg-[#09663e] text-white min-h-11"
      >
        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z" />
        </svg>
        Compartir por WhatsApp
      </Button>

      <Modal
        open={fase !== 'cerrado'}
        onClose={cerrar}
        title="Compartir resumen por WhatsApp"
        data-testid="compartir-dialogo"
        className="bg-white rounded-2xl p-6 w-full max-w-lg mx-auto mt-10 md:mt-0 space-y-4"
      >
        {fase === 'confirmar' && (
          <div className="space-y-4" data-testid="compartir-confirmar">
            <p className="text-lg font-bold">Compartir resumen por WhatsApp</p>
            <p className="text-sm text-gray-700 leading-relaxed">
              Se generará un PDF para el cliente y se abrirá WhatsApp con su chat. Tú adjuntas el archivo y envías.
            </p>
            <dl className="border border-gray-200 rounded-xl p-3 text-sm space-y-1">
              <div><dt className="inline text-gray-500">Cliente: </dt><dd className="inline font-semibold">{clienteNombre}</dd></div>
              <div><dt className="inline text-gray-500">WhatsApp: </dt><dd className="inline font-semibold">{telefono}</dd></div>
              <div><dt className="inline text-gray-500">Incluye: </dt><dd className="inline">{facturas} factura{facturas === 1 ? '' : 's'} con productos, abonos y saldo total {money(saldo)}</dd></div>
              <div><dt className="inline text-gray-500">No incluye: </dt><dd className="inline">facturas anuladas</dd></div>
            </dl>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={cerrar}>Cancelar</Button>
              <Button onClick={() => generar(false)} data-testid="compartir-generar" className="bg-[#0b7a4b] hover:bg-[#09663e] text-white">
                Generar PDF y abrir WhatsApp
              </Button>
            </div>
          </div>
        )}

        {fase === 'generando' && (
          <div className="space-y-4" data-testid="compartir-generando" aria-live="polite">
            <p className="text-lg font-bold">Generando PDF…</p>
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden"><div className="h-2 w-1/2 bg-[#0b7a4b] animate-pulse" /></div>
            <p className="text-sm text-gray-700">Preparando el resumen. No cierres esta ventana.</p>
            <div className="flex justify-end"><Button disabled>Generando…</Button></div>
          </div>
        )}

        {fase === 'listo' && (
          <div className="space-y-4" data-testid="compartir-listo">
            <p className="text-lg font-bold text-green-700">PDF listo</p>
            <ol className="list-decimal pl-5 text-sm text-gray-700 leading-7">
              <li>Se descargó <strong>{archivo?.file.name}</strong>.</li>
              <li>Abre el chat de WhatsApp del cliente.</li>
              <li>Adjunta el PDF con el clip y envía.</li>
            </ol>
            <p className="text-xs text-gray-500">Queda anotado que se preparó el envío. No sabemos si se envió ni si lo leyó.</p>
            <div className="flex flex-wrap justify-end gap-2">
              {archivo && <Button variant="outline" onClick={() => descargar(archivo)}>Descargar de nuevo</Button>}
              {puedeCompartirArchivo && (
                <Button variant="outline" onClick={compartirArchivo} data-testid="compartir-archivo">Compartir archivo</Button>
              )}
              {enlaceChat && (
                <a
                  href={enlaceChat}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="compartir-abrir-whatsapp"
                  className="inline-flex items-center justify-center min-h-11 px-4 rounded-md bg-[#0b7a4b] hover:bg-[#09663e] text-white text-sm font-semibold"
                >
                  Abrir WhatsApp
                </a>
              )}
              <Button onClick={cerrar}>Cerrar</Button>
            </div>
          </div>
        )}

        {fase === 'error' && (
          <div className="space-y-4" data-testid="compartir-error">
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="font-bold text-red-800">No se pudo generar el PDF</p>
              <p className="text-sm text-red-700 mt-1 leading-relaxed">
                No se envió nada. Reintenta. Si sigue fallando, usa «Imprimir / Guardar PDF» y adjúntalo a mano.
              </p>
              {mensajeError && <p className="text-xs text-red-600 mt-1">{mensajeError}</p>}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={cerrar}>Cerrar</Button>
              <Button onClick={() => setFase(whatsappOk ? 'confirmar' : 'sin-telefono')} className="bg-[#0b7a4b] hover:bg-[#09663e] text-white">Reintentar</Button>
            </div>
          </div>
        )}

        {fase === 'sin-telefono' && (
          <div className="space-y-4" data-testid="compartir-sin-telefono">
            <p className="text-lg font-bold">Este cliente no tiene WhatsApp válido</p>
            <p className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 leading-relaxed">
              No se abrirá ningún chat para no escribirle a otro número. Puedes descargar el PDF y enviarlo por otro medio, o corregir el teléfono en la ficha del cliente.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={cerrar}>Cancelar</Button>
              <a
                href={`/clientes?openCliente=${clienteId}`}
                className="inline-flex items-center justify-center min-h-11 px-4 rounded-md border border-gray-300 text-sm font-medium"
              >
                Editar cliente
              </a>
              <Button onClick={() => generar(true)} data-testid="compartir-solo-descargar">Solo descargar PDF</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
