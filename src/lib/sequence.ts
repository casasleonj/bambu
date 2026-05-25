interface TxLike {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
  [model: string]: any
}

/**
 * Get next sequential number using PostgreSQL sequences.
 * Falls back to MAX(field) + 1 for string fields like "FAC-00002".
 *
 * IMPORTANT: When using fallback (no seqName), caller MUST wrap in
 * `withAdvisoryLock` or use Serializable transaction to prevent race conditions.
 */
export async function getNextNumero(
  tx: TxLike,
  options: {
    seqName?: string
    model: string
    field?: string
  }
): Promise<number> {
  if (options.seqName) {
    const rows = await tx.$queryRaw`
      SELECT nextval(${options.seqName})
    ` as Array<{ nextval: bigint }>
    return Number(rows[0].nextval)
  }

  // Fallback for string-based sequences (e.g. "FAC-00002")
  // MUST be called within withAdvisoryLock or Serializable transaction
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
 * Format number with preserved padding from template.
 * "FAC-00002" + 1 → "FAC-00003"
 * "FAC-2" + 1 → "FAC-3"
 */
export function formatWithPadding(template: string, nextNum: number): string {
  const match = template.match(/(\d+)/)
  if (!match) return `${nextNum}`
  const digits = match[0].length
  return template.replace(/\d+/, String(nextNum).padStart(digits, '0'))
}
