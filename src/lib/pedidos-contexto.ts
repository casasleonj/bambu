/** Solo permite regresar a la consulta interna; nunca acepta destinos externos. */
export function vueltaAPedidos(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  try {
    const url = new URL(value, "https://contexto.invalid");
    return url.origin === "https://contexto.invalid" &&
      url.pathname === "/pedidos"
      ? `${url.pathname}${url.search}`
      : null;
  } catch {
    return null;
  }
}

/** Enlace al pedido exacto conservando únicamente una consulta interna válida. */
export function pedidoEnConsulta(id: string, volver?: string | null): string {
  const url = new URL(
    vueltaAPedidos(volver ?? null) ?? "/pedidos",
    "https://contexto.invalid",
  );
  url.searchParams.set("openPedido", id);
  return `${url.pathname}${url.search}`;
}
