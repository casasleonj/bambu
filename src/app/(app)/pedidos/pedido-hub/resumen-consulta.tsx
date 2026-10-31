"use client";
import { useState, useSyncExternalStore } from "react";
import { Modal } from "@/components/modal";
import { getProductoIconConfig } from "@/lib/producto-iconos";
import { formatCurrency } from "@/lib/utils";
import type {
  FiltrosConsultaPedidos,
  ResumenConsultaPedidos,
} from "@/lib/pedidos-consulta";
const money = (n: number) => formatCurrency(n);
const CLAVE = "consulta-resumen-abierto";
const EVENTO = "consulta-resumen-cambio";
const MOVIL = "(max-width: 767px)";

function suscribir(cb: () => void) {
  window.addEventListener(EVENTO, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENTO, cb);
    window.removeEventListener("storage", cb);
  };
}
function leerPreferencia(): string | null {
  try {
    return window.localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}
function leerEsMovil(): boolean {
  return (
    typeof window.matchMedia === "function" && window.matchMedia(MOVIL).matches
  );
}
export function ResumenConsulta({
  resumen: r,
  filtros: f,
}: {
  resumen: ResumenConsultaPedidos;
  filtros: FiltrosConsultaPedidos;
}) {
  const [ayuda, setAyuda] = useState(false);
  const preferencia = useSyncExternalStore(
    suscribir,
    leerPreferencia,
    () => null,
  );
  const esMovil = useSyncExternalStore(
    (cb) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const m = window.matchMedia(MOVIL);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    leerEsMovil,
    () => false,
  );
  // Sin preferencia guardada: cerrado en móvil, abierto en escritorio.
  const abierto = preferencia === null ? !esMovil : preferencia === "1";
  const alternar = () => {
    try {
      window.localStorage.setItem(CLAVE, abierto ? "0" : "1");
    } catch {
      /* sin almacenamiento: no se recuerda, pero el botón no falla */
    }
    window.dispatchEvent(new Event(EVENTO));
  };
  const cobros = f.fechaBase === "cobro",
    entregas = f.fechaBase === "entrega";
  const rango = f.all
    ? "Todas las fechas"
    : `${f.desde || "Sin inicio"}${f.desdeHora ? " " + f.desdeHora : ""} → ${f.hasta || "Sin final"}${f.hastaHora ? " " + f.hastaHora : ""}`;
  const productos = (
    <div
      className="mt-3 rounded-lg border border-stone-200 bg-[#f8f5ef] p-3"
      data-testid="consulta-productos-resumen"
    >
      <h3 className="text-xs font-bold text-stone-700">
        📦{" "}
        {entregas
          ? "Productos entregados en el rango"
          : "Productos de los pedidos seleccionados"}
      </h3>
      <p className="mt-1 text-xs text-stone-600">
        {entregas
          ? "Solo cantidades de entregas con evidencia del intervalo y de los repartidores elegidos."
          : "Pedidas y entregadas acumuladas de esos pedidos; cada producto se cuenta por separado."}
      </p>
      <div className="mt-1 grid gap-x-5 lg:grid-cols-2">
        {r.productos.map((p) => {
          const { Icon, label } = getProductoIconConfig(p.producto);
          return (
            <div
              key={p.producto}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 py-2 text-xs first:border-0"
              data-producto={p.producto}
            >
              <strong className="flex items-center gap-1 text-slate-700">
                <Icon size={16} />
                {label}
              </strong>
              <span className="text-stone-600">
                {entregas
                  ? `${p.entregadas} entregadas en el rango`
                  : `${p.pedidas} pedidas · ${p.entregadas} entregadas acumuladas`}
              </span>
            </div>
          );
        })}
      </div>
      {r.entregasPorConciliar > 0 && (
        <p
          role="status"
          className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"
        >
          Cantidades por conciliar en {r.entregasPorConciliar} pedido(s): el
          registro no permite asignar cantidades exactas a este horario: faltan
          horas o desgloses. El subtotal visible solo incluye cantidades con
          evidencia; no se atribuye el acumulado al horario.
        </p>
      )}
    </div>
  );
  return (
    <section
      className="rounded-xl border border-amber-200 bg-[#fff6e6] p-4"
      aria-label="Resumen del filtro"
      data-testid="consulta-resumen"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-800">
            📊 Resumen del filtro
          </h2>
          <p className="mt-1 break-words text-xs text-slate-600">
            {rango} · Colombia
          </p>
        </div>
        <button
          type="button"
          className="min-h-11 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold"
          onClick={() => setAyuda(true)}
        >
          ⓘ Cómo leerlo
        </button>
      </div>
      <button
        type="button"
        className="mt-2 min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold"
        aria-expanded={abierto}
        aria-controls="consulta-resumen-detalle"
        data-testid="consulta-resumen-alternar"
        onClick={alternar}
      >
        {abierto ? "Ocultar detalle" : "Ver detalle"}
      </button>
      {!abierto && (
        <p
          className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums text-slate-800"
          data-testid="consulta-resumen-linea"
        >
          {cobros && r.cobros ? (
            <span>
              Cobros{" "}
              <b>
                {r.cobros.porConciliar.length
                  ? "Por conciliar"
                  : money(r.cobros.subtotalRegistrado)}
              </b>
            </span>
          ) : (
            <>
              <span>
                Importe <b>{money(r.importe)}</b>
              </span>
              <span>
                Pagado <b>{money(r.pagado)}</b>
              </span>
              <span>
                Saldo <b>{money(r.saldo)}</b>
              </span>
            </>
          )}
        </p>
      )}
      <div id="consulta-resumen-detalle" hidden={!abierto}>
        <p className="mt-1 text-xs text-slate-500">
          {f.canal.length === 1
            ? f.canal[0] === "PUNTO"
              ? "Solo punto"
              : "Solo domicilio"
            : "Punto y domicilio"}{" "}
          ·{" "}
          {f.repartidorId.length
            ? `${f.repartidorId.length} repartidor(es) elegido(s)`
            : "Todos los repartidores"}{" "}
          · cada pedido una sola vez
        </p>
        {cobros && r.cobros ? (
          <>
            <div className="mt-3 rounded-lg border border-stone-200 bg-white p-3">
              <p className="text-xs font-semibold text-stone-600">
                💵 Cobros registrados dentro del rango
              </p>
              <strong className="mt-1 block text-2xl text-slate-800">
                {r.cobros.porConciliar.length
                  ? "Por conciliar"
                  : money(r.cobros.subtotalRegistrado)}
              </strong>
              <p className="mt-1 text-xs text-stone-600">
                {r.cobros.porConciliar.length
                  ? `Subtotal identificado: ${money(r.cobros.subtotalRegistrado)}. `
                  : ""}
                Por fecha del cobro; incluye pedidos anteriores.
              </p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {r.cobros.medios.map((m) => (
                <div
                  key={m.metodo}
                  className="rounded-lg border border-stone-200 bg-white p-3 text-sm"
                >
                  <strong>
                    {m.metodo === "EFECTIVO"
                      ? "💵 Efectivo"
                      : m.metodo === "SIN_IDENTIFICAR"
                        ? "⚠ Medio por identificar"
                        : `📱 ${m.metodo === "TRANSFERENCIA" ? "Transferencia" : m.metodo === "DAVIPLATA" ? "Daviplata" : "Nequi"}`}
                  </strong>
                  <p className="mt-1 font-semibold tabular-nums">
                    {m.pendienteConciliacion ? "Por conciliar" : money(m.neto)}
                  </p>
                  {m.reportado !== 0 && (
                    <p className="mt-1 text-xs text-amber-800">
                      {money(m.reportado)} por confirmar
                    </p>
                  )}
                  {m.discrepante !== 0 && (
                    <p className="mt-1 text-xs text-red-800">
                      {money(m.discrepante)} discrepante
                    </p>
                  )}
                  {m.sinEstadoVerificable !== 0 && (
                    <p className="mt-1 text-xs text-amber-800">
                      {money(m.sinEstadoVerificable)} sin estado verificable
                    </p>
                  )}
                  {m.ajustes !== 0 && (
                    <p className="mt-1 text-xs text-stone-600">
                      Bruto {money(m.bruto)} · ajustes {money(m.ajustes)}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {!r.cobros.medios.length && (
              <p className="mt-2 text-sm text-slate-600">
                No hay cobros de dinero identificados en este rango.
              </p>
            )}
            {r.cobros.creditoAplicado !== 0 && (
              <p className="mt-2 text-xs text-stone-700">
                Crédito aplicado: {money(r.cobros.creditoAplicado)}. No es
                dinero nuevo.
              </p>
            )}
            {r.cobros.porConciliar.length > 0 && (
              <div
                role="status"
                className="mt-3 rounded-lg border border-amber-300 p-3 text-xs text-amber-900"
              >
                <strong>Hay cobros por conciliar.</strong> No se emparejan pagos
                y abonos solo por importe o cercanía de hora. Los sobrantes sin
                cobro canónico se señalan; no se inventan ingresos.
                <ul className="mt-2 list-inside list-disc">
                  {r.cobros.porConciliar.slice(0, 8).map((p) => (
                    <li key={p.id}>
                      {p.referencia}
                      {p.importe !== null ? ` · ${money(p.importe)}` : ""}
                    </li>
                  ))}
                </ul>
                {r.cobros.porConciliar.length > 8 && (
                  <p className="mt-1">
                    Y {r.cobros.porConciliar.length - 8} registro(s) más.
                  </p>
                )}
              </div>
            )}
            <p className="mt-3 text-xs text-stone-600">
              No es una suma de ventas nuevas ni el efectivo físico disponible
              en caja. Los pagos con crédito no son dinero nuevo.
            </p>
            {r.productos.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer py-2 text-xs font-semibold text-stone-700">
                  Ver productos de los pedidos relacionados
                </summary>
                {productos}
                <p className="mt-1 text-xs text-stone-600">
                  Un cobro no representa una entrega nueva de producto.
                </p>
              </details>
            )}
          </>
        ) : (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                [
                  "🧾 Importe de los pedidos",
                  r.importe,
                  "Incluye lo que aún está por entregar.",
                ],
                [
                  "✅ Pagado registrado",
                  r.pagado,
                  "Acumulado de estos pedidos hasta la consulta.",
                ],
                [
                  "⏳ Saldo por cobrar",
                  r.saldo,
                  `${r.fiado ? `Entregados / fiados: ${money(r.fiado)}. ` : ""}${r.pendienteEntrega ? `Por entregar: ${money(r.pendienteEntrega)}.` : ""}${r.saldo === 0 ? "Sin saldo pendiente." : ""}`,
                ],
              ].map(([label, valor, nota]) => (
                <div
                  key={String(label)}
                  className="rounded-lg border border-stone-200 bg-white p-3"
                >
                  <p className="text-xs font-semibold text-stone-600">
                    {label}
                  </p>
                  <strong className="mt-1 block text-2xl text-slate-800 tabular-nums">
                    {money(Number(valor))}
                  </strong>
                  <p className="mt-1 text-xs text-stone-600">{nota}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-stone-600">
              El fiado es parte del saldo, no se suma otra vez. «Pagado
              registrado» puede incluir pagos de otra hora o fecha. Para ver
              dinero recibido en el horario elegido, usa «Cobro registrado».
            </p>
            {r.importesPorConciliar && (
              <p
                role="status"
                className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800"
              >
                Los importes guardados no cuadran: hace falta conciliación. No
                se corrigen saldos ni se oculta la diferencia desde esta
                consulta.
              </p>
            )}
            {(r.productos.length > 0 || r.entregasPorConciliar > 0) &&
              productos}
          </>
        )}
      </div>
      <Modal
        open={ayuda}
        onClose={() => setAyuda(false)}
        title="Cómo leer el resumen"
      >
        <div className="space-y-3 p-5 text-sm text-slate-700">
          <h2 className="text-lg font-semibold">Cómo leer el resumen</h2>
          <p>
            Las sumas siguen todos los filtros aplicados y todas las páginas de
            la consulta.
          </p>
          <p>
            Fecha del pedido selecciona pedidos por su fecha. Creación
            registrada usa el momento en que el sistema creó el registro. Pagado
            registrado es el acumulado aplicado a esos pedidos; puede haberse
            pagado en otro horario.
          </p>
          <p>
            Entrega registrada selecciona los pedidos con evidencia de entrega
            en el intervalo. Solo las cantidades del intervalo se suman como
            entregadas en ese horario.
          </p>
          <p>
            Cobro registrado suma pagos y abonos identificados en ese horario,
            incluyendo deudas anteriores. Un bono usa crédito: no entra dinero
            nuevo.
          </p>
          <p>
            Una venta de $100.000 con $65.000 pagados deja $35.000 de saldo. Si
            ya se entregó, esos $35.000 son fiado; forman parte del saldo.
          </p>
          <button
            type="button"
            className="min-h-11 rounded-lg bg-blue-700 px-4 text-white"
            onClick={() => setAyuda(false)}
          >
            Entendido
          </button>
        </div>
      </Modal>
    </section>
  );
}
