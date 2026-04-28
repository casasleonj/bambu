interface TxLike {
  $queryRaw: any
  [model: string]: any
}

/**
 * Get next sequential number using PostgreSQL sequences.
 * Falls back to MAX(field) + 1 for string fields like "FAC-00002".
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
    const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval(${options.seqName})
    `
    return Number(nextval)
  }

  // Fallback for string-based sequences (e.g. "FAC-00002")
  const model = (tx as any)[options.model]
  const field = options.field || 'numero'
  const result = await model.aggregate({
    _max: { [field]: true },
  })
  const maxVal = result._max?.[field]
  let num = 0
  if (typeof maxVal === 'string') {
    const match = maxVal.match(/\d+/)
    num = match ? parseInt(match[0], 10) : 0
  } else {
    num = maxVal || 0
  }
  return num + 1
}
