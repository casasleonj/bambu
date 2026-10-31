'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/modal'
import { useEnvioHabituales } from '@/hooks/use-envio-habituales'
import type { DecisionHabitual } from '@/lib/habituales-contrato'
import type { PreviewItem } from './types'
import { ProductosHabituales, fechaHabitual } from './habituales-ui'

const boton =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 disabled:opacity-50'
const principal =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50'
const motivos: Record<string, string> = {
  DECISION_SALTAR: 'Saltado según tu selección',
  CAMBIO_DESDE_REVISION:
    'Cambió desde la revisión; revisa sus fechas y productos',
  INACTIVA_O_AUSENTE: 'Se desactivó o ya no está disponible',
  ENTREGA_INSUFICIENTE: 'Falta una ubicación de entrega utilizable',
  DOMINGO_REPROGRAMADO: 'Reprogramado al lunes',
  LIMITE_FIADOS: 'Alcanzó el límite de fiados',
  CLIENTE_BLOQUEADO_O_INACTIVO: 'Cliente bloqueado o inactivo',
}

export function GeneracionHabituales({
  actor,
  puedeGenerar,
  onGenerado,
}: {
  actor: string
  puedeGenerar: boolean
  onGenerado: () => void | Promise<void>
}) {
  const [items, setItems] = useState<PreviewItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [decisiones, setDecisiones] = useState<
    Record<string, DecisionHabitual['decision']>
  >({})
  const [incluidos, setIncluidos] = useState<Record<string, boolean>>({})
  const abort = useRef<AbortController | null>(null)
  const intento = useEnvioHabituales(actor)
  const cargar = useCallback(async () => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setLoading(true)
    try {
      const response = await fetch('/api/pedidos/recurrentes', {
        cache: 'no-store',
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(25000)]),
      })
      const data = await response.json()
      if (ctrl.signal.aborted) return
      if (response.status === 401 || response.status === 403) setItems(null)
      if (
        !response.ok ||
        !data.success ||
        !Array.isArray(data.preview) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(data.hoy) ||
        !data.preview.every(
          (p: PreviewItem) =>
            typeof p.recurrenteId === 'string' &&
            typeof p.version === 'string' &&
            Number.isFinite(Date.parse(p.proximaFecha)) &&
            Array.isArray(p.sugerencias) &&
            p.cantidadBase &&
            typeof p.cantidadBase === 'object',
        )
      )
        throw new Error(
          data.error?.message || 'No se pudo consultar lo previsto para hoy.',
        )
      const hoy: PreviewItem[] = data.preview.filter(
        (p: PreviewItem) =>
          new Date(p.proximaFecha).toLocaleDateString('en-CA', {
            timeZone: 'America/Bogota',
          }) <= data.hoy,
      )
      setItems(hoy)
      setError(null)
      setDecisiones(
        Object.fromEntries(
          hoy.map((p) => [
            p.recurrenteId,
            p.sugerencias.find((s) => s.tipo === 'NORMAL' && !s.disabled)
              ?.tipo ??
              p.sugerencias.find((s) => !s.disabled)?.tipo ??
              'SALTAR',
          ]),
        ),
      )
      setIncluidos(
        Object.fromEntries(
          hoy.map((p) => [p.recurrenteId, !p.clienteBloqueado]),
        ),
      )
    } catch (e) {
      if (!ctrl.signal.aborted)
        setError(
          e instanceof Error ? e.message : 'No se pudo consultar la revisión.',
        )
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [])
  useEffect(() => {
    // Solicita el preview; no ejecuta generación al montar ni al recargar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar()
    return () => abort.current?.abort()
  }, [cargar])
  const seleccion: DecisionHabitual[] = (items ?? [])
    .filter((p) => incluidos[p.recurrenteId] && !p.clienteBloqueado)
    .map((p) => ({
      recurrenteId: p.recurrenteId,
      decision: decisiones[p.recurrenteId],
      proximaFecha: p.proximaFecha,
      version: p.version,
    }))
  const crear = seleccion.filter((d) => d.decision !== 'SALTAR').length
  const saltar = seleccion.length - crear
  const pendiente = !!intento.envio || intento.referenciaIlegible
  async function terminar() {
    if (!intento.cerrarResultado()) return
    setAbierto(false)
    setConfirmando(false)
    await Promise.all([cargar(), onGenerado()])
  }
  function cerrar() {
    if (!intento.ocupado) {
      setAbierto(false)
      setConfirmando(false)
    }
  }
  return (
    <section
      id="revision-habituales"
      className="rounded-xl border border-stone-200 bg-white p-4"
      data-testid="habituales-revision"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-stone-900">Para revisar hoy</h2>
          <p className="mt-1 text-sm text-stone-600">
            El sistema consulta; tú eliges qué preparar.
          </p>
        </div>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
          {pendiente
            ? 'Envío por comprobar'
            : loading
              ? 'Consultando…'
              : error
                ? 'Sin consulta vigente'
                : items?.length
                  ? `${items.length} para revisar`
                  : 'Ninguno para hoy'}
        </span>
      </div>
      {loading && (
        <p role="status" className="mt-4 text-sm text-stone-600">
          Consultando los pedidos previstos…
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {error} La lista de habituales sigue disponible abajo.
        </div>
      )}
      {pendiente ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">
            Hay un envío anterior por comprobar. Conservamos su referencia para
            evitar repetir pedidos.
          </p>
          <button
            type="button"
            onClick={() => {
              setAbierto(true)
              if (intento.envio) void intento.consultar()
            }}
            className={`${boton} mt-3`}
          >
            Comprobar envío anterior
          </button>
        </div>
      ) : !loading && !error && items?.length === 0 ? (
        <div className="mt-4 rounded-lg bg-stone-50 p-5 text-center">
          <p className="font-semibold text-stone-800">
            No hay pedidos habituales listos para hoy
          </p>
          <p className="mt-1 text-sm text-stone-600">
            Puedes seguir consultando y ajustando los de la lista.
          </p>
        </div>
      ) : null}
      {!pendiente && (
        <div className="mt-4 flex flex-wrap gap-2">
          {!!items?.length && (
            <button
              type="button"
              onClick={() => {
                setConfirmando(false)
                setAbierto(true)
              }}
              disabled={loading || !!error || !puedeGenerar}
              className={principal}
            >
              Revisar antes de crear
            </button>
          )}
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={loading}
            className={boton}
          >
            ↻ Actualizar revisión
          </button>
        </div>
      )}
      {!puedeGenerar && (
        <p className="mt-2 text-xs text-stone-600">
          Tu perfil permite consultar; no confirmar la generación.
        </p>
      )}
      <Modal
        open={abierto}
        onClose={cerrar}
        title={
          pendiente || intento.resultado
            ? 'Resultado del envío de habituales'
            : confirmando
              ? 'Confirmar selección de habituales'
              : 'Revisa antes de crear los pedidos'
        }
        className="mx-auto mt-4 max-h-[90dvh] w-full max-w-4xl overflow-y-auto rounded-xl bg-[#fbf9f4] p-4 md:mt-0 md:p-5"
        data-testid="habituales-dialog"
      >
        <div aria-busy={intento.ocupado} className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold text-stone-900">
              {pendiente || intento.resultado
                ? 'Resultado del envío'
                : confirmando
                  ? 'Confirma tu selección'
                  : 'Revisa antes de crear los pedidos'}
            </h2>
            <button
              type="button"
              onClick={cerrar}
              disabled={intento.ocupado}
              aria-label="Cerrar revisión"
              className={boton}
            >
              ✕
            </button>
          </div>
          {intento.error && (
            <p
              role="alert"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              {intento.error}
            </p>
          )}
          {intento.referenciaIlegible && (
            <p
              role="alert"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              No se pudo recuperar el envío anterior. Revisa los pedidos y
              solicita ayuda antes de volver a generar.
            </p>
          )}
          {pendiente || intento.resultado ? (
            <>
              <p className="text-sm text-stone-700">
                {intento.resultado?.estado === 'COMPLETO'
                  ? 'Se comprobó el resultado de toda la selección.'
                  : 'El resultado aún no está comprobado. Consulta este mismo envío antes de reintentarlo.'}
              </p>
              {intento.resultado && (
                <div className="space-y-2" data-testid="habituales-resultado">
                  {intento.resultado.items.map((i) => (
                    <div
                      key={i.recurrenteId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white p-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-stone-800">
                          {items?.find((p) => p.recurrenteId === i.recurrenteId)
                            ?.negocioNombre ??
                            items?.find(
                              (p) => p.recurrenteId === i.recurrenteId,
                            )?.clienteNombre ??
                            'Pedido habitual'}
                        </p>
                        <p
                          className={`mt-1 text-xs ${i.estado === 'GENERADO' ? 'text-emerald-800' : 'text-amber-900'}`}
                        >
                          {i.estado === 'GENERADO'
                            ? `Pedido #${i.numero} creado`
                            : i.estado === 'PENDIENTE'
                              ? 'Aún por resolver'
                              : (motivos[i.motivo ?? ''] ??
                                'No se generó. Revisa el habitual antes de continuar.')}
                        </p>
                      </div>
                      {i.pedidoId && (
                        <a
                          href={`/pedidos/${encodeURIComponent(i.pedidoId)}`}
                          className={boton}
                        >
                          Ver pedido →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {intento.resultado?.estado === 'COMPLETO' ? (
                  <button
                    type="button"
                    onClick={() => void terminar()}
                    disabled={intento.ocupado}
                    className={principal}
                  >
                    Volver a habituales
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void intento.consultar()}
                      disabled={intento.ocupado || !intento.envio}
                      className={boton}
                    >
                      {intento.ocupado ? 'Comprobando…' : 'Consultar resultado'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void intento.enviar()}
                      disabled={
                        intento.ocupado ||
                        !intento.consultado ||
                        !intento.envio ||
                        !puedeGenerar
                      }
                      className={principal}
                    >
                      Reintentar el mismo envío
                    </button>
                    {intento.rechazadoSinRegistro && (
                      <button
                        type="button"
                        onClick={() => {
                          if (intento.revisarRechazo()) {
                            setConfirmando(false)
                            void cargar()
                          }
                        }}
                        className={boton}
                      >
                        Actualizar la selección rechazada
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          ) : confirmando ? (
            <>
              <p className="text-sm text-stone-700">
                Solicitarás preparar{' '}
                <strong>
                  {crear} pedido{crear === 1 ? '' : 's'}
                </strong>
                {saltar ? (
                  <>
                    {' '}
                    y saltar <strong>{saltar}</strong> esta vez
                  </>
                ) : null}
                . El servidor verifica cada caso antes de crear.
              </p>
              <ul className="space-y-2">
                {seleccion.map((d) => {
                  const p = items!.find(
                    (p) => p.recurrenteId === d.recurrenteId,
                  )!
                  return (
                    <li
                      key={d.recurrenteId}
                      className="rounded-lg border border-stone-200 bg-white p-3 text-sm"
                    >
                      <strong>{p.negocioNombre ?? p.clienteNombre}</strong>
                      <p className="mt-1 text-stone-600">
                        {
                          p.sugerencias.find((s) => s.tipo === d.decision)
                            ?.label
                        }
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        {
                          p.sugerencias.find((s) => s.tipo === d.decision)
                            ?.descripcion
                        }
                      </p>
                    </li>
                  )
                })}
              </ul>
              <p className="rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
                Si se corta la conexión, conserva este envío y consulta su
                resultado. No confirmes otra selección para reemplazarlo.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  className={boton}
                >
                  Volver a revisar
                </button>
                <button
                  type="button"
                  onClick={() => void intento.enviar(seleccion)}
                  disabled={
                    intento.ocupado || !puedeGenerar || seleccion.length === 0
                  }
                  className={principal}
                >
                  Confirmar selección
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-stone-600">
                Este paso no crea pedidos ni registra cobros. Revisa productos,
                cantidades y la opción de cada cliente o negocio.
              </p>
              {items?.map((p) => (
                <article
                  key={p.recurrenteId}
                  className="rounded-xl border border-stone-200 bg-white p-3"
                  data-testid={`revision-habitual-${p.recurrenteId}`}
                >
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                    <div>
                      <label className="flex min-h-11 items-start gap-2">
                        <input
                          type="checkbox"
                          aria-label={`Incluir el habitual de ${p.negocioNombre ?? p.clienteNombre}`}
                          checked={!!incluidos[p.recurrenteId]}
                          disabled={p.clienteBloqueado}
                          onChange={(e) =>
                            setIncluidos((x) => ({
                              ...x,
                              [p.recurrenteId]: e.target.checked,
                            }))
                          }
                          className="mt-1 h-5 w-5"
                        />
                        <span>
                          <strong className="break-words text-sm text-stone-900">
                            {p.negocioNombre ? '🏪 ' : '👤 '}
                            {p.negocioNombre ?? p.clienteNombre}
                          </strong>
                          <span className="mt-1 block text-xs text-stone-500">
                            {p.negocioNombre
                              ? `Negocio de ${p.clienteNombre} · `
                              : ''}
                            Cada {p.cadaNDias} días · fecha prevista{' '}
                            {fechaHabitual(p.proximaFecha)}
                          </span>
                        </span>
                      </label>
                      <div className="mt-2">
                        <ProductosHabituales productos={p.cantidadBase} />
                      </div>
                      {p.clienteBloqueado && (
                        <p className="mt-2 text-xs text-amber-900">
                          Cliente bloqueado o inactivo: revisa su estado para
                          incluirlo.
                        </p>
                      )}
                      {p.entregaInsuficiente && (
                        <p className="mt-2 text-xs text-amber-900">
                          Falta información de entrega. El sistema no forzará un
                          domicilio sin ubicación suficiente.
                        </p>
                      )}
                      {!p.cumpleMinimo && (
                        <p className="mt-2 text-xs text-amber-900">
                          La cantidad habitual no alcanza el mínimo de 3
                          productos.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-stone-700">
                        Qué hacer
                        <select
                          aria-label={`Qué hacer con ${p.negocioNombre ?? p.clienteNombre}`}
                          value={decisiones[p.recurrenteId] ?? 'SALTAR'}
                          disabled={
                            !incluidos[p.recurrenteId] || p.clienteBloqueado
                          }
                          onChange={(e) =>
                            setDecisiones((d) => ({
                              ...d,
                              [p.recurrenteId]: e.target
                                .value as DecisionHabitual['decision'],
                            }))
                          }
                          className="mt-1 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-2 text-sm"
                        >
                          {p.sugerencias.map((s) => (
                            <option
                              key={s.tipo}
                              value={s.tipo}
                              disabled={s.disabled}
                            >
                              {s.label}
                              {s.disabledReason ? ` · ${s.disabledReason}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="mt-2 text-xs text-stone-600">
                        {
                          p.sugerencias.find(
                            (s) => s.tipo === decisiones[p.recurrenteId],
                          )?.descripcion
                        }
                      </p>
                      {decisiones[p.recurrenteId] === 'SALTAR' && (
                        <p className="mt-2 text-xs text-amber-900">
                          Saltar avanza a la próxima fecha; no elimina el
                          habitual.
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {p.pedidosPendientes.map((pedido) => (
                          <a
                            key={pedido.id}
                            href={`/pedidos/${encodeURIComponent(pedido.id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 items-center rounded-lg border border-stone-200 px-2 text-xs font-semibold text-blue-800"
                          >
                            Ver pendiente #{pedido.numero} ↗
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={cerrar} className={boton}>
                  Seguir consultando
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(true)}
                  disabled={
                    loading ||
                    !!error ||
                    seleccion.length === 0 ||
                    !puedeGenerar
                  }
                  className={principal}
                >
                  Revisar selección
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </section>
  )
}
