/**
 * POST /api/cron/alertas-batch
 *
 * commit 4 plan antifraude: ejecuta el detector de alertas
 * server-side y crea Casos (con dedup) para los hallazgos.
 *
 * Complementa al cron de 3.3 (CLIENTE_NO_VERIFICADO). Este batch
 * procesa TODAS las alertas que requieren datos cross-table:
 *   - DESCUENTO_NO_JUSTIFICADO (DescuentoRepartidor)
 *   - NOTA_CREDITO_FRECUENTE (NotaCredito + Pedido join)
 *   - REPARTIDOR_DEUDA_ALTA (Trabajador.deudaReposAgua/Hielo)
 *   - DEVOLUCIONES_ANORMALES + ROTURAS_ANORMALES (Embarque)
 *   - RECLAMACIONES_MULTIPLES / RECLAMACION_ACTIVA (Cliente.reclamaciones)
 *
 * Cada hallazgo se evalua contra los unique partial indexes de commit 0c
 * (caso_dedup_abierto_cliente_unique / caso_dedup_abierto_repartidor_unique)
 * para garantizar que no se creen Casos duplicados.
 *
 * Limitaciones de scope (no incluidas en este commit):
 * - Alertas que requieren data de PrecioVolumen (PRECIO_POR_DEBAJO_TABLA)
 *   se mantienen client-side (alertas-table ya las calcula).
 * - CAMBIO_PRECIO_BRUSCO y MONTO_ANOMALO requieren mediana de
 *   historial del cliente — server-side es costoso. Se mantienen
 *   client-side por ahora.
 * - 2DO/3RO_PEDIDO, NO_ENTREGADO_REPETIDO requieren data del dia
 *   actual. Se mantienen client-side.
 *
 * Auth: requireCronSecret.
 * Idempotente: corre diario, dedup via partial unique indexes.
 */
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'
import { requireCronSecret } from '@/lib/cron-auth'
import { UMBRALES_DEFAULT } from '@/lib/umbrales'
import { broadcastPush } from '@/lib/push'

const SISTEMA_USERNAME = 'system@bambu.local'
const NC_VENTANA_DIAS = 30
const DEVOLUCIONES_MIN_EMBARQUES = 5
const DEVOLUCIONES_MULTIPLICADOR = UMBRALES_DEFAULT.pctDevolucionesAnormales
const NOTA_CREDITO_MIN = 2
const DEUDA_REPARTIDOR_MIN_PACAS = UMBRALES_DEFAULT.umbralDeudaRepartidorPacas
const DESCUENTO_SIN_JUSTIFICAR_DIAS = UMBRALES_DEFAULT.diasSinJustificarDescuento

export async function POST(request: NextRequest) {
  const authError = requireCronSecret(request)
  if (authError) return authError

  try {
    // 1. SYSTEM user check
    const systemUser = await prisma.user.findUnique({
      where: { username: SISTEMA_USERNAME },
      select: { id: true },
    })
    if (!systemUser) {
      logger.error('[cron alertas-batch] SYSTEM user no existe. Corre el seed.')
      return apiError('SYSTEM user no existe. Ejecutar seed primero.', 500)
    }

    const ahora = new Date()
    let casosCreados = 0
    let casosSaltados = 0
    const fallos: string[] = []

    // ========================================
    // 2. NOTA_CREDITO_FRECUENTE por cliente
    // ========================================
    {
      const fechaLimite = new Date(ahora)
      fechaLimite.setDate(fechaLimite.getDate() - NC_VENTANA_DIAS)
      const ncPorCliente = new Map<string, number>()

      const grupos = await prisma.notaCredito.groupBy({
        by: ['pedidoId'],
        where: { fecha: { gte: fechaLimite } },
        _count: { _all: true },
      })
      if (grupos.length > 0) {
        const pedidoIds = grupos.map((g) => g.pedidoId)
        const pedidos = await prisma.pedido.findMany({
          where: { id: { in: pedidoIds } },
          select: { id: true, clienteId: true },
        })
        const pedidoToCliente = new Map(pedidos.map((p) => [p.id, p.clienteId]))
        for (const g of grupos) {
          const clienteId = pedidoToCliente.get(g.pedidoId)
          if (clienteId) {
            ncPorCliente.set(clienteId, (ncPorCliente.get(clienteId) ?? 0) + g._count._all)
          }
        }
      }

      for (const [clienteId, count] of ncPorCliente) {
        if (count < NOTA_CREDITO_MIN) continue
        const result = await crearCasoSiNoExiste({
          clienteId,
          alertaTipo: 'NOTA_CREDITO_FRECUENTE',
          severidad: 'ALTA',
          titulo: `Cliente con ${count} notas de credito en ${NC_VENTANA_DIAS} dias`,
          descripcion: `Patron 'pide-factura-devuelve': el cliente ha generado ${count} NCs en los ultimos ${NC_VENTANA_DIAS} dias.`,
          creadoPorId: systemUser.id,
        })
        if (result.result === 'creado') casosCreados++
        else casosSaltados++
      }
    }

    // ========================================
    // 3. DESCUENTO_NO_JUSTIFICADO por repartidor
    // ========================================
    {
      const fechaLimite = new Date(ahora)
      fechaLimite.setDate(fechaLimite.getDate() - DESCUENTO_SIN_JUSTIFICAR_DIAS)
      const descuentos = await prisma.descuentoRepartidor.findMany({
        where: {
          justificado: false,
          fecha: { lt: fechaLimite },
        },
        select: {
          id: true,
          monto: true,
          motivo: true,
          trabajadorId: true,
          fecha: true,
        },
      })
      // Agrupar por repartidor para el titulo
      const porRepartidor = new Map<string, typeof descuentos>()
      for (const d of descuentos) {
        const arr = porRepartidor.get(d.trabajadorId) ?? []
        arr.push(d)
        porRepartidor.set(d.trabajadorId, arr)
      }
      for (const [repartidorId, ds] of porRepartidor) {
        const totalMonto = ds.reduce((acc, d) => acc + Number(d.monto), 0)
        const result = await crearCasoSiNoExiste({
          repartidorId,
          alertaTipo: 'DESCUENTO_NO_JUSTIFICADO',
          severidad: 'MEDIA',
          titulo: `Repartidor con ${ds.length} descuento(s) sin justificar`,
          descripcion: `Monto total: $${totalMonto.toLocaleString('es-CO')}. ${ds.length} descuentos sin justificacion por mas de ${DESCUENTO_SIN_JUSTIFICAR_DIAS} dias.`,
          creadoPorId: systemUser.id,
        })
        if (result.result === 'creado') casosCreados++
        else casosSaltados++
      }
    }

    // ========================================
    // 4. REPARTIDOR_DEUDA_ALTA
    // ========================================
    {
      const trabajadoresConDeuda = await prisma.trabajador.findMany({
        where: {
          OR: [
            { deudaReposAgua: { gt: 0 } },
            { deudaReposHielo: { gt: 0 } },
          ],
        },
        select: {
          id: true,
          nombre: true,
          deudaReposAgua: true,
          deudaReposHielo: true,
        },
      })
      for (const t of trabajadoresConDeuda) {
        const total = Number(t.deudaReposAgua) + Number(t.deudaReposHielo)
        if (total <= DEUDA_REPARTIDOR_MIN_PACAS) continue
        const result = await crearCasoSiNoExiste({
          repartidorId: t.id,
          alertaTipo: 'REPARTIDOR_DEUDA_ALTA',
          severidad: 'MEDIA',
          titulo: `Repartidor ${t.nombre} adeuda ${total} pacas`,
          descripcion: `Deuda acumulada: agua=${t.deudaReposAgua}, hielo=${t.deudaReposHielo}. Umbral: ${DEUDA_REPARTIDOR_MIN_PACAS} pacas.`,
          creadoPorId: systemUser.id,
        })
        if (result.result === 'creado') casosCreados++
        else casosSaltados++
      }
    }

    // ========================================
    // 5. DEVOLUCIONES_ANORMALES + ROTURAS_ANORMALES por repartidor
    // ========================================
    {
      const embarques = await prisma.embarque.findMany({
        where: {
          estado: { not: 'CANCELADO' },
        },
        select: {
          id: true,
          fecha: true,
          trabajadorId: true,
          devueltasAgua: true,
          devueltasHielo: true,
          rotasAgua: true,
          rotasHielo: true,
          trabajador: { select: { nombre: true } },
        },
        orderBy: { fecha: 'desc' },
      })

      // Agrupar por repartidor
      const porRepartidor = new Map<string, typeof embarques>()
      for (const e of embarques) {
        const arr = porRepartidor.get(e.trabajadorId) ?? []
        arr.push(e)
        porRepartidor.set(e.trabajadorId, arr)
      }

      for (const [repartidorId, lista] of porRepartidor) {
        if (lista.length < DEVOLUCIONES_MIN_EMBARQUES) continue
        const totalDevueltas = lista.reduce(
          (acc, e) => acc + (e.devueltasAgua || 0) + (e.devueltasHielo || 0),
          0,
        )
        const totalRotas = lista.reduce(
          (acc, e) => acc + (e.rotasAgua || 0) + (e.rotasHielo || 0),
          0,
        )
        const promDev = totalDevueltas / lista.length
        const promRot = totalRotas / lista.length

        // Buscar embarques outlier
        const outliersDev = lista.find(
          (e) => (e.devueltasAgua + e.devueltasHielo) > promDev * DEVOLUCIONES_MULTIPLICADOR && promDev > 0,
        )
        const outliersRot = lista.find(
          (e) => (e.rotasAgua + e.rotasHielo) > promRot * DEVOLUCIONES_MULTIPLICADOR && promRot > 0,
        )

        if (outliersDev) {
          const result = await crearCasoSiNoExiste({
            repartidorId,
            alertaTipo: 'DEVOLUCIONES_ANORMALES',
            severidad: 'MEDIA',
            titulo: `Repartidor ${outliersDev.trabajador.nombre} con devoluciones anormales`,
            descripcion: `Embarque ${outliersDev.id} con ${outliersDev.devueltasAgua + outliersDev.devueltasHielo} devueltas (promedio: ${promDev.toFixed(1)}, umbral: ${(promDev * DEVOLUCIONES_MULTIPLICADOR).toFixed(1)}).`,
            creadoPorId: systemUser.id,
          })
          if (result.result === 'creado') casosCreados++
          else casosSaltados++
        }
        if (outliersRot) {
          const result = await crearCasoSiNoExiste({
            repartidorId,
            alertaTipo: 'ROTURAS_ANORMALES',
            severidad: 'BAJA',
            titulo: `Repartidor ${outliersRot.trabajador.nombre} con roturas anormales`,
            descripcion: `Embarque ${outliersRot.id} con ${outliersRot.rotasAgua + outliersRot.rotasHielo} rotas (promedio: ${promRot.toFixed(1)}, umbral: ${(promRot * DEVOLUCIONES_MULTIPLICADOR).toFixed(1)}).`,
            creadoPorId: systemUser.id,
          })
          if (result.result === 'creado') casosCreados++
          else casosSaltados++
        }
      }
    }

    // ========================================
    // 6. RECLAMACIONES_MULTIPLES por cliente
    // ========================================
    {
      const clientesConReclamaciones = await prisma.cliente.findMany({
        where: {
          reclamaciones: { gte: 3 },
          activo: true,
        },
        select: {
          id: true,
          nombre: true,
          reclamaciones: true,
        },
      })
      for (const c of clientesConReclamaciones) {
        const result = await crearCasoSiNoExiste({
          clienteId: c.id,
          alertaTipo: 'RECLAMACIONES_MULTIPLES',
          severidad: 'ALTA',
          titulo: `Cliente ${c.nombre} con ${c.reclamaciones} reclamaciones acumuladas`,
          descripcion: `El cliente tiene ${c.reclamaciones} disputas en su historial. Posible fraude recurrente o problema sistematico.`,
          creadoPorId: systemUser.id,
        })
        if (result.result === 'creado') casosCreados++
        else casosSaltados++
      }
    }

    const summary = {
      casosCreados,
      casosSaltados,
      fallos: fallos.length,
    }
    logger.info(summary, '[cron alertas-batch] completado')

    return apiSuccess({
      ...summary,
      mensaje: `Batch procesado: ${casosCreados} caso(s) creado(s), ${casosSaltados} saltado(s) por dedup`,
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown'
    logger.error({ err: errMsg }, '[cron alertas-batch] error general')
    return apiError('Error procesando batch de alertas')
  }
}

/**
 * Crea un Caso si no existe ya uno ABIERTO con la misma
 * (clienteId|repartidorId, alertaTipo). Usa el partial unique
 * index `caso_dedup_abierto_cliente_unique` o
 * `caso_dedup_abierto_repartidor_unique` (commit 0c) para
 * garantizar dedup a nivel DB.
 *
 * Retorna 'creado' si se creo, 'saltado' si ya existia un Caso
 * ABIERTO con misma alertaTipo para el mismo sujeto.
 */
async function crearCasoSiNoExiste(params: {
  clienteId?: string
  repartidorId?: string
  alertaTipo: string
  severidad: 'ALTA' | 'MEDIA' | 'BAJA'
  titulo: string
  descripcion: string
  creadoPorId: string
}): Promise<{ result: 'creado' | 'saltado'; casoId: string | null }> {
  const { clienteId, repartidorId, alertaTipo, severidad, titulo, descripcion, creadoPorId } = params

  // Pre-check explicito (mejor UX/log que el P2002 del unique index)
  const whereClause: Record<string, unknown> = { alertaTipo, status: 'ABIERTO' }
  if (clienteId) whereClause.clienteId = clienteId
  if (repartidorId) whereClause.repartidorId = repartidorId

  const existing = await prisma.caso.findFirst({ where: whereClause })
  if (existing) {
    return { result: 'saltado', casoId: existing.id }
  }

  try {
    const caso = await prisma.caso.create({
      data: {
        alertaTipo,
        severidad,
        titulo,
        descripcion,
        clienteId: clienteId ?? null,
        repartidorId: repartidorId ?? null,
        creadoPorId,
        status: 'ABIERTO',
      },
      select: { id: true },
    })

    // commit 4b: trigger push para ALTA (MEDIA y BAJA son
    // lower-priority, no requieren atencion inmediata)
    if (severidad === 'ALTA') {
      void broadcastPush({
        title: `Alerta antifraude: ${alertaTipo}`,
        body: titulo,
        url: `/casos/${caso.id}`,
        tag: `caso-${caso.id}`,
      })
    }

    return { result: 'creado', casoId: caso.id }
  } catch (e: unknown) {
    // Si el unique index dispara (P2002), significa que hubo
    // carrera con otro cron. Eso es OK, es dedup normal.
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
      return { result: 'saltado', casoId: null }
    }
    throw e
  }
}
