"use client";
import type { MouseEvent } from "react";
import { canCreatePedidos, canReadFacturas } from "@/lib/permissions";
import { getProductoIconConfig } from "@/lib/producto-iconos";
import { formatCurrency } from "@/lib/utils";
import { deriveOperacion, embarqueLinea } from "./derive-operacion";
import {
  TONOS_CLASE,
  esTerminal,
  itemsConsulta,
  lineaProducto,
  pillsEstado,
  responsablesConsulta,
} from "./consulta-datos";
import type { AccionKey, Pedido } from "./types";
import { fechaConsulta } from "./fecha-consulta";
import styles from "./operacion-consulta.module.css";

export interface AccionesConsulta {
  userRole: string | null;
  gestionDirecta: boolean;
  volver: string;
  onVerPedido: (id: string) => void;
  onVerFactura: (pedido: Pedido) => void;
  onCorregirPendiente?: (id: string) => void;
  onDescartarPendiente?: (id: string) => void;
}
function interceptar(e: MouseEvent<HTMLAnchorElement>, abrir: () => void) {
  e.stopPropagation();
  if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    abrir();
  }
}
const tonos = TONOS_CLASE;
export function OperacionConsulta({
  pedidos,
  viewport,
  hoyBogota,
  onAccion,
  onOpen,
  acciones,
}: {
  pedidos: Pedido[];
  viewport: "desktop" | "mobile";
  hoyBogota: string;
  onAccion: (p: Pedido, k: AccionKey) => void;
  onOpen: (p: Pedido) => void;
  acciones: AccionesConsulta;
}) {
  return (
    <div
      className={styles.lista}
      data-testid={
        viewport === "desktop" ? "pedido-hub-desktop" : "pedido-hub-mobile"
      }
    >
      <div className={styles.cabecera} aria-hidden="true">
        <span>Cliente / negocio</span>
        <span>Productos y cantidades</span>
        <span>Creación y entrega</span>
        <span>Estado y pago</span>
        <span>Acciones</span>
      </div>
      {pedidos.map((p) => {
        const nombre =
          p.nombreNegocioCli ||
          `${p.nombreCli}${p.apellidoCli ? " " + p.apellidoCli : ""}`;
        const terminal = esTerminal(p);
        const planificable =
          canCreatePedidos(acciones.userRole) &&
          !terminal &&
          !p.embarqueId &&
          p.canal === "DOMICILIO" &&
          ["PENDIENTE", "NO_ENTREGADO"].includes(p.estadoEntrega);
        const derivada = deriveOperacion(p, {
            hoyBogota,
            tienePendienteN2: p.pendienteN2?.estado === "ABIERTA",
            tieneExcepcion: !!p.casosAbiertos?.length,
          }),
          directa =
            acciones.userRole === "ADMIN" &&
            !terminal &&
            ["PENDIENTE", "NO_ENTREGADO"].includes(p.estadoEntrega);
        const destacada =
          directa &&
          (!derivada.accionDestacada ||
            derivada.accionDestacada.key === "planificar")
            ? { key: "registrar-entrega" as const, label: "Registrar entrega" }
            : derivada.accionDestacada;
        const primary = acciones.userRole === "CONTADOR" ? null : destacada;
        const pagado = Number(p.totalPagado),
          saldo = Number(p.saldo);
        const items = itemsConsulta(p);
        const resp = responsablesConsulta(p, hoyBogota);
        const repartidores = p.responsablesEntrega ?? [];
        if (p._pendingSync)
          return (
            <article
              key={p.id}
              className={`${styles.fila} rounded-lg border-amber-200 bg-amber-50 p-3`}
              data-testid={`operacion-row-${p.id}`}
            >
              <div>
                <strong>{nombre}</strong>
                <p className="mt-1 text-sm">
                  {p._pendingFailed
                    ? "No se pudo sincronizar"
                    : "Guardado en este dispositivo · pendiente de sincronizar"}
                </p>
                <p className="mt-1 text-xs">
                  {items
                    .map(
                      (i) =>
                        `${i.pedidas} ${getProductoIconConfig(i.producto).label}`,
                    )
                    .join(" · ")}
                </p>
                <p className="mt-1 text-xs">
                  Todavía no se incluye en los totales registrados del servidor.
                </p>
                {p._pendingFailReason && (
                  <p role="status" className="mt-1 text-xs">
                    {p._pendingFailReason}
                  </p>
                )}
                {p._pendingFailed && p._pendingOfflineId && (
                  <div className="mt-2 flex gap-2">
                    <button
                      className="min-h-11 rounded border px-3"
                      onClick={() =>
                        acciones.onCorregirPendiente?.(p._pendingOfflineId!)
                      }
                    >
                      Corregir
                    </button>
                    <button
                      className="min-h-11 rounded border px-3"
                      onClick={() =>
                        acciones.onDescartarPendiente?.(p._pendingOfflineId!)
                      }
                    >
                      Descartar
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        return (
          <article
            key={p.id}
            className={styles.fila}
            data-testid={`operacion-row-${p.id}`}
            tabIndex={0}
            aria-label={`Pedido #${p.numero} · ${nombre}`}
            onClick={() => onOpen(p)}
            onKeyDown={(e) => {
              if (
                e.target === e.currentTarget &&
                ["Enter", " "].includes(e.key)
              ) {
                e.preventDefault();
                onOpen(p);
              }
            }}
          >
            <div className={styles.cliente}>
              <div>
                <strong className={styles.nombre}>
                  {p.negocioId ? "🏪" : "👤"} {nombre}
                </strong>
                <p className={styles.meta}>
                  Pedido #{p.numero} ·{" "}
                  {p.negocioId ? `Negocio de ${p.nombreCli}` : "Persona"}
                </p>
                <span
                  className={`${styles.canal} ${p.canal === "PUNTO" ? "bg-amber-100 text-amber-900" : "bg-violet-100 text-violet-800"}`}
                >
                  {p.canal === "PUNTO" ? "🏪 Punto" : "🚚 Domicilio"}
                </span>
              </div>
            </div>
            <div className={styles.productos}>
              {items.map((i, k) => {
                const { Icon, label } = getProductoIconConfig(i.producto);
                return (
                  <div className={styles.producto} key={`${i.producto}-${k}`}>
                    <strong>
                      <Icon size={16} />
                      {label}
                    </strong>
                    <span>{lineaProducto(i, p)}</span>
                  </div>
                );
              })}
              {!items.length && (
                <p className="text-xs text-stone-600">
                  Sin productos registrados
                </p>
              )}
            </div>
            <div className={styles.responsables}>
              <div>
                <strong>{resp.creacion.titulo}</strong>
                <p className={styles.meta}>{resp.creacion.meta}</p>
                {p.createdAt &&
                  Math.floor(Date.parse(p.fecha) / 60000) !==
                    Math.floor(Date.parse(p.createdAt) / 60000) && (
                    <p className={styles.meta}>
                      Fecha del pedido: {fechaConsulta(p.fecha, hoyBogota)}
                    </p>
                  )}
              </div>
              <div>
                <strong>{resp.entrega.titulo}</strong>
                <p className={styles.meta}>{resp.entrega.meta}</p>
                {p.entregadoAt &&
                  !repartidores.length &&
                  p.canal === "DOMICILIO" && (
                    <p className={styles.meta}>
                      Repartidor no identificado en la evidencia.
                    </p>
                  )}
                {embarqueLinea(p) && (
                  <p
                    className={styles.meta}
                    data-testid={`operacion-embarque-${p.id}`}
                  >
                    Asignación: {embarqueLinea(p)}
                  </p>
                )}
              </div>
            </div>
            <div className={styles.estados}>
              {pillsEstado(p, derivada).map((pl) => (
                <span key={pl.key} className={`${styles.pill} ${tonos[pl.tono]}`}>
                  {pl.label}
                </span>
              ))}
            </div>
            <div className={styles.importes}>
              <span>
                Importe <strong>{formatCurrency(p.total)}</strong>
              </span>
              <span>
                Pagado <strong>{formatCurrency(pagado)}</strong>
              </span>
              <span>
                Saldo <strong>{formatCurrency(saldo)}</strong>
              </span>
            </div>
            <div
              className={styles.acciones}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.enlaces}>
                <a
                  href={`/pedidos/${encodeURIComponent(p.id)}?volver=${encodeURIComponent(acciones.volver)}`}
                  onClick={(e) =>
                    interceptar(e, () => acciones.onVerPedido(p.id))
                  }
                >
                  Ver pedido #{p.numero}
                </a>
                {canReadFacturas(acciones.userRole) && p.factura?.id && (
                  <a
                    href={`/facturas?facturaId=${encodeURIComponent(p.factura.id)}&volver=${encodeURIComponent(acciones.volver)}`}
                    onClick={(e) =>
                      interceptar(e, () => acciones.onVerFactura(p))
                    }
                  >
                    Ver factura {p.factura.numero}
                  </a>
                )}
              </div>
              {primary && (
                <button
                  type="button"
                  className={styles.primaria}
                  disabled={
                    directa &&
                    primary.key === "registrar-entrega" &&
                    !acciones.gestionDirecta
                  }
                  onClick={() => onAccion(p, primary.key)}
                >
                  {primary.label}
                </button>
              )}
              {planificable && primary?.key !== "planificar" && (
                <button
                  type="button"
                  className={styles.plan}
                  onClick={() => onAccion(p, "planificar")}
                >
                  🚚 Planificar en embarque
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
