import type { GrupoBarrioConsulta } from "@/lib/pedidos-consulta";

/**
 * #836 F3 — Encabezado de un bloque de la lista agrupada por barrio. El total es el de la
 * consulta COMPLETA (viene del servidor), no el de las filas de la página.
 */
export function GrupoBarrioEncabezado({
  grupo, enPagina, soloEste, onSoloEste, onTodos, abierto = true, onAlternar,
}: {
  grupo: GrupoBarrioConsulta;
  /** Filas de este grupo visibles en esta página. */
  enPagina: number;
  soloEste: boolean;
  onSoloEste?: () => void;
  onTodos?: () => void;
  abierto?: boolean;
  onAlternar?: () => void;
}) {
  const parcial = enPagina < grupo.total && !soloEste;
  return (
    <div
      role="heading"
      aria-level={3}
      data-testid={`grupo-barrio-${grupo.clave}`}
      className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-200/70 px-3 py-1.5 text-sm font-bold text-stone-800"
    >
      <span>
        {grupo.clave === "venta-anonima" ? "🧾" : "📍"} {grupo.etiqueta}
        <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-stone-700" data-testid={`grupo-barrio-total-${grupo.clave}`}>
          {grupo.total} {grupo.total === 1 ? "pedido" : "pedidos"}
        </span>
        {grupo.unidadesPendientes !== undefined && grupo.clave !== "venta-anonima" && (
          <span className="ml-2 text-xs font-semibold text-stone-700">
            · Por entregar: {grupo.unidadesPendientes}
            {Object.entries(grupo.remanentes ?? {}).filter(([, n]) => n > 0).map(([producto, cantidad]) => (
              <span key={producto} className="ml-2 font-normal">{producto.replaceAll("_", " ")} {cantidad}</span>
            ))}
          </span>
        )}
        {parcial && (
          <span className="ml-2 text-xs font-normal text-stone-600">
            · aquí {enPagina}; el resto sigue en las otras páginas
          </span>
        )}
      </span>
      {onAlternar && (
        <button type="button" onClick={onAlternar}
          data-testid={`grupo-barrio-toggle-${grupo.clave}`}
          aria-expanded={abierto}
          aria-label={`${abierto ? 'Contraer' : 'Desplegar'} pedidos de ${grupo.etiqueta}`}
          className="min-h-10 rounded-md border border-stone-400 bg-white px-3 py-1 text-xs font-semibold">
          {abierto ? '▴ Ocultar pedidos' : '▾ Ver pedidos'}
        </button>
      )}
      {soloEste
        ? onTodos && (
            <button type="button" onClick={onTodos} data-testid="grupo-barrio-todos" className="rounded-md border border-stone-400 bg-white px-2 py-1 text-xs font-medium">
              Ver todos los barrios
            </button>
          )
        : onSoloEste && (
            <button type="button" onClick={onSoloEste} data-testid={`grupo-barrio-solo-${grupo.clave}`} className="rounded-md border border-stone-400 bg-white px-2 py-1 text-xs font-medium">
              Ver solo este barrio
            </button>
          )}
    </div>
  );
}
