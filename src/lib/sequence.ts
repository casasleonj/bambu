interface TxLike {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
  [model: string]: any
}

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

export async function getNextNumeroDia(
  tx: TxLike,
  trabajadorId: string,
  fecha: Date
): Promise<number> {
  const startOfDay = new Date(fecha)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(fecha)
  endOfDay.setHours(23, 59, 59, 999)

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
