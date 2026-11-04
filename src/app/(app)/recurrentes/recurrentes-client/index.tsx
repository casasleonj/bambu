'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { pedidosV2Enabled } from '@/lib/flags'
import { useShallowSearchParams } from '@/hooks/use-shallow-search-params'
import { usePollingRefetch } from '@/hooks/use-polling-refetch'
import { vueltaAPedidos } from '@/lib/pedidos-contexto'
import type { Recurrente } from './types'
import { ProductosHabituales, fechaHabitual } from './habituales-ui'
import { GeneracionHabituales } from './generacion-habituales'

export default function RecurrentesClient({
  initialRecurrentes,
  initialError,
  initialLeidoAt,
}: {
  initialRecurrentes?: Recurrente[]
  initialError?: string
  initialLeidoAt?: string
}) {
  const { data: session } = useSession()
  const router = useRouter()
  const actor = session?.user?.id ?? ''
  const rol = session?.user?.role ?? ''
  const params = useShallowSearchParams()
  const [interactivo, setInteractivo] = useState(false)
  useEffect(() => {
    // La URL ya tiene sus listeners: no aceptar texto antes de hidratar,
    // cuando un cambio podría perderse y el enlace de regreso quedar viejo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInteractivo(true)
  }, [])
  const search = params.get('q') ?? ''
  const filtro = ['activos', 'inactivos'].includes(params.get('estado') ?? '')
    ? params.get('estado')!
    : 'todos'
  const volver = vueltaAPedidos(params.get('volver')) ?? '/pedidos'
  const volverCatalogo = `/recurrentes${params.toString() ? `?${params.toString()}` : ''}`
  const [recurrentes, setRecurrentes] = useState<Recurrente[] | null>(
    initialRecurrentes ?? null,
  )
  const [leidoAt, setLeidoAt] = useState(initialLeidoAt ?? null)
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [loading, setLoading] = useState(initialRecurrentes === undefined)
  const abort = useRef<AbortController | null>(null)
  const cargar = useCallback(async () => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setLoading(true)
    try {
      const response = await fetch('/api/recurrentes?incluirInactivos=true', {
        cache: 'no-store',
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(25000)]),
      })
      if (response.status === 401 || response.status === 403) {
        setRecurrentes(null)
        setLeidoAt(null)
      }
      const data = await response.json()
      if (
        !response.ok ||
        !data.success ||
        !Array.isArray(data.recurrentes) ||
        !Number.isFinite(Date.parse(data.leidoAt))
      )
        throw new Error(
          data.error?.message || 'No se pudo actualizar la lista.',
        )
      if (!ctrl.signal.aborted) {
        setRecurrentes(data.recurrentes)
        setLeidoAt(data.leidoAt)
        setError(null)
      }
    } catch (e) {
      if (!ctrl.signal.aborted)
        setError(
          e instanceof Error ? e.message : 'No se pudo consultar la lista.',
        )
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [])
  useEffect(() => {
    // Consulta externa real cuando no hay lectura del servidor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!initialRecurrentes) void cargar()
    return () => abort.current?.abort()
  }, [cargar, initialRecurrentes])
  usePollingRefetch(cargar, 60000)
  const q = search.trim().toLocaleLowerCase('es')
  const visibles = recurrentes?.filter(
    (r) =>
      (filtro === 'todos' || (filtro === 'activos' ? r.activo : !r.activo)) &&
      `${r.negocio?.nombre ?? ''} ${r.cliente?.nombre ?? ''} ${r.negocio?.cliente?.nombre ?? ''}`
        .toLocaleLowerCase('es')
        .includes(q),
  )
  return (
    <div
      className="mx-auto max-w-6xl space-y-4 pb-8"
      data-testid="habituales-page"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">
            Pedidos habituales
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Consulta los productos y la frecuencia de cada cliente o negocio.
          </p>
        </div>
        {!pedidosV2Enabled() && (
          <button
            type="button"
            onClick={() => router.push('/recurrentes/nuevo')}
            className="inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white"
          >
            + Nueva Plantilla
          </button>
        )}
        <a
          href={volver}
          className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700"
        >
          ← Pedidos
        </a>
      </header>
      <div className="rounded-xl border border-stone-200 bg-[#f7f3eb] p-3 text-sm text-stone-700">
        Revisa lo previsto para hoy. Los pedidos se crean después de tu
        confirmación.
      </div>
      {actor ? (
        <GeneracionHabituales
          key={`generacion-habituales:${actor}`}
          actor={actor}
          puedeGenerar={['ADMIN', 'ASISTENTE', 'CONTADOR'].includes(rol)}
          onGenerado={cargar}
        />
      ) : (
        <section
          aria-busy="true"
          className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600"
        >
          Comprobando sesión para revisar los pedidos de hoy…
        </section>
      )}
      <section
        className="rounded-xl border border-stone-200 bg-white p-4"
        aria-labelledby="catalogo-habituales-title"
        data-testid="habituales-catalogo"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="catalogo-habituales-title"
              className="font-bold text-stone-900"
            >
              Tus pedidos habituales
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Siguen disponibles aunque hoy no corresponda generar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={loading || !interactivo}
            className="min-h-11 rounded-lg border border-stone-300 px-3 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? 'Consultando…' : '↻ Actualizar lista'}
          </button>
        </div>
        <label className="mt-4 block text-sm font-medium text-stone-700">
          Buscar cliente o negocio
          <input
            type="search"
            disabled={!interactivo}
            value={search}
            maxLength={200}
            onChange={(e) =>
              params.set(
                { q: e.target.value || undefined },
                { history: 'replace' },
              )
            }
            placeholder="Nombre del cliente o de la tienda"
            className="mt-1 min-h-11 w-full rounded-lg border border-stone-300 px-3 text-base sm:max-w-lg"
          />
        </label>
        <div
          role="group"
          aria-label="Estado del habitual"
          className="my-3 flex flex-wrap gap-2"
        >
          {[
            ['todos', 'Todos'],
            ['activos', 'Activos'],
            ['inactivos', 'Pausados / inactivos'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              disabled={!interactivo}
              aria-pressed={filtro === key}
              onClick={() =>
                params.set(
                  { estado: key === 'todos' ? undefined : key },
                  { history: 'push' },
                )
              }
              className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${filtro === key ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-stone-200 text-stone-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {error && (
          <div
            role="alert"
            className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {error} {recurrentes && 'Se conserva la última lista consultada.'}
          </div>
        )}
        {leidoAt && (
          <p className="mb-3 text-xs text-stone-500">
            Última consulta:{' '}
            {new Date(leidoAt).toLocaleString('es-CO', {
              timeZone: 'America/Bogota',
            })}
            {visibles
              ? ` · ${visibles.length} resultado${visibles.length === 1 ? '' : 's'}`
              : ''}
          </p>
        )}
        {!recurrentes && loading && (
          <p
            role="status"
            className="rounded-lg bg-stone-50 p-6 text-center text-sm text-stone-600"
          >
            Consultando los habituales…
          </p>
        )}
        {visibles && visibles.length === 0 && (
          <div className="rounded-lg bg-stone-50 p-6 text-center">
            <p className="font-semibold text-stone-800">
              {recurrentes?.length
                ? 'No hay resultados con estos filtros'
                : 'Todavía no hay pedidos habituales'}
            </p>
            <p className="mt-1 text-sm text-stone-600">
              {recurrentes?.length
                ? 'Revisa el nombre o selecciona Todos.'
                : 'Puedes guardar uno después de crear un pedido.'}
            </p>
          </div>
        )}
        <div className="divide-y divide-stone-200">
          {visibles?.map((r) => (
            <article
              key={r.id}
              data-testid={`habitual-${r.id}`}
              className="grid min-w-0 gap-3 py-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] xl:items-center"
            >
              <div className="min-w-0">
                <p className="break-words font-bold text-stone-900">
                  <span aria-hidden="true">{r.negocio ? '🏪 ' : '👤 '}</span>
                  {r.negocio?.nombre ??
                    r.cliente?.nombre ??
                    'Contexto por revisar'}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  {r.negocio
                    ? `Negocio${r.negocio.cliente ? ` de ${r.negocio.cliente.nombre}` : ''}`
                    : 'Cliente'}
                </p>
                <span
                  className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${r.activo ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 text-stone-700'}`}
                >
                  {r.activo ? 'Activo' : 'Sin generación'}
                </span>
              </div>
              <ProductosHabituales productos={r.productos} />
              <div className="text-sm text-stone-700">
                <p className="font-semibold">
                  ↻ Cada {r.cadaNDias} día{r.cadaNDias === 1 ? '' : 's'}
                </p>
                <p className="mt-1 text-xs">
                  {r.activo
                    ? `Próxima fecha: ${fechaHabitual(r.proxGeneracion)}`
                    : 'No se generarán nuevos pedidos'}
                </p>
                {r.horaPreferida && (
                  <p className="mt-1 text-xs">
                    Hora preferida: {r.horaPreferida}
                  </p>
                )}
                {r.pausaHasta && (
                  <p className="mt-1 text-xs text-amber-800">
                    Fecha de pausa registrada: {fechaHabitual(r.pausaHasta)}.{' '}
                    {r.activo
                      ? 'El habitual sigue activo; revisa su estado antes de generar.'
                      : 'Sigue sin generación hasta que lo actives.'}
                  </p>
                )}
              </div>
              <a
                href={`/recurrentes/${encodeURIComponent(r.id)}?volverHabituales=${encodeURIComponent(volverCatalogo)}`}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700"
              >
                Ver y ajustar →
              </a>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
