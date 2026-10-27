/** El navegador declara cantidades físicas; no decide totales del sistema. */
const VALORES = new Set(['100000', '50000', '20000', '10000', '5000', '2000', '500', '200', '100', '50'])

export function leerArqueoDeclarado(reporte: string | undefined, neto: number) {
  const vacio = { arqueo: null, totalContado: null, diferenciaArqueo: null }
  if (!reporte) return vacio
  let r: unknown
  try { r = JSON.parse(reporte) } catch { throw new Error('Arqueo inválido: formato del reporte.') }
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('Arqueo inválido: formato del reporte.')
  const arqueo = (r as Record<string, unknown>).arqueo
  if (arqueo === undefined || arqueo === null) return vacio
  if (typeof arqueo !== 'object' || Array.isArray(arqueo)) throw new Error('Arqueo inválido: revisa las cantidades.')
  const cantidades: Record<string, number> = {}
  let total = 0
  for (const [valor, cantidad] of Object.entries(arqueo)) {
    if (!VALORES.has(valor) || typeof cantidad !== 'number' || !Number.isSafeInteger(cantidad) || cantidad < 0) {
      throw new Error('Arqueo inválido: revisa las denominaciones y cantidades.')
    }
    cantidades[valor] = cantidad
    total += Number(valor) * cantidad
    if (!Number.isSafeInteger(total) || total > 99_999_999.99) throw new Error('Arqueo inválido: total fuera de rango.')
  }
  return { arqueo: cantidades, totalContado: total, diferenciaArqueo: Math.round((total - neto) * 100) / 100 }
}
