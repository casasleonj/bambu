'use client'

// TEMPORAL-SIN-EMBARQUE(#472): pantalla «Corregir canal» del ADMIN. Dos pasos
// (elegir → revisar el impacto antes de guardar). El servidor decide las reglas;
// la vista previa corre TODAS y muestra su mensaje tal cual. Solo en línea: no usa
// fetchResilient para que una orden de administrador nunca se reenvíe sobre un
// estado viejo.
import { useState } from 'react'
import { Modal } from '@/components/modal'
import { pesos } from '../registrar-entrega/logica'
import {
  canalOpuesto,
  nombreCanal,
  resumenCambio,
  validarCorreccion,
  type CambioCanal,
  type CanalPedido,
  type ModoPrecios,
} from './logica'

interface Props {
  pedido: { id: string; numero: number; canal: string; nombreCliente: string; total: number }
  onClose: () => void
  /** `deduped` = esta corrección ya estaba aplicada (reintento). */
  onCorregido: (info: { deduped: boolean; numero: number; canalDespues: CanalPedido }) => void
}

const CAMPO = 'w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-900'
const TARJETA = 'rounded-xl border border-gray-200 bg-white p-4'
const ETIQUETA = 'mb-1 block text-sm font-semibold text-gray-800'
const AYUDA = 'mt-1 text-xs text-gray-600'
const ERROR = 'mt-1 text-sm text-red-700'

function Opcion({ name, checked, onChange, children, testId }: { name: string; checked: boolean; onChange: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
      <input type="radio" name={name} checked={checked} onChange={onChange} data-testid={testId} className="mt-0.5 h-5 w-5" />
      <span>{children}</span>
    </label>
  )
}

export function CorregirCanalDialog({ pedido, onClose, onCorregido }: Props) {
  const canalAntes: CanalPedido = pedido.canal === 'DOMICILIO' ? 'DOMICILIO' : 'PUNTO'
  const canalNuevo = canalOpuesto(canalAntes)
  const [precios, setPrecios] = useState<ModoPrecios>('CONSERVAR')
  const [motivo, setMotivo] = useState('')
  const [paso, setPaso] = useState<'datos' | 'revisar'>('datos')
  const [intento, setIntento] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [errorServidor, setErrorServidor] = useState<string | null>(null)
  const [cambio, setCambio] = useState<CambioCanal | null>(null)
  // La clave es por BORRADOR: cada apertura es un borrador nuevo y los reintentos la reusan.
  const [offlineId] = useState(() => crypto.randomUUID())
  const errores = validarCorreccion({ motivo })
  const idMotivo = `cc-motivo-${offlineId}`

  async function enviar(vistaPrevia: boolean) {
    if (trabajando) return
    setTrabajando(true)
    setErrorServidor(null)
    try {
      const res = await fetch(`/api/pedidos/${pedido.id}/gestion-admin/canal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offlineId, canal: canalNuevo, precios, motivo: motivo.trim(), vistaPrevia }),
      })
      const json = (await res.json().catch(() => null)) as
        | { error?: { message?: string }; cambio?: CambioCanal; deduped?: boolean }
        | null
      if (!res.ok || !json?.cambio) {
        setErrorServidor(json?.error?.message ?? 'No se pudo corregir el canal. Intenta de nuevo.')
        return
      }
      if (vistaPrevia) {
        setCambio(json.cambio)
        setPaso('revisar')
      } else {
        onCorregido({ deduped: Boolean(json.deduped), numero: pedido.numero, canalDespues: canalNuevo })
      }
    } catch {
      setErrorServidor('No hay conexión. Esta acción solo se puede hacer con internet: revisa la señal e intenta de nuevo.')
    } finally {
      setTrabajando(false)
    }
  }

  function revisar() {
    setIntento(true)
    if (Object.keys(errores).length > 0) return
    void enviar(true)
  }

  const titulo = paso === 'datos' ? 'Corregir canal' : 'Revisa antes de guardar'
  return (
    <Modal
      open
      onClose={onClose}
      title={titulo}
      className="bg-white w-full h-[100dvh] md:h-auto md:max-h-[92vh] md:max-w-xl md:rounded-2xl overflow-y-auto"
      data-testid="corregir-canal"
    >
      <div className="flex flex-col gap-4 p-4">
        <h2 className="text-lg font-bold text-gray-900">{titulo}</h2>
        <p className="text-sm text-gray-800">
          Pedido <b>#{pedido.numero}</b> · {pedido.nombreCliente} · {pesos(pedido.total)}
        </p>

        {paso === 'datos' ? (
          <>
            <section className={TARJETA}>
              <span className={ETIQUETA}>Canal</span>
              <p className="text-sm text-gray-900" data-testid="cc-canales">
                Hoy es de <b>{nombreCanal(canalAntes)}</b>. Pasará a <b>{nombreCanal(canalNuevo)}</b>.
              </p>
              <p className={AYUDA}>Solo pedidos abiertos, sin entregas ni embarque.</p>
            </section>

            <section className={TARJETA}>
              <span className={ETIQUETA}>¿Qué pasa con los precios?</span>
              <div className="flex flex-col gap-2">
                <Opcion name="cc-precios" checked={precios === 'CONSERVAR'} onChange={() => setPrecios('CONSERVAR')} testId="cc-conservar">
                  <b>Conservar los precios</b> (recomendado). Solo cambia el canal; el total es el mismo.
                </Opcion>
                <Opcion name="cc-precios" checked={precios === 'RECALCULAR'} onChange={() => setPrecios('RECALCULAR')} testId="cc-recalcular">
                  <b>Recalcular los precios</b>. {canalNuevo === 'DOMICILIO' ? 'Se suma el sobrecosto de domicilio.' : 'Se quita el sobrecosto de domicilio.'} Los precios puestos a mano se respetan.
                </Opcion>
              </div>
            </section>

            <section className={TARJETA}>
              <label htmlFor={idMotivo} className={ETIQUETA}>Motivo *</label>
              <input
                id={idMotivo}
                className={CAMPO}
                maxLength={500}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej.: se registró como domicilio por error"
              />
              {intento && errores.motivo && <p className={ERROR}>{errores.motivo}</p>}
            </section>

            {errorServidor && <p role="alert" data-testid="cc-error" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{errorServidor}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="min-h-[44px] flex-1 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800">Cancelar</button>
              <button type="button" onClick={revisar} disabled={trabajando} data-testid="cc-revisar" className="min-h-[44px] flex-[2] rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50">
                {trabajando ? 'Revisando…' : 'Revisar'}
              </button>
            </div>
          </>
        ) : (
          <>
            <ul className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-900" data-testid="cc-resumen">
              {cambio && resumenCambio(cambio).map((f) => <li key={f}>• {f}</li>)}
              <li>• Motivo: {motivo.trim()}</li>
            </ul>
            <p className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
              <b>Queda registrado quién lo corrigió y por qué.</b> Si algo está mal, vuelve y corrígelo ahora.
            </p>
            {errorServidor && <p role="alert" data-testid="cc-error" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{errorServidor}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setPaso('datos')} disabled={trabajando} className="min-h-[44px] flex-1 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 disabled:opacity-50">Volver</button>
              <button type="button" onClick={() => void enviar(false)} disabled={trabajando} data-testid="cc-guardar" className="min-h-[44px] flex-[2] rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50">
                {trabajando ? 'Guardando…' : 'Confirmar y guardar'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
