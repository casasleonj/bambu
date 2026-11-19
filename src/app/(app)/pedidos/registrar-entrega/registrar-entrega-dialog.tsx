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
  erroresLineas,
  hayErrores,
  hoyBogota,
  METODOS_COBRO,
  montoNumero,
  pendientes,
  pesos,
  resumen,
  resumenRegalos,
  saldoActual,
  saldoEntregadoTrasEntrega,
  sumarDias,
  validar,
  DIAS_MAX_ATRAS,
  CLIENTE_ANONIMO,
  type DatosEntrega,
  type LineaCobro,
  type MetodoCobro,
  type PedidoParaEntrega,
  type Repartidor,
} from './logica'

interface Props {
  pedido: PedidoParaEntrega
  repartidores: Repartidor[]
  fiadoParcialActivo?: boolean
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

export function RegistrarEntregaDialog({ pedido, repartidores, fiadoParcialActivo = false, onClose, onRegistrado }: Props) {
  const [datos, setDatos] = useState<DatosEntrega>(() => datosIniciales(pedido))
  const [paso, setPaso] = useState<'datos' | 'revisar'>('datos')
  const [intento, setIntento] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [errorServidor, setErrorServidor] = useState<string | null>(null)
  const [promesaExigidaPorServidor, setPromesaExigidaPorServidor] = useState(false)
  // La clave es por BORRADOR (AGENTS.md, «Crear pedido»): cada apertura es un
  // borrador nuevo y los reintentos reusan la misma clave.
  const [offlineId] = useState(() => crypto.randomUUID())

  const modoParcial = fiadoParcialActivo || promesaExigidaPorServidor
  const errores = validar(pedido, datos, new Date(), modoParcial)
  const esDomicilio = pedido.canal === 'DOMICILIO'
  const pend = pendientes(pedido)
  const regaloResumen = resumenRegalos(pedido, datos)
  const monto = montoNumero(datos)
  const saldo = saldoActual(pedido)
  const entregaCompleta = datos.alcance !== null && completa(pedido, datos)
  const deudaEntregada = saldoEntregadoTrasEntrega(pedido, datos, modoParcial)
  const debe = (deudaEntregada ?? 0) > 0 && pedido.clienteId !== CLIENTE_ANONIMO
  const repartidorFijo = pedido.entregadoPorId ? repartidores.find((r) => r.id === pedido.entregadoPorId) : undefined
  const hoy = hoyBogota()

  const set = <K extends keyof DatosEntrega>(k: K, v: DatosEntrega[K]) => setDatos((d) => ({ ...d, [k]: v }))

  // #498: el cobro tiene una línea por medio de pago.
  const erroresDeLineas = erroresLineas(datos)
  const mediosUsados = new Set(datos.lineas.map((l) => l.metodo))
  const medioLibre = METODOS_COBRO.find((m) => !mediosUsados.has(m.valor))?.valor
  const cambiarLinea = (i: number, cambios: Partial<LineaCobro>) =>
    setDatos((d) => ({ ...d, lineas: d.lineas.map((l, j) => (j === i ? { ...l, ...cambios } : l)) }))
  const agregarLinea = () => {
    if (!medioLibre) return
    setDatos((d) => ({ ...d, lineas: [...d.lineas, { metodo: medioLibre, monto: '' }] }))
  }
  const quitarLinea = (i: number) =>
    setDatos((d) => ({ ...d, lineas: d.lineas.length > 1 ? d.lineas.filter((_, j) => j !== i) : d.lineas }))

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
      const json = (await res.json().catch(() => null)) as { error?: { message?: string; code?: string }; deduped?: boolean } | null
      if (!res.ok) {
        if (json?.error?.code === 'PROMESA_REQUERIDA') {
          setPromesaExigidaPorServidor(true)
          setIntento(true)
          setPaso('datos')
        }
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
                  Sí, se entregó todo ({pend.map((i) => `${i.pendiente + (i.pendienteRegalo ?? 0)} ${nombreProducto(i.producto)}${i.pendienteRegalo !== undefined ? `: ${i.pendiente} con precio + ${i.pendienteRegalo} de regalo` : ''}`).join(', ')})
                </Opcion>
                <Opcion name="alcance" checked={datos.alcance === 'MENOS'} onChange={() => set('alcance', 'MENOS')} testId="alcance-menos">
                  No, entregó menos y el resto queda pendiente
                </Opcion>
              </div>
              {intento && errores.alcance && <p className={ERROR}>{errores.alcance}</p>}
              {datos.alcance === 'MENOS' && (
                <div className="mt-3 flex flex-col gap-2">
                  {pend.map((i) => {
                    // #848: el campo es lo que se entrega AHORA; lo que quedará pendiente se calcula aparte.
                    const linea = pedido.items.find((x) => x.producto === i.producto)
                    const entregadasAntes = linea?.cantEntrega ?? 0
                    const pedidas = linea?.cantPedido ?? i.pendiente + entregadasAntes
                    const ahora = Number(datos.cantidades[i.producto] ?? 0)
                    const quedaran = Math.max(0, i.pendiente - (Number.isFinite(ahora) ? ahora : 0))
                    const regaloAhora = datos.regalos?.[i.producto] ?? 0
                    const regalosQuedaran = Math.max(0, (i.pendienteRegalo ?? 0) - (Number.isFinite(regaloAhora) ? regaloAhora : 0))
                    return (
                      <div key={i.producto} className="flex flex-col gap-1 text-sm">
                        <span className="font-semibold text-gray-900">{nombreProducto(i.producto)}</span>
                        <span className="text-xs text-gray-700">Pedidas {pedidas} · ya entregadas {entregadasAntes}</span>
                        <span className="flex items-center justify-between gap-3">
                          <span>{i.pendienteRegalo !== undefined ? 'Con precio · entregadas ahora' : '¿Cuántas entregas ahora?'}</span>
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
                        </span>
                        {i.pendienteRegalo !== undefined && (
                          <label className="flex items-center justify-between gap-3">
                            <span>De regalo · entregadas ahora</span>
                            <input type="number" min={0} max={i.pendienteRegalo} step={1} inputMode="numeric"
                              aria-label={`Regalos entregados de ${nombreProducto(i.producto)}`}
                              value={datos.regalos?.[i.producto] ?? 0}
                              onChange={e => set('regalos', { ...datos.regalos, [i.producto]: Number(e.target.value) })}
                              className="min-h-[44px] w-24 rounded-lg border border-gray-300 px-3 text-right" />
                          </label>
                        )}
                        <span className="text-xs font-semibold text-gray-800" data-testid={`quedaran-${i.producto}`} aria-live="polite">
                          {i.pendienteRegalo !== undefined ? `Quedarán ${quedaran} con precio y ${regalosQuedaran} de regalo` :
                            quedaran === 0 ? 'No quedará nada por entregar' : `Quedarán ${quedaran} por entregar`}
                        </span>
                      </div>
                    )
                  })}
                  {intento && errores.cantidades && <p className={ERROR}>{errores.cantidades}</p>}
                  <p className={AYUDA}>
                    Si la cantidad pedida cambió, corrígela en el pedido con «Corregir la cantidad» antes de entregar.
                  </p>
                </div>
              )}
              {regaloResumen && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <p>📦 Se entregan <strong>{regaloResumen.fisicas} unidades físicas</strong>.</p>
                  <p>🧾 Valor de esta entrega: <strong>{regaloResumen.valor === null ? 'Por verificar' : pesos(regaloResumen.valor)}</strong>.</p>
                  {esDomicilio && <p>🚚 Base física para reparto: <strong>{regaloResumen.fisicas} unidades</strong>. Aplica cuando corresponde comisión.</p>}
                  <p className="mt-1 text-xs">«Con precio» identifica la mercancía a cobrar. El pago se registra en el apartado de cobro.</p>
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
              <div data-testid="re-cobro">
                <span className={ETIQUETA}>¿Cuánto dinero se recibió y con qué medios?</span>
                <div className="flex flex-col gap-2">
                  {datos.lineas.map((l, i) => (
                    <div key={i} data-testid={`re-linea-${i}`}>
                      <div className="grid grid-cols-[1.3fr_1fr_44px] items-end gap-2">
                        <div>
                          <label htmlFor={`re-metodo-${i}`} className="mb-1 block text-xs text-gray-600">Medio</label>
                          <select
                            id={`re-metodo-${i}`}
                            className={CAMPO}
                            value={l.metodo}
                            onChange={(e) => cambiarLinea(i, { metodo: e.target.value as MetodoCobro })}
                          >
                            {METODOS_COBRO.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`re-monto-${i}`} className="mb-1 block text-xs text-gray-600">Monto{datos.lineas.length > 1 ? '' : ' recibido'}</label>
                          <input
                            id={`re-monto-${i}`}
                            className={`${CAMPO} ${intento && erroresDeLineas[i] ? 'border-red-400 bg-red-50' : ''}`}
                            inputMode="numeric"
                            placeholder="$0"
                            value={l.monto}
                            aria-invalid={intento && erroresDeLineas[i] ? true : undefined}
                            onChange={(e) => cambiarLinea(i, { monto: e.target.value })}
                          />
                        </div>
                        {datos.lineas.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => quitarLinea(i)}
                            aria-label={`Quitar la línea de ${METODOS_COBRO.find((m) => m.valor === l.metodo)?.etiqueta ?? 'pago'}`}
                            data-testid={`re-quitar-${i}`}
                            className="min-h-[44px] rounded-lg border border-gray-300 bg-white text-base text-gray-600"
                          >
                            ✕
                          </button>
                        ) : <span />}
                      </div>
                      {erroresDeLineas[i] && <p className={ERROR} data-testid={`re-linea-error-${i}`}>{erroresDeLineas[i]}</p>}
                    </div>
                  ))}
                </div>
                {medioLibre && (
                  <button
                    type="button"
                    onClick={agregarLinea}
                    data-testid="re-agregar-medio"
                    className="mt-1 min-h-[44px] text-sm font-semibold text-blue-700 hover:underline"
                  >
                    + Agregar otro medio
                  </button>
                )}
                <p className={AYUDA}>Se debe {pesos(saldo)}. Déjalo vacío si no se recibió nada.</p>
                {monto > 0 && (
                  <p
                    className={`mt-1 flex justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${monto > saldo ? 'border-red-300 bg-red-50 text-red-800' : 'border-gray-200 bg-gray-50 text-gray-900'}`}
                    data-testid="re-recibido"
                  >
                    <span>Recibido</span>
                    <b>
                      {pesos(monto)} de {pesos(saldo)} ·{' '}
                      {monto > saldo ? `se pasa por ${pesos(monto - saldo)}` : monto === saldo ? 'pagado completo' : `quedan ${pesos(saldo - monto)}`}
                    </b>
                  </p>
                )}
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
                </>
              )}
            </section>

            {debe && (
              <section className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
                <b>Quedan debiendo {pesos(deudaEntregada ?? 0)}</b> a {pedido.nombreCliente}.
                {!entregaCompleta && <p className={AYUDA}>Solo lo entregado; la mercancía pendiente no se cobra como recibida.</p>}
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
              {resumen(pedido, datos, repartidores, nombreProducto, modoParcial).map((f) => <li key={f}>• {f}</li>)}
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
