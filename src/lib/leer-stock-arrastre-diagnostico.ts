import type { Prisma } from '@prisma/client'
import { unidadesEntregadasDelDia } from './unidades-entregadas-dia'
import { diagnosticarArrastre, rangoArrastre, type AnclaCierre } from './stock-arrastre-diagnostico'

type Db = Pick<Prisma.TransactionClient, 'cierreDia' | 'produccion' | 'historial' | 'embarqueMovimiento' | 'pedido'>

/**
 * F2-A: solo lectura; no conectar todavía a preview, POST, PUT, cierre,
 * dashboard ni validación de carga. Ejecutar en snapshot consistente
 * suministrado por el caller. Sin ancla fechada no inventar empalme ni saldo.
 */
export async function leerStockArrastreDiagnostico(db: Db, diaObjetivo: string) {
  const { hasta } = rangoArrastre(diaObjetivo, null)
  const cierre = await db.cierreDia.findFirst({
    where: { fecha: { lt: hasta } },
    orderBy: { fecha: 'desc' },
    select: { fecha: true, stockFinAgua: true, stockFinHielo: true, stockFinBotellon: true },
  })
  const ancla: AnclaCierre | null = cierre ? { fecha: cierre.fecha, stock: {
    PACA_AGUA: cierre.stockFinAgua, PACA_HIELO: cierre.stockFinHielo, BOTELLON: cierre.stockFinBotellon,
  } } : null
  const rango = rangoArrastre(diaObjetivo, ancla)
  const vacio = { PACA_AGUA: 0, PACA_HIELO: 0, BOTELLON: 0 }
  if (!rango.desde || rango.diasIntermedios === 0) {
    return diagnosticarArrastre({ diaObjetivo, cierre: ancla, producciones: [],
      entregas: vacio, entregasAproximadas: 0 })
  }
  const desde = rango.desde
  const [producciones, entregas] = await Promise.all([
    db.produccion.findMany({
      where: { fecha: { gte: desde, lt: hasta } },
      select: { id: true, fecha: true, createdAt: true, items: { select: {
        producto: true, producido: true, rotas: true, filtradas: true,
        consumoInterno: true, stockFinFisico: true,
      } } },
    }),
    unidadesEntregadasDelDia(db, { desde, hasta }),
  ])
  return diagnosticarArrastre({ diaObjetivo, cierre: ancla,
    producciones: producciones.map(p => ({ id: p.id, fecha: p.fecha,
      registradaEn: p.createdAt, items: p.items })),
    entregas: { PACA_AGUA: entregas.agua, PACA_HIELO: entregas.hielo, BOTELLON: entregas.botellon },
    entregasAproximadas: entregas.aproximados.length,
  })
}
