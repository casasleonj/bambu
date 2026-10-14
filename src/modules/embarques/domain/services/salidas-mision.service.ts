/**
 * SalidasMisionService (PR-1C — AB-ALS-EMB-2026-10-13, Adenda v1.2 §3.2).
 *
 * Calcula qué salió físicamente del vehículo en ESTA misión a partir del ledger
 * (`EmbarqueMovimiento`), en vez del acumulado comercial `pedidosRaw.cXEnt`.
 * Solo aplica a embarques en modo "entrega viva" (ver `@/lib/entrega-fisica-viva`).
 * Detalle del contrato en docs/incidentes/PR1BC_ENTREGA_FISICA_VIVA_2026-10-14.md.
 */

import { acquireAdvisoryLockTx } from '@/lib/locks'
import {
  CAPTURA_ENTREGA_PEDIDO,
  embarqueUsaEntregaVivaPorFlag,
  esEntregaDeMision,
  esEntregaSinAtribucion,
  leerMetadata,
} from '@/lib/entrega-fisica-viva'
import type { ProductCode } from '../value-objects/Carga'
import type { PedidoRawInput, EntregaDelCierre } from './procesar-pedido.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxOrPrisma = any

export interface VentaLibreCantidades {
  cPacaAgua?: number
  cPacaHielo?: number
  cBotellonFab?: number
  cBotellonDom?: number
  cBolsaAgua?: number
  cBolsaHielo?: number
}

export interface SalidasMision {
  /** Entregadas de la misión para la conciliación, por producto. */
  entregadas: Record<ProductCode, number>
  /** Lo que ESTE cierre escribe como ENTREGA (delta propio + ventas libres previas). */
  entregasCierre: Record<string, number>
}

export class SalidasMisionService {
  /**
   * Camino anterior (embarques sin modo vivo): entregadas = acumulado comercial
   * de los pedidos de la misión + ventas libres declaradas. Excepción histórica.
   */
  entregadasPorAcumulado(pedidosRaw: PedidoRawInput[], ventasLibres: VentaLibreCantidades[]): Record<ProductCode, number> {
    const e: Record<ProductCode, number> = { PACA_AGUA: 0, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 }
    for (const p of pedidosRaw) {
      e.PACA_AGUA += p.cPacaAguaEnt || 0
      e.PACA_HIELO += p.cPacaHieloEnt || 0
      e.BOTELLON += (p.cBotellonFabEnt || 0) + (p.cBotellonDomEnt || 0)
      e.BOLSA_AGUA += p.cBolsaAguaEnt || 0
      e.BOLSA_HIELO += p.cBolsaHieloEnt || 0
    }
    for (const v of ventasLibres) {
      e.PACA_AGUA += v.cPacaAgua || 0
      e.PACA_HIELO += v.cPacaHielo || 0
      e.BOTELLON += (v.cBotellonFab || 0) + (v.cBotellonDom || 0)
      e.BOLSA_AGUA += v.cBolsaAgua || 0
      e.BOLSA_HIELO += v.cBolsaHielo || 0
    }
    return e
  }

  /**
   * PR-1C: ¿este embarque cierra por el camino de "entrega viva"? Por fecha de
   * activación del flag, o porque YA tiene eventos `ENTREGA` atribuidos (un
   * rollback del flag a mitad de misión no puede volver a la lógica anterior sin
   * duplicar la salida). Embarques anteriores = excepción histórica.
   */
  async esModoVivo(client: TxOrPrisma, embarqueId: string, createdAt: Date): Promise<boolean> {
    if (embarqueUsaEntregaVivaPorFlag(createdAt)) return true
    const atribuidos = await client.embarqueMovimiento.count({
      where: { embarqueId, tipo: 'ENTREGA', metadata: { path: ['captura'], equals: CAPTURA_ENTREGA_PEDIDO } },
    })
    return atribuidos > 0
  }

  async bloquearPedidos(client: TxOrPrisma, embarqueId: string): Promise<void> {
    const ids = await client.pedido.findMany({ where: { embarqueId }, select: { id: true }, orderBy: { id: 'asc' } })
    for (const { id } of ids) await acquireAdvisoryLockTx(client, 'PEDIDO', id)
  }

  /**
   * PR-1C (Adenda v1.2 §3.2 punto 7): salidas de la misión desde el ledger.
   *  - `entregadas` (conciliación) = eventos atribuidos de `/entrega` + entregas
   *    manuales de botellón + ventas libres previas sin evento + delta propio
   *    del cierre + ventas libres declaradas en el cierre.
   *  - `entregasCierre` = lo que ESTE cierre escribe como ENTREGA (delta propio
   *    + ventas libres previas), una sola vez.
   *  - Guarda B-09: si hay entregas SIN identidad verificable (manuales) y el
   *    total de salidas supera la carga, no se adivina cuál es duplicado: se
   *    rechaza para revisión. Nunca se deduplica por coincidencia de cantidad.
   */
  async calcular(
    client: TxOrPrisma,
    embarqueId: string,
    embarque: { productos: Array<{ producto: string; cargadas: number }> },
    pedidosRaw: PedidoRawInput[],
    entregasDelCierre: EntregaDelCierre[],
    ventasLibres: VentaLibreCantidades[],
  ): Promise<SalidasMision> {
    const productos: ProductCode[] = ['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO']
    const cero = (): Record<ProductCode, number> => ({ PACA_AGUA: 0, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 })

    const eventos = await client.embarqueMovimiento.findMany({
      where: { embarqueId, tipo: 'ENTREGA' },
      select: { producto: true, cantidad: true, metadata: true },
    })
    const promos = await client.embarqueMovimiento.findMany({
      where: { embarqueId, tipo: { in: ['PROMOCION', 'VENTA_RUTA'] } },
      select: { producto: true, cantidad: true },
    })

    const deMision = cero()
    const enLedger = cero()
    const sinIdentidad = new Set<string>()
    const pedidosConEvento = new Set<string>()
    for (const e of eventos) {
      const m = leerMetadata(e.metadata)
      if (m.posCierre) continue // evento tardío: conciliación post-cierre, no de esta misión
      if (!(e.producto in enLedger)) continue
      const prod = e.producto as ProductCode
      enLedger[prod] += e.cantidad
      if (esEntregaDeMision(e.metadata)) deMision[prod] += e.cantidad
      if (esEntregaSinAtribucion(e.metadata)) sinIdentidad.add(prod)
      if (m.captura === CAPTURA_ENTREGA_PEDIDO && m.pedidoId) pedidosConEvento.add(m.pedidoId)
    }

    // Ventas libres ya creadas en la misión (endpoint venta-libre): se crearon con
    // el vehículo en ruta, así que su entrega completa es salida de ESTA misión.
    // Si además tienen evento atribuido, ese evento ya las cuenta.
    const previas = cero()
    for (const p of pedidosRaw) {
      if (p.origen !== 'VENTA_LIBRE' || pedidosConEvento.has(p.id)) continue
      previas.PACA_AGUA += p.cPacaAguaEnt || 0
      previas.PACA_HIELO += p.cPacaHieloEnt || 0
      previas.BOTELLON += (p.cBotellonFabEnt || 0) + (p.cBotellonDomEnt || 0)
      previas.BOLSA_AGUA += p.cBolsaAguaEnt || 0
      previas.BOLSA_HIELO += p.cBolsaHieloEnt || 0
    }

    const delta = cero()
    for (const d of entregasDelCierre) if (d.producto in delta) delta[d.producto as ProductCode] += d.cantidad

    const vl = cero()
    for (const v of ventasLibres) {
      vl.PACA_AGUA += v.cPacaAgua || 0
      vl.PACA_HIELO += v.cPacaHielo || 0
      vl.BOTELLON += (v.cBotellonFab || 0) + (v.cBotellonDom || 0)
      vl.BOLSA_AGUA += v.cBolsaAgua || 0
      vl.BOLSA_HIELO += v.cBolsaHielo || 0
    }

    const otrasSalidas = cero()
    for (const m of promos) if (m.producto in otrasSalidas) otrasSalidas[m.producto as ProductCode] += m.cantidad

    const cargadas = cero()
    for (const prod of embarque.productos) if (prod.producto in cargadas) cargadas[prod.producto as ProductCode] = prod.cargadas

    const entregadas = cero()
    const entregasCierre: Record<string, number> = {}
    for (const prod of productos) {
      entregadas[prod] = deMision[prod] + previas[prod] + delta[prod] + vl[prod]
      entregasCierre[prod] = delta[prod] + previas[prod]
      const totalSalidas = enLedger[prod] + previas[prod] + delta[prod] + vl[prod] + otrasSalidas[prod]
      if (sinIdentidad.has(prod) && totalSalidas > cargadas[prod]) {
        throw new Error(
          `SALIDAS_EXCEDEN_CARGA: ${prod} registra ${totalSalidas} salidas físicas con ${cargadas[prod]} cargadas y hay entregas manuales sin identidad verificable; revise si una entrega quedó registrada dos veces antes de cerrar`,
        )
      }
    }
    return { entregadas, entregasCierre }
  }
}
