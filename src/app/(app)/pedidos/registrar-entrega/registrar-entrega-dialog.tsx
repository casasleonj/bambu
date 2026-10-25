'use client'

// TEMPORAL-SIN-EMBARQUE(#472): pantalla «Registrar entrega» del ADMIN, sin embarque.
// Dos pasos (datos → revisar antes de guardar). El servidor decide las reglas;
// aquí se guía con mensajes sencillos. Solo en línea: no usa fetchResilient para
// que una orden de administrador nunca se reenvíe sobre un estado viejo.
import { useState } from 'react'
import { Modal } from '@/components/modal'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import {
  armarPayload,
  completa,
  datosIniciales,
  hayErrores,
  hoyBogota,
  montoNumero,
  pendientes,
  pesos,
  resumen,
  saldoActual,
  sumarDias,
  validar,
  DIAS_MAX_ATRAS,
  CLIENTE_ANONIMO,
  type DatosEntrega,
  type MetodoCobro,
  type PedidoParaEntrega,
  type Repartidor,
} from './logica'

interface Props {
  pedido: PedidoParaEntrega
  repartidores: Repartidor[]
  onClose: () => void
  /** `deduped` = esta entrega ya estaba registrada (reintento). */
  onRegistrado: (info: { deduped: boolean; numero: number }) => void
}

const nombreProducto = (c: string) => getProductoIconConfig(c).label

const CAMPO = 'w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-900'
const TARJETA = 'rounded-xl border border-gray-200 bg-white p-4'
const ETIQUETA = 'mb-1 block text-sm font-semibold text-gray-800'
const AYUDA = 'mt-1 text-xs text-gray-600'
const ERROR = 'mt-1 text-sm text-red-700'

function Opcion({ name, checked, onChange, children, testId }: { name: string; checked: boolean; onChange: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
      <input type="radio" name={name} checked={checked} onChange={onChange} data-testid={testId} className="h-5 w-5" />
      <span>{children}</span>
    </label>
  )
}

export function RegistrarEntregaDialog({ pedido, repartidores, onClose, onRegistrado }: Props) {
  const [datos, setDatos] = useState<DatosEntrega>(() => datosIniciales(pedido))
  const [paso, setPaso] = useState<'datos' | 'revisar'>('datos')
  const [intento, setIntento] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [errorServidor, setErrorServidor] = useState<string | null>(null)
  // La clave es por BORRADOR (AGENTS.md, «Crear pedido»): cada apertura es un
  // borrador nuevo y los reintentos reusan la misma clave.
  const [offlineId] = useState(() => crypto.randomUUID())

  const errores = validar(pedido, datos)
  const esDomicilio = pedido.canal === 'DOMICILIO'
  const pend = pendientes(pedido)
  const monto = montoNumero(datos)
  const saldo = saldoActual(pedido)
  const saldoDespues = Math.max(0, saldo - monto)
  const entregaCompleta = datos.alcance !== null && completa(pedido, datos)
  const debe = saldoDespues > 0 && entregaCompleta && pedido.clienteId !== CLIENTE_ANONIMO
  const repartidorFijo = pedido.entregadoPorId ? repartidores.find((r) => r.id === pedido.entregadoPorId) : undefined
  const hoy = hoyBogota()

  const set = <K extends keyof DatosEntrega>(k: K, v: DatosEntrega[K]) => setDatos((d) => ({ ...d, [k]: v }))

  function revisar() {
    setIntento(true)
    if (hayErrores(errores)) return
    setErrorServidor(null)
    setPaso('revisar')
  }

  async function guardar() {
    if (enviando) return
    setEnviando(true)
    setErrorServidor(null)
    try {
      const res = await fetch(`/api/pedidos/${pedido.id}/gestion-admin/entrega`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(armarPayload(pedido, datos, offlineId)),
      })
      const json = (await res.json().catch(() => null)) as { error?: { message?: string }; deduped?: boolean } | null
      if (!res.ok) {
        setErrorServidor(json?.error?.message ?? 'No se pudo registrar la entrega. Intenta de nuevo.')
        return
      }
      onRegistrado({ deduped: Boolean(json?.deduped), numero: pedido.numero })
    } catch {
      setErrorServidor('No hay conexión. Esta acción solo se puede hacer con internet: revisa la señal e intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={paso === 'datos' ? 'Registrar entrega' : 'Revisa antes de guardar'}
      className="bg-white w-full h-[100dvh] md:h-auto md:max-h-[92vh] md:max-w-xl md:rounded-2xl overflow-y-auto"
      data-testid="registrar-entrega"
    >
      <div className="flex flex-col gap-4 p-4">
        <h2 className="text-lg font-bold text-gray-900">{paso === 'datos' ? 'Registrar entrega' : 'Revisa antes de guardar'}</h2>
        <p className="text-sm text-gray-800">
          Pedido <b>#{pedido.numero}</b> · {pedido.nombreCliente} · {pesos(pedido.total)}
        </p>

        {paso === 'datos' ? (
          <>
            <section className={TARJETA}>
              <span className={ETIQUETA}>¿Se entregó todo lo pedido? *</span>
              <div className="flex flex-col gap-2">
                <Opcion name="alcance" checked={datos.alcance === 'COMPLETA'} onChange={() => set('alcance', 'COMPLETA')} testId="alcance-todo">
                  Sí, se entregó todo ({pend.map((i) => `${i.pendiente} ${nombreProducto(i.producto)}`).join(', ')})
                </Opcion>
                <Opcion name="alcance" checked={datos.alcance === 'MENOS'} onChange={() => set('alcance', 'MENOS')} testId="alcance-menos">
                  No, entregó menos y el resto queda pendiente
                </Opcion>
              </div>
              {intento && errores.alcance && <p className={ERROR}>{errores.alcance}</p>}
              {datos.alcance === 'MENOS' && (
                <div className="mt-3 flex flex-col gap-2">
                  {pend.map((i) => (
                    <label key={i.producto} className="flex items-center justify-between gap-3 text-sm">
                      <span>{nombreProducto(i.producto)} (faltan {i.pendiente})</span>
                      <input
                        type="number"
                        min={0}
                        max={i.pendiente}
                        inputMode="numeric"
                        aria-label={`Cantidad entregada de ${nombreProducto(i.producto)}`}
                        value={datos.cantidades[i.producto] ?? 0}
                        onChange={(e) => set('cantidades', { ...datos.cantidades, [i.producto]: Number(e.target.value) })}
                        className="min-h-[44px] w-24 rounded-lg border border-gray-300 px-3 text-right"
                      />
                    </label>
                  ))}
                  {intento && errores.cantidades && <p className={ERROR}>{errores.cantidades}</p>}
                  <p className={AYUDA}>
                    Lo debido no cambia. Si el cliente prefirió menos y no falta nada, o pidió más, usa «Corregir cantidad» o crea un
                    pedido nuevo antes de registrar la entrega.
                  </p>
                </div>
              )}
            </section>

            <section className={TARJETA}>
              <label htmlFor="re-repartidor" className={ETIQUETA}>¿Quién lo entregó?{esDomicilio ? ' *' : ''}</label>
              {pedido.entregadoPorId ? (
                <p className="text-sm text-gray-900" data-testid="repartidor-fijo">
                  <b>{repartidorFijo?.nombre ?? 'Repartidor ya registrado'}</b> — un pedido tiene un solo repartidor.
                </p>
              ) : (
                <select id="re-repartidor" className={CAMPO} value={datos.repartidorId} onChange={(e) => set('repartidorId', e.target.value)}>
                  <option value="">{esDomicilio ? 'Elegir repartidor…' : 'Nadie (retiro en el local)'}</option>
                  {repartidores.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              )}
              {!pedido.entregadoPorId && <p className={AYUDA}>Aparecen los trabajadores activos con moto.</p>}
              {intento && errores.repartidor && <p className={ERROR}>{errores.repartidor}</p>}
            </section>

            <section className={TARJETA}>
              <label htmlFor="re-fecha" className={ETIQUETA}>¿Cuándo se entregó?</label>
              <input
                id="re-fecha"
                type="date"
                className={CAMPO}
                value={datos.fecha}
                min={sumarDias(hoy, -DIAS_MAX_ATRAS)}
                max={hoy}
                onChange={(e) => set('fecha', e.target.value || hoy)}
              />
              <p className={AYUDA}>Puedes elegir hasta {DIAS_MAX_ATRAS} días atrás. No un día ya cerrado.</p>
              {intento && errores.fecha && <p className={ERROR}>{errores.fecha}</p>}
            </section>

            <section className={`${TARJETA} flex flex-col gap-3`}>
              <div>
                <label htmlFor="re-monto" className={ETIQUETA}>¿Cuánto dinero se recibió?</label>
                <input
                  id="re-monto"
                  className={CAMPO}
                  inputMode="numeric"
                  placeholder="$0"
                  value={datos.monto}
                  onChange={(e) => set('monto', e.target.value)}
                />
                <p className={AYUDA}>Se debe {pesos(saldo)}. Déjalo vacío si no se recibió nada.</p>
                {intento && errores.monto && <p className={ERROR}>{errores.monto}</p>}
              </div>
              {monto > 0 && (
                <>
                  <div>
                    <span className={ETIQUETA}>¿Quién recibió el dinero? *</span>
                    <div className="flex flex-col gap-2">
                      <Opcion name="recibio" checked={datos.quienRecibio === 'REPARTIDOR'} onChange={() => set('quienRecibio', 'REPARTIDOR')} testId="recibio-repartidor">
                        Lo recibió el repartidor
                      </Opcion>
                      <Opcion name="recibio" checked={datos.quienRecibio === 'OFICINA'} onChange={() => set('quienRecibio', 'OFICINA')} testId="recibio-oficina">
                        Se pagó en la oficina
                      </Opcion>
                    </div>
                    <p className={AYUDA}>No viene marcada para evitar errores.</p>
                    {intento && errores.quienRecibio && <p className={ERROR}>{errores.quienRecibio}</p>}
                  </div>
                  <div>
                    <label htmlFor="re-metodo" className={ETIQUETA}>Forma de pago</label>
                    <select id="re-metodo" className={CAMPO} value={datos.metodo} onChange={(e) => set('metodo', e.target.value as MetodoCobro)}>
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="TRANSFERENCIA">Transferencia</option>
                      <option value="NEQUI">Nequi</option>
                      <option value="DAVIPLATA">Daviplata</option>
                    </select>
                  </div>
                </>
              )}
            </section>

            {debe && (
              <section className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
                <b>Quedan debiendo {pesos(saldoDespues)}</b> a {pedido.nombreCliente}.
                <label htmlFor="re-promesa" className="mt-2 block font-semibold">¿Hasta cuándo promete pagar? *</label>
                <input id="re-promesa" type="date" className={`${CAMPO} mt-1`} value={datos.promesa} min={hoy} onChange={(e) => set('promesa', e.target.value)} />
                {intento && errores.promesa && <p className={ERROR}>{errores.promesa}</p>}
              </section>
            )}

            <section className={TARJETA}>
              <label htmlFor="re-nota" className={ETIQUETA}>Nota (opcional)</label>
              <input id="re-nota" className={CAMPO} maxLength={500} value={datos.nota} onChange={(e) => set('nota', e.target.value)} />
            </section>

            {intento && hayErrores(errores) && (
              <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">Revisa los campos marcados para continuar.</p>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="min-h-[44px] flex-1 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800">Cancelar</button>
              <button type="button" onClick={revisar} data-testid="re-revisar" className="min-h-[44px] flex-[2] rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white">Revisar</button>
            </div>
          </>
        ) : (
          <>
            <ul className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-900" data-testid="re-resumen">
              {resumen(pedido, datos, repartidores, nombreProducto).map((f) => <li key={f}>• {f}</li>)}
            </ul>
            <p className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
              <b>Esto no se puede deshacer desde aquí.</b> Si algo está mal, vuelve y corrígelo ahora.
            </p>
            {errorServidor && <p role="alert" data-testid="re-error" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{errorServidor}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setPaso('datos')} disabled={enviando} className="min-h-[44px] flex-1 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 disabled:opacity-50">Volver</button>
              <button type="button" onClick={() => void guardar()} disabled={enviando} data-testid="re-guardar" className="min-h-[44px] flex-[2] rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50">
                {enviando ? 'Guardando…' : 'Confirmar y guardar'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
