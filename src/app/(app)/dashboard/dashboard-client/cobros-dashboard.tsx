'use client'
import Link from 'next/link'
import {
  Banknote,
  Smartphone,
  Wallet,
  TriangleAlert,
  CircleHelp,
  ShoppingBag,
  Truck,
} from 'lucide-react'
import { Modal } from '@/components/modal'
import { MoneyDisplay } from '@/components/money-display'
import { userCan } from '@/lib/permissions'
import type { Role } from '@/lib/constants'
import type { CobrosPeriodo } from '@/lib/cobros-periodo'

export const NOMBRES_MEDIO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  TRANSFERENCIA: 'Transferencia',
  BONO: 'Crédito aplicado',
  SIN_IDENTIFICAR: 'Medio por identificar',
}
export function pendienteMedio(cobros: CobrosPeriodo, metodo: string) {
  return cobros.porConciliar.some(
    (p) => p.metodo === null || p.metodo === metodo,
  )
}
interface Props {
  cobros: CobrosPeriodo | null | undefined
  deuda: number
  deudaHoy: number
  userRole?: string | null
  detalle: string | null
  onDetalle: (medio: string | null) => void
}
export function CobrosDashboard({
  cobros,
  deuda,
  deudaHoy,
  userRole,
  detalle,
  onDetalle,
}: Props) {
  const dinero = (n: number) => <MoneyDisplay value={n} userRole={userRole} />
  if (!cobros)
    return (
      <section
        className="rounded-xl border border-amber-200 bg-amber-50 p-5"
        role="status"
      >
        <h2 className="font-semibold">Medios de pago pendientes de consulta</h2>
        <p className="mt-2 text-sm">
          Sin una lectura válida no se puede afirmar que no hubo cobros. Usa
          Actualizar para reintentar.
        </p>
      </section>
    )
  const digitales = cobros.medios.filter((m) => m.metodo !== 'EFECTIVO')
  const detallePermitido = userCan(userRole as Role, 'view:pedidos')
  const movimientos = cobros.movimientos.filter(
    (m) => detalle === 'TODOS' || m.metodo === detalle,
  )
  const pendientes = cobros.porConciliar.filter(
    (p) => detalle === 'TODOS' || p.metodo === null || p.metodo === detalle,
  )
  const mostrar =
    digitales.length > 0 ||
    deuda > 0 ||
    cobros.porConciliar.length > 0 ||
    cobros.creditoAplicado > 0
  return (
    <>
      {cobros.medios.some((m) => m.ajustes > 0) && (
        <div
          role="status"
          className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"
        >
          <p className="font-semibold">Hay ajustes de cobros</p>
          <p className="mt-1">
            Se muestran el bruto, el ajuste y el neto contable. Una corrección
            no demuestra una devolución de dinero.
          </p>
          <button
            className="mt-2 min-h-11 font-semibold underline"
            onClick={() => onDetalle('TODOS')}
          >
            Ver ajustes
          </button>
        </div>
      )}
      {cobros.porConciliar.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900"
        >
          <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              Total de cobros pendiente de conciliar
            </p>
            <p className="mt-1 text-sm">
              Hay registros cuyo origen o importe requiere revisión. Conservamos
              los subtotales identificados.
            </p>
          </div>
          <button
            className="min-h-11 rounded-lg border border-amber-400 px-3 text-sm font-semibold"
            onClick={() => onDetalle('TODOS')}
          >
            Ver diferencia
          </button>
        </div>
      )}
      {mostrar && (
        <section
          className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5"
          aria-labelledby="medios-dashboard-title"
        >
          <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id="medios-dashboard-title"
                className="flex items-center gap-2 text-lg font-semibold text-gray-800"
              >
                <Wallet aria-hidden="true" className="h-5 w-5 text-blue-600" />
                {digitales.some((m) =>
                  ['NEQUI', 'DAVIPLATA', 'TRANSFERENCIA'].includes(m.metodo),
                )
                  ? 'Medios digitales y fiados'
                  : 'Fiados y cobros registrados'}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Solo medios con movimientos. Las deudas no son dinero recibido.
              </p>
            </div>
            <button
              className="min-h-11 rounded-lg border bg-white px-3 text-sm font-semibold text-blue-700"
              onClick={() => onDetalle('TODOS')}
            >
              {cobros.porConciliar.length ? (
                'Total de cobros: por conciliar'
              ) : (
                <>Ver cobros registrados: {dinero(cobros.subtotalRegistrado)}</>
              )}
            </button>
          </header>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,140px),1fr))] gap-4 sm:grid-cols-[repeat(auto-fit,minmax(185px,1fr))]">
            {digitales.length === 0 && cobros.porConciliar.length > 0 && (
              <article className="min-w-0 rounded-xl border border-amber-200 bg-white p-4">
                <h3 className="flex items-center justify-between gap-2 font-medium text-amber-900">
                  Entrada por conciliar
                  <TriangleAlert
                    aria-hidden="true"
                    className="h-6 w-6 shrink-0"
                  />
                </h3>
                <p className="mt-3 text-2xl font-bold text-amber-800">
                  Por conciliar
                </p>
                <p className="mt-2 text-xs text-gray-600">
                  Falta verificar el origen o el registro de un cobro. El
                  subtotal identificado se conserva aparte.
                </p>
                <button
                  className="mt-3 min-h-11 font-semibold text-amber-900 underline"
                  onClick={() => onDetalle('TODOS')}
                >
                  Ver registros
                </button>
              </article>
            )}
            {digitales.map((m) => (
              <article
                key={m.metodo}
                data-testid={`medio-${m.metodo}`}
                className="min-w-0 rounded-xl border border-indigo-100 bg-white p-4"
              >
                <h3 className="flex items-center justify-between gap-2 font-medium text-gray-600">
                  {NOMBRES_MEDIO[m.metodo] ?? m.metodo}
                  {m.metodo === 'SIN_IDENTIFICAR' ? (
                    <TriangleAlert
                      aria-hidden="true"
                      className="h-6 w-6 shrink-0 text-amber-700"
                    />
                  ) : (
                    <Smartphone
                      aria-hidden="true"
                      className="h-6 w-6 shrink-0 rounded bg-indigo-50 text-indigo-600"
                    />
                  )}
                </h3>
                <p className="mt-3 break-words text-2xl font-bold text-indigo-700">
                  {pendienteMedio(cobros, m.metodo)
                    ? 'Por conciliar'
                    : dinero(m.neto)}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {pendienteMedio(cobros, m.metodo) ? (
                    <>Subtotal identificado: {dinero(m.neto)}</>
                  ) : (
                    'Registrado neto hoy'
                  )}
                </p>
                <div className="mt-3 space-y-1 text-xs">
                  {m.confirmado > 0 && (
                    <p className="text-green-800">
                      ✓ Confirmado: {dinero(m.confirmado)}
                    </p>
                  )}
                  {m.reportado > 0 && (
                    <p className="text-amber-800">
                      ⏳ Por confirmar: {dinero(m.reportado)}
                    </p>
                  )}
                  {m.discrepante > 0 && (
                    <p className="text-red-700">
                      ⚠ Discrepante: {dinero(m.discrepante)}
                    </p>
                  )}
                  {m.sinEstadoVerificable > 0 && (
                    <p className="text-gray-700">
                      ⓘ Sin estado verificable: {dinero(m.sinEstadoVerificable)}
                    </p>
                  )}
                  {m.ajustes > 0 && (
                    <p className="text-gray-700">
                      Ajustes: {dinero(m.ajustes)} · {m.movimientos}{' '}
                      movimiento(s)
                    </p>
                  )}
                </div>
                <button
                  className="mt-3 min-h-11 text-sm font-semibold text-indigo-700 underline"
                  onClick={() => onDetalle(m.metodo)}
                >
                  Ver movimientos
                </button>
              </article>
            ))}
            {deuda > 0 && (
              <article className="rounded-xl border border-red-100 bg-white p-4">
                <h3 className="flex items-center justify-between gap-2 font-medium text-gray-600">
                  Fiados pendientes
                  <Wallet aria-hidden="true" className="h-6 w-6 text-red-600" />
                </h3>
                <p className="mt-3 text-2xl font-bold text-red-700">
                  {dinero(deuda)}
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  Deuda entregada · todas las fechas
                </p>
                {deudaHoy > 0 && (
                  <p className="mt-2 text-xs text-gray-600">
                    De pedidos de hoy: {dinero(deudaHoy)}
                  </p>
                )}
                {detallePermitido && (
                  <Link
                    href="/pedidos?tab=fiados"
                    className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-red-700 underline"
                  >
                    Consultar todas las deudas
                  </Link>
                )}
              </article>
            )}
          </div>
          {cobros.creditoAplicado > 0 && (
            <p className="mt-3 text-sm text-gray-700">
              Crédito aplicado: {dinero(cobros.creditoAplicado)}. No es dinero
              nuevo recibido hoy.
            </p>
          )}
          <p className="mt-3 flex items-start gap-2 text-xs text-gray-600">
            <CircleHelp aria-hidden="true" className="h-4 w-4 shrink-0" />
            Los reportes pendientes y los ajustes siguen visibles. Los medios
            sin actividad no ocupan tarjetas.
          </p>
        </section>
      )}
      <Modal
        open={detalle !== null}
        onClose={() => onDetalle(null)}
        title={
          detalle === 'TODOS'
            ? 'Cobros registrados hoy'
            : `Movimientos de ${NOMBRES_MEDIO[detalle ?? ''] ?? detalle}`
        }
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        data-testid="dashboard-cobros-detalle"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-lg font-semibold">
              {detalle === 'TODOS'
                ? 'Cobros registrados hoy'
                : `Movimientos de ${NOMBRES_MEDIO[detalle ?? ''] ?? detalle}`}
            </h2>
            <p className="mt-1 text-xs text-gray-600">
              Fecha de registro · hora de Colombia
            </p>
          </div>
          <button
            className="min-h-11 min-w-11 rounded-lg border"
            aria-label="Cerrar detalle de cobros"
            onClick={() => onDetalle(null)}
          >
            ×
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto p-4">
          <p className="text-sm text-gray-700">
            El canal del pedido (Punto o Domicilio) y el medio del cobro son
            distintos. Un cobro de un pedido anterior no es una venta nueva de
            hoy.
          </p>
          {pendientes.length > 0 && (
            <div
              className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3"
              role="status"
            >
              <h3 className="font-semibold text-amber-900">Por conciliar</h3>
              {pendientes.map((p) => (
                <p key={p.id} className="mt-2 text-sm text-amber-900">
                  {p.referencia} ·{' '}
                  {p.importe === null
                    ? 'Importe por verificar'
                    : dinero(p.importe)}{' '}
                  ·{' '}
                  {p.motivo === 'SOBRANTE_SIN_COBRO'
                    ? 'Sobrante a saldo a favor sin registro canónico de ingreso (#524)'
                    : p.motivo === 'AJUSTE_INVALIDO'
                      ? 'Importe o ajuste incompatible con el original'
                      : p.motivo === 'MEDIO_NO_IDENTIFICADO'
                        ? 'Medio de pago sin identificar; no se supone efectivo ni digital'
                        : 'Evidencia de origen incompleta'}
                </p>
              ))}
            </div>
          )}
          <div className="mt-4 space-y-3">
            {!detallePermitido ? (
              <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
                Tu perfil permite consultar el resumen. El detalle de cada cobro
                requiere acceso a Pedidos.
              </p>
            ) : movimientos.length === 0 ? (
              <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
                No hay movimientos identificados para este medio en la lectura.
                Revisa los registros por conciliar si están presentes.
              </p>
            ) : (
              movimientos.map((m) => (
                <article
                  key={`${m.fuente}-${m.id}`}
                  className="rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{m.referencia}</h3>
                      <p className="mt-1 text-xs text-gray-600">
                        {new Date(m.registradoAt).toLocaleString('es-CO', {
                          timeZone: 'America/Bogota',
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {NOMBRES_MEDIO[m.metodo] ?? m.metodo}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${m.canal === 'PUNTO' ? 'bg-amber-100 text-amber-900' : 'bg-violet-100 text-violet-800'}`}
                    >
                      {m.canal === 'PUNTO' ? (
                        <ShoppingBag aria-hidden="true" size={14} />
                      ) : (
                        <Truck aria-hidden="true" size={14} />
                      )}
                      {m.canal === 'PUNTO' ? 'Punto' : 'Domicilio'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">
                    Bruto {dinero(m.bruto)}
                    {m.ajuste > 0 && <> − ajuste {dinero(m.ajuste)}</>} · Neto{' '}
                    {dinero(m.neto)}
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    {m.metodo === 'BONO'
                      ? 'Crédito aplicado; no es dinero nuevo.'
                      : m.confirmacion === 'CONFIRMADO'
                        ? '✓ Confirmado'
                        : m.confirmacion === 'REPORTADO'
                          ? '⏳ Reportado, por confirmar'
                          : m.confirmacion === 'DISCREPANTE'
                            ? '⚠ Discrepante'
                            : 'ⓘ Sin estado de verificación disponible'}
                    {m.pedidoAnterior ? ' · Cobro de pedido anterior' : ''}
                  </p>
                  {userCan(userRole as Role, 'view:pedidos') && (
                    <Link
                      className="mt-2 inline-flex min-h-11 items-center text-sm text-blue-700 underline"
                      href={`/pedidos?${new URLSearchParams({ openPedido: m.pedidoId })}`}
                    >
                      Ver pedido #{m.pedidoNumero}
                    </Link>
                  )}
                </article>
              ))
            )}
          </div>
          <p className="mt-4 text-xs text-gray-600">
            Las correcciones compensan el cobro original; no prueban una
            devolución física. La recepción registrada tampoco prueba cuánto
            efectivo conserva la oficina ni el saldo de una cuenta bancaria.
          </p>
        </div>
        <footer className="shrink-0 border-t p-4">
          <button
            className="min-h-11 rounded-lg border px-4"
            onClick={() => onDetalle(null)}
          >
            Volver al dashboard
          </button>
        </footer>
      </Modal>
    </>
  )
}
export function IconoEfectivo() {
  return <Banknote aria-hidden="true" className="h-6 w-6 text-emerald-600" />
}
