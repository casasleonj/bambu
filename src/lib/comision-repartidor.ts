import type { Prisma } from '@prisma/client'
import { endOfDayBogota, startOfDayBogota } from '@/lib/dates'

/**
 * Comisión del repartidor por entregas. FUENTE ÚNICA (#499): la usan la nómina
 * del período, la vista de «Nómina del día» y, más adelante, el cierre de caja.
 * Así las tres cifras no pueden discrepar.
 *
 * Dos orígenes, sin doble conteo (`embarqueId` los separa):
 *  - Embarque CERRADO del trabajador, en el rango por `Embarque.fecha`: cuenta lo
 *    entregado de sus pedidos `ENTREGADO`.
 *  - TEMPORAL-SIN-EMBARQUE(#472): pedidos a domicilio que la oficina entregó sin
 *    embarque con el trabajador como responsable, en el rango por `entregadoAt`.
 */

export type TxComision = Pick<Prisma.TransactionClient, 'embarque' | 'pedido' | 'config' | 'trabajador'>

/** Tarifa por unidad entregada. */
export interface TarifasRepartidor {
  agua: number
  hielo: number
  botellon: number
}

export interface ComisionRepartidor {
  entregasAgua: number
  entregasHielo: number
  entregasBotellon: number
  comAgua: number
  comHielo: number
  comBotellon: number
  total: number
  /** Cuánto de `total` viene de cada origen. */
  porOrigen: { embarque: number; sinEmbarque: number }
}

type DatosTarifa = {
  comRepartAgua: Prisma.Decimal | number | null
  comRepartHielo: Prisma.Decimal | number | null
  comRepartBotellon: Prisma.Decimal | number | null
}

const TARIFA_DEFECTO = 200

/**
 * Mismas reglas de siempre, sin cambios (#499 no toca dinero): tarifa del trabajador, si no
 * `COM_REPARTIDOR`, si no 200 (botellón: 200). Ojo: las columnas son `Decimal` no nulas con
 * default 0 y un `Decimal` siempre es «verdadero», así que hoy un 0 se queda en 0 y nunca
 * cae a la tarifa general. Decisión pendiente del PO en #500.
 */
export function tarifasRepartidor(t: DatosTarifa, comRepartidorConfig?: number): TarifasRepartidor {
  const base = comRepartidorConfig || TARIFA_DEFECTO
  return {
    agua: Number(t.comRepartAgua || base),
    hielo: Number(t.comRepartHielo || base),
    botellon: Number(t.comRepartBotellon || TARIFA_DEFECTO),
  }
}

type Entregado = {
  cPacaAguaEnt: number
  cPacaHieloEnt: number
  cBotellonFabEnt: number | null
  cBotellonDomEnt: number | null
}

const botellones = (p: Entregado) => (p.cBotellonFabEnt || 0) + (p.cBotellonDomEnt || 0)

const SELECT_ENTREGADO = {
  cPacaAguaEnt: true,
  cPacaHieloEnt: true,
  cBotellonFabEnt: true,
  cBotellonDomEnt: true,
} as const

/** Comisión de un trabajador en `[ini, fin]`. No decide si el trabajador cobra comisión: eso lo decide quien llama. */
export async function calcularComisionRepartidor(
  tx: Pick<TxComision, 'embarque' | 'pedido'>,
  trabajadorId: string,
  ini: Date,
  fin: Date,
  tarifas: TarifasRepartidor,
): Promise<ComisionRepartidor> {
  const embarques = await tx.embarque.findMany({
    where: { trabajadorId, fecha: { gte: ini, lte: fin }, estado: 'CERRADO' },
    include: { pedidos: { where: { estado: 'ENTREGADO' } } },
  })

  // TEMPORAL-SIN-EMBARQUE(#472): al retirar la función temporal, borrar esta consulta
  // y el segundo bucle. `embarqueId: null` evita contar un pedido que sí está en un embarque.
  const sinEmbarque = await tx.pedido.findMany({
    where: {
      entregadoPorId: trabajadorId,
      embarqueId: null,
      canal: 'DOMICILIO',
      estadoEntrega: 'ENTREGADO',
      entregadoAt: { gte: ini, lte: fin },
    },
    select: SELECT_ENTREGADO,
  })

  const suma = (lista: Entregado[]) => ({
    agua: lista.reduce((s, p) => s + p.cPacaAguaEnt, 0),
    hielo: lista.reduce((s, p) => s + p.cPacaHieloEnt, 0),
    botellon: lista.reduce((s, p) => s + botellones(p), 0),
  })
  const dinero = (u: { agua: number; hielo: number; botellon: number }) =>
    u.agua * tarifas.agua + u.hielo * tarifas.hielo + u.botellon * tarifas.botellon

  const uEmbarque = suma(embarques.flatMap((e) => e.pedidos))
  const uSin = suma(sinEmbarque)
  const entregasAgua = uEmbarque.agua + uSin.agua
  const entregasHielo = uEmbarque.hielo + uSin.hielo
  const entregasBotellon = uEmbarque.botellon + uSin.botellon

  return {
    entregasAgua,
    entregasHielo,
    entregasBotellon,
    comAgua: entregasAgua * tarifas.agua,
    comHielo: entregasHielo * tarifas.hielo,
    comBotellon: entregasBotellon * tarifas.botellon,
    total: dinero({ agua: entregasAgua, hielo: entregasHielo, botellon: entregasBotellon }),
    porOrigen: { embarque: dinero(uEmbarque), sinEmbarque: dinero(uSin) },
  }
}

export interface ComisionRepartidorDia extends ComisionRepartidor {
  trabajadorId: string
  nombre: string
}

/**
 * Comisión de cada repartidor en un día de Bogotá (`YYYY-MM-DD`). Incluye a todos los
 * trabajadores activos con moto que cobran comisión (aunque hoy lleven $0), ordenados por nombre.
 */
export async function comisionRepartidoresDelDia(tx: TxComision, fecha: string): Promise<ComisionRepartidorDia[]> {
  const ini = startOfDayBogota(fecha)
  const fin = endOfDayBogota(fecha)
  const [config, trabajadores] = await Promise.all([
    tx.config.findUnique({ where: { clave: 'COM_REPARTIDOR' } }),
    tx.trabajador.findMany({
      where: { activo: true, usaMoto: true, tipoPago: { in: ['COMISION', 'MIXTO'] } },
      select: { id: true, nombre: true, comRepartAgua: true, comRepartHielo: true, comRepartBotellon: true },
      orderBy: { nombre: 'asc' },
    }),
  ])
  const porDefecto = config ? parseFloat(config.valor) : undefined
  const filas: ComisionRepartidorDia[] = []
  for (const t of trabajadores) {
    const c = await calcularComisionRepartidor(tx, t.id, ini, fin, tarifasRepartidor(t, porDefecto))
    filas.push({ trabajadorId: t.id, nombre: t.nombre, ...c })
  }
  return filas
}
