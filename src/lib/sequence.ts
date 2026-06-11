import { startOfDayBogota, endOfDayBogota } from './dates'

interface TxLike {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
  [model: string]: any
}

/**
 * FIX Fase 3 §2.1 + §2.3: numeración de facturas.
 *
 * Investigación DIAN (junio 2026):
 * - Resolución 000042 de 2020 + FAQ oficial micrositios.dian.gov.co
 *   establecen numeración CONSECUTIVA dentro de rangos autorizados.
 * - La DIAN exige correlación cronológica-numérica, pero NO prohíbe
 *   huecos por anulación (el rango se "inhabilita" administrativamente).
 * - Anexo Técnico 1.9 (vía proveedores como Xubio) confirma que huecos
 *   se manejan fuera del sistema: la numeración es atómica (sin reuso).
 *
 * Implementación: Secuencia Postgres (`factura_numero_seq`) atómica.
 * - nextval() es atómico → sin race entre paths (CrearPedido,
 *   venta-libre, recurrentes, facturas route, ventas-libres).
 * - Acepta huecos si hay rollback o anulación; eso se resuelve
 *   administrativamente con la DIAN (inhabilitación de rango), no
 *   en el código.
 * - Mantiene el fallback MAX+1 para otros modelos donde la concurrencia
 *   no genera facturas fiscales (legacy, mantener para retrocompat).
 *   Sprint 6: agregado Abono y Embarque a las secuencias atómicas.
 */
const SEQ_NAMES: Record<string, string> = {
  'factura:numero': 'factura_numero_seq',
  'abono:numero': 'abono_numero_seq',
  'embarque:numero': 'embarque_numero_seq',
}

export async function getNextNumero(
  tx: TxLike,
  options: {
    seqName?: string
    model: string
    field?: string
  }
): Promise<number> {
  // FIX Fase 3 §2.3: usar secuencia automáticamente para Factura.numero
  const autoSeq = SEQ_NAMES[`${options.model}:${options.field || 'numero'}`]
  const seqName = options.seqName || autoSeq

  if (seqName) {
    // IMPORTANTE: `nextval('seq_name')` espera el nombre de la
    // secuencia como STRING LITERAL (single quotes), NO como
    // identifier (double quotes). Postgres interpreta differently:
    //   nextval('seq')           ✓ OK, llama a la función
    //   nextval(seq)              ✗ "column does not exist"
    //   nextval("seq")            ✗ "column does not exist"
    // seqName viene de una constante controlada (SEQ_NAMES), no de
    // user input. Validamos formato por defensa en profundidad.
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(seqName)) {
      throw new Error(`Invalid sequence name: ${seqName}`)
    }
    const rows = await tx.$queryRawUnsafe(
      `SELECT nextval('${seqName}')`,
    ) as Array<{ nextval: bigint }>
    return Number(rows[0].nextval)
  }

  // Fallback: MAX + 1 (usado para Abono, Embarque y otros no-fiscales)
  const model = (tx as any)[options.model]
  const field = options.field || 'numero'
  const result = await model.aggregate({
    _max: { [field]: true },
  })
  const maxVal = result._max?.[field]
  let num = 0
  if (typeof maxVal === 'string') {
    const match = maxVal.match(/(\d+)/)
    num = match ? parseInt(match[0], 10) : 0
  } else {
    num = maxVal || 0
  }
  return num + 1
}

/**
 * FIX Fase 2 §3.3: el cálculo del día del embarque usaba setHours() naive
 * (UTC en Vercel). Cerca de medianoche UTC, los límites del día quedaban
 * corridos 5h respecto a Bogotá, asignando numeroDia incorrectos.
 *
 * Ahora: convierte la fecha a string YYYY-MM-DD en zona Bogotá y usa
 * los helpers TZ-safe de dates.ts.
 *
 * @param fecha - Fecha del embarque (puede ser un Date con hora arbitraria)
 */
export async function getNextNumeroDia(
  tx: TxLike,
  trabajadorId: string,
  fecha: Date
): Promise<number> {
  // Convertir la fecha a string YYYY-MM-DD en zona Bogotá
  const fechaStr = fecha.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const startOfDay = startOfDayBogota(fechaStr)
  const endOfDay = endOfDayBogota(fechaStr)

  const embarqueModel = (tx as any).embarque
  const result = await embarqueModel.aggregate({
    _max: { numeroDia: true },
    where: {
      trabajadorId,
      fecha: { gte: startOfDay, lt: endOfDay },
    },
  })

  return (result._max?.numeroDia || 0) + 1
}

export function formatWithPadding(template: string, nextNum: number): string {
  const match = template.match(/(\d+)/)
  if (!match) return `${nextNum}`
  const digits = match[0].length
  return template.replace(/\d+/, String(nextNum).padStart(digits, '0'))
}
