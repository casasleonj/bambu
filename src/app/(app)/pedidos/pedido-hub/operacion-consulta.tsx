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
import { etiquetaAntiguedadPedido, etiquetaArrastre } from "./arrastrados";
import { NotaPedido } from "./nota-pedido";
import { CompromisoChip, CierreNegocioChip, HoraAcordadaChip } from "./compromiso-chip";
import { importesEntregaPedido } from "@/lib/valor-entregado-pedido";
import type { GrupoBarrioConsulta } from "@/lib/pedidos-consulta";
import type { EntregaDestacada } from "@/lib/pedidos-entregas-historial";
import styles from "./operacion-consulta.module.css";
import { esVentaAnonima } from "@/lib/barrios/grupo-barrio";
import { textoRiesgoOperativo } from "@/lib/pedidos-riesgo-operativo";

export interface SeleccionConsulta {
  marcado: boolean;
  onAlternar: (pedido: Pedido) => void;
  ordenIds?: readonly string[];
  fueraDePaginaIds?: ReadonlySet<string>;
}

export interface AccionesConsulta {
  userRole: string | null;
  gestionDirecta: boolean;
  volver: string;
  onVerPedido: (id: string) => void;
  onVerFactura: (pedido: Pedido) => void;
  onCorregirPendiente?: (id: string) => void;
  onDescartarPendiente?: (id: string) => void;
  /** #836 F3: totales por barrio de la consulta completa (solo con «Agrupar por barrio»). */
  grupos?: GrupoBarrioConsulta[];
  /** #915: entregas de pedidos anteriores, ubicadas dentro del grupo de su barrio (vista agrupada). */
  entregasAnteriores?: {
    entregas: EntregaDestacada[];
    /** Los bloques de barrios que solo tienen entregas (sin pedidos) salen solo en la primera página. */
    primeraPagina: boolean;
    hasta: string;
    periodo: "hoy" | "en el período";
    onVerTodas: () => void;
  };
  /** #836 F3: clave del único barrio que se está viendo, si hay. */
  grupoActivo?: string;
  onGrupoBarrio?: (clave: string | null) => void;
  /** #836 F2b: «Para hoy» agrupa por tiempo restante (Ya toca / Normales / Más tarde hoy). */
  franjas?: boolean;
  /** #851: mensaje de la vista por fecha prometida cuando no hay pedidos. */
  vacioCompromiso?: { vacioTitulo: string; vacioDescripcion: string };
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
  arrastre = false,
  seleccion,
}: {
  /** #797: muestra la fecha original y la antigüedad de cada pedido arrastrado. */
  arrastre?: boolean;
  pedidos: Pedido[];
  viewport: "desktop" | "mobile";
  hoyBogota: string;
  onAccion: (p: Pedido, k: AccionKey) => void;
  onOpen: (p: Pedido) => void;
  acciones: AccionesConsulta;
  /** #930: controles de selección solo en el modo Cercanía. */
  seleccion?: SeleccionConsulta;
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
        const importes = importesEntregaPedido(p), pagado = importes.pagado;
        const items = itemsConsulta(p);
        const pedidas = items.reduce((n, i) => n + i.pedidas, 0);
        const entregadas = items.reduce((n, i) => n + i.entregadas, 0);
        const pendientes = items.reduce((n, i) => n + Math.max(0, i.pedidas - i.entregadas), 0);
        const parcial = p.actividadOperativa && !terminal && entregadas > 0 && pendientes > 0;
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
              {seleccion?.marcado && <span className="sr-only" data-testid={`cercania-seleccionado-${p.id}`}>Seleccionado</span>}
              {seleccion && (
                <label className="inline-flex shrink-0 items-center gap-1 rounded px-1 py-1 text-xs text-blue-800" onClick={event => event.stopPropagation()}>
                  <input type="checkbox" className="h-5 w-5 accent-blue-700" checked={seleccion.marcado}
                    data-testid={`cercania-check-${p.id}`}
                    aria-label={`${seleccion.marcado ? "Quitar" : "Seleccionar"} pedido #${p.numero}`}
                    onChange={() => seleccion.onAlternar(p)}
                    disabled={
                      !!p._pendingSync || !!p.embarqueId && p.estadoEntrega !== "ENTREGADO" ||
                      ["CANCELADO", "ANULADO"].includes(p.estadoEntrega) ||
                      esVentaAnonima(p) ||
                      !(p.canal === "DOMICILIO" && p.estadoEntrega !== "ENTREGADO") &&
                        !((p.exigible ?? p.saldo) > 0)
                    }
                  />
                </label>
              )}
              <div>
                {seleccion?.ordenIds?.includes(p.id) && (
                  <span className="mb-1 inline-block rounded-md bg-blue-700 px-2 py-1 text-xs font-bold text-white"
                    aria-label={`Parada ${seleccion.ordenIds.indexOf(p.id) + 1}`}>
                    {seleccion.ordenIds.indexOf(p.id) + 1}
                  </span>
                )}
                <strong className={styles.nombre}>
                  {p.negocioId ? "🏪" : "👤"} {nombre}
                </strong>
                <p className={styles.meta}>
                  Pedido #{p.numero} ·{" "}
                  {p.negocioId ? `Negocio de ${p.nombreCli}` : "Persona"}
                </p>
                {arrastre && (
                  <p
                    className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"
                    data-testid={`operacion-arrastre-${p.id}`}
                  >
                    {etiquetaArrastre(p.fecha, hoyBogota)}
                  </p>
                )}
                {/* #915: pedido de un día anterior, integrado al grupo de su barrio. */}
                {p.diaAnterior && (
                  <span
                    data-testid={`operacion-dia-anterior-${p.id}`}
                    className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"
                  >
                    {etiquetaAntiguedadPedido(p.fecha, p.diaReferenciaConsulta ?? hoyBogota)}
                  </span>
                )}
                {parcial && (
                  <span data-testid={`operacion-parcial-${p.id}`} className="ml-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                    Parcial
                  </span>
                )}
                {p.entregaEnPeriodo && (
                  <span data-testid={`operacion-entrega-hoy-${p.id}`} className="ml-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                    {p.entregaEnPeriodo.porConciliar ? "Entrega por conciliar" : p.estadoEntrega === "ENTREGADO" ? "Entregado hoy" : "Entrega hoy"}
                  </span>
                )}
                {p.actividadOperativa && items.length > 0 && (
                  <p className={styles.meta} data-testid={`operacion-cantidades-${p.id}`}>
                    Pedidas: {pedidas} · Entregadas: {entregadas} · Pendientes: {pendientes}
                    {p.entregaEnPeriodo ? ` · Hoy: ${p.entregaEnPeriodo.unidades ?? "por conciliar"}` : ""}
                  </p>
                )}
                <CompromisoChip id={p.id} pedido={p} hoyBogota={hoyBogota} />
                <HoraAcordadaChip id={p.id} pedido={p} />
                <CierreNegocioChip id={p.id} pedido={p} />
                {p.riesgoOperativo && (
                  <p
                    data-testid={`operacion-riesgo-${p.id}`}
                    className="mt-1 inline-block rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800"
                    title="Alerta operativa calculada con horario de trabajo y configuración del servidor."
                  >
                    ⚠️ {textoRiesgoOperativo(p.riesgoOperativo)}
                  </p>
                )}
                {seleccion?.fueraDePaginaIds?.has(p.id) && (
                  <p className="mt-1 text-xs text-amber-800">Fuera del filtro o página actual; el servidor verificará su vigencia.</p>
                )}
                {/* #913: la venta anónima en punto no tiene barrio: no se rotula «Sin barrio». */}
                {!esVentaAnonima(p) && (
                  <p
                    className={`${styles.meta} truncate`}
                    data-testid={`operacion-barrio-${p.id}`}
                    title={p.barrioCli || undefined}
                  >
                    📍 {p.barrioCli?.trim() || "Sin barrio"}
                  </p>
                )}
                <span
                  className={`${styles.canal} ${p.canal === "PUNTO" ? "bg-amber-100 text-amber-900" : "bg-violet-100 text-violet-800"}`}
                >
                  {p.canal === "PUNTO" ? "🏪 Punto" : "🚚 Domicilio"}
                </span>
                {p.obs?.trim() && <NotaPedido obs={p.obs} numero={p.numero} />}
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
                Por cobrar de lo entregado <strong>{importes.porConciliar ? 'Por conciliar' : importes.porCobrar === null ? 'Por consultar' : formatCurrency(importes.porCobrar)}</strong>
              </span>
              {importes.parcial && <span className="text-xs text-amber-800">Pendiente de entrega: {formatCurrency(importes.pendienteEntrega)}</span>}
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
