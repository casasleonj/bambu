/** Solo permite regresar a la consulta interna; nunca acepta destinos externos. */
export function vueltaAPedidos(value: string | null): string | null {
  if (!value?.startsWith('/')) return null
  try {
    const url = new URL(value, 'https://contexto.invalid')
    return url.origin === 'https://contexto.invalid' && url.pathname === '/pedidos'
      ? `${url.pathname}${url.search}` : null
  } catch { return null }
}
