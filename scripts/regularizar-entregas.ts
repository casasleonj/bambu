/**
 * Regularización de entregas no registradas (2026-10).
 *
 * Marca como ENTREGADOS los pedidos del ledger `regularizar-entregas.ledger.json`
 * pasando por el flujo canónico de la app (`EntregarPedidoUseCase`: cantidades
 * entregadas, estado de pago, pagos, factura, proyección de cartera y
 * auditoría), con `entregadoAt` = instante de creación del pedido.
 *
 * Decisión de negocio (2026-10-08): se entregaron el mismo día en que se
 * crearon; los que estaban sin pagar se cobraron completos en EFECTIVO al
 * entregar. Los prepagados (ANTICIPADO) no reciben pagos nuevos.
 *
 * Uso:
 *   npx tsx scripts/regularizar-entregas.ts --dry-run --actor admin
 *   npx tsx scripts/regularizar-entregas.ts --actor admin
 *
 *   # producción (Supabase): exportar la URL directa antes de correr
 *   DATABASE_URL="$DIRECT_URL_DE_SUPABASE" npx tsx scripts/regularizar-entregas.ts --dry-run --actor <usuario>
 *
 * Flags:
 *   --dry-run          cero escrituras.
 *   --actor <usuario>  ADMIN que firma la regularización (auditoría).
 *   --ledger <ruta>    ledger alternativo (pruebas locales); por defecto el
 *                      `regularizar-entregas.ledger.json` junto al script.
 *
 * Garantías:
 *  - --dry-run: cero escrituras; imprime el plan y los conflictos.
 *  - Nada se decide aquí: cada pedido debe coincidir con el ledger (número,
 *    total, estado de pago). Cualquier diferencia es CONFLICTO y ese pedido
 *    no se toca.
 *  - Idempotente: la entrega usa `entregaOfflineId = regul-entrega-2026-10:<id>`;
 *    una segunda corrida reporta YA_REGULARIZADO.
 *  - Los Pago y ReceivableEntry creados por la entrega quedan fechados el día
 *    de la venta (`createdAt` = creación del pedido) y marcados con ese
 *    offlineId, para que caja y cartera los cuenten en su día real.
 *  - No envía notificaciones push ni eventos realtime (es una corrección
 *    administrativa, no una entrega en vivo).
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { entregarPedidoUseCase } from '@/modules/pedidos'
import {
  planificarEntrega,
  validarLedger,
  type PedidoParaRegularizar,
  type PlanEntrega,
} from '@/lib/regularizacion/entregas-ledger'

const MOTIVO =
  'Regularización administrativa 2026-10: entrega física no registrada en la app; ' +
  'el negocio confirmó entrega el mismo día de creación y cobro en efectivo de los pendientes.'

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(nombre)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function cargarPedido(id: string): Promise<PedidoParaRegularizar | null> {
  const p = await prisma.pedido.findUnique({
    where: { id },
    select: {
      id: true,
      numero: true,
      estadoEntrega: true,
      estadoPago: true,
      total: true,
      totalPagado: true,
      embarqueId: true,
      entregaOfflineId: true,
      createdAt: true,
      items: { select: { producto: true, cantPedido: true, cantEntrega: true } },
    },
  })
  if (!p) return null
  return { ...p, total: Number(p.total), totalPagado: Number(p.totalPagado) }
}

async function ejecutar(plan: PlanEntrega, creadoEn: Date, actorId: string): Promise<void> {
  const [pagosAntes, receivablesAntes] = await Promise.all([
    prisma.pago.findMany({ where: { pedidoId: plan.pedidoId }, select: { id: true } }),
    prisma.receivableEntry.findMany({ where: { pedidoId: plan.pedidoId }, select: { id: true } }),
  ])

  // La app solo llega a EN_RUTA asignando a un embarque. No se inventan
  // embarques históricos (atribuirían caja a un repartidor): paso
  // administrativo PENDIENTE → EN_RUTA, guardado por estado y sin embarque.
  await prisma.pedido.updateMany({
    where: { id: plan.pedidoId, estadoEntrega: 'PENDIENTE', embarqueId: null },
    data: { estadoEntrega: 'EN_RUTA' },
  })

  try {
    await entregarPedidoUseCase.execute({
      pedidoId: plan.pedidoId,
      actorId,
      itemsEntregados: plan.itemsEntregados,
      pagos: plan.pagos,
      entregadoAt: plan.entregadoAt,
      entregadoConGps: false,
      gpsJustificacion: MOTIVO.slice(0, 500),
      offlineId: plan.offlineId,
    })
  } catch (err) {
    // La entrega no se aplicó: devolver el pedido a PENDIENTE (sin efectos).
    await prisma.pedido.updateMany({
      where: { id: plan.pedidoId, estadoEntrega: 'EN_RUTA', embarqueId: null, entregaOfflineId: null },
      data: { estadoEntrega: 'PENDIENTE' },
    })
    throw err
  }

  // Fecha real de la venta para los hechos monetarios creados por la entrega.
  await prisma.$transaction(async tx => {
    const nuevosPagos = await tx.pago.findMany({
      where: { pedidoId: plan.pedidoId, id: { notIn: pagosAntes.map(p => p.id) } },
      select: { id: true, confirmadoAt: true },
    })
    for (const p of nuevosPagos) {
      await tx.pago.update({
        where: { id: p.id },
        data: {
          createdAt: creadoEn,
          offlineId: plan.offlineId,
          ...(p.confirmadoAt ? { confirmadoAt: creadoEn } : {}),
        },
      })
    }
    await tx.receivableEntry.updateMany({
      where: { pedidoId: plan.pedidoId, id: { notIn: receivablesAntes.map(r => r.id) } },
      data: { createdAt: creadoEn, offlineId: plan.offlineId },
    })
    await logAudit(
      {
        entidad: 'Pedido',
        registroId: plan.pedidoId,
        accion: 'UPDATE',
        usuarioId: actorId,
        datos: {
          accion: 'REGULARIZACION_ENTREGA',
          motivo: MOTIVO,
          entregadoAt: plan.entregadoAt,
          pagos: plan.pagos,
          offlineId: plan.offlineId,
        },
      },
      tx,
    )
  })
}

async function verificar(pedidoId: string): Promise<string | null> {
  const p = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    select: {
      estadoEntrega: true,
      estadoPago: true,
      total: true,
      saldo: true,
      factura: { select: { estado: true, saldo: true } },
      pagos: { select: { monto: true } },
    },
  })
  if (!p) return 'no encontrado'
  const pagado = p.pagos.reduce((s, x) => s + Number(x.monto), 0)
  const errores: string[] = []
  if (p.estadoEntrega !== 'ENTREGADO') errores.push(`estadoEntrega=${p.estadoEntrega}`)
  if (p.estadoPago !== 'PAGADO') errores.push(`estadoPago=${p.estadoPago}`)
  if (Number(p.saldo) !== 0) errores.push(`saldo=${p.saldo}`)
  if (Math.round(pagado * 100) !== Math.round(Number(p.total) * 100)) errores.push(`ΣPago=${pagado}`)
  if (p.factura && p.factura.estado !== 'PAGADA') errores.push(`factura=${p.factura.estado}`)
  return errores.length ? errores.join(', ') : null
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const actorUsername = arg('--actor')
  if (!actorUsername) throw new Error('Falta --actor <username> (usuario ADMIN que firma la regularización)')

  const actor = await prisma.user.findUnique({
    where: { username: actorUsername },
    select: { id: true, rol: true },
  })
  if (!actor || actor.rol !== 'ADMIN') throw new Error(`--actor ${actorUsername} no existe o no es ADMIN`)

  const ledgerPath = arg('--ledger') ?? join(__dirname, 'regularizar-entregas.ledger.json')
  const ledger = validarLedger(JSON.parse(readFileSync(ledgerPath, 'utf8')))
  console.log(`${dryRun ? '[DRY-RUN] ' : ''}Regularización de ${ledger.length} entregas — actor ${actorUsername}`)

  const resumen = { plan: 0, hecho: 0, ya: 0, conflicto: 0, error: 0, efectivo: 0 }
  for (const entrada of ledger) {
    const pedido = await cargarPedido(entrada.pedidoId)
    const r = planificarEntrega(entrada, pedido)
    const etiqueta = `#${entrada.numero} (${entrada.pedidoId})`

    if (r.tipo === 'YA_REGULARIZADO') {
      resumen.ya++
      console.log(`= ${etiqueta}: ya regularizado`)
      continue
    }
    if (r.tipo === 'CONFLICTO') {
      resumen.conflicto++
      console.log(`! ${etiqueta}: CONFLICTO — ${r.motivo}`)
      continue
    }

    const cobro = r.plan.pagos.reduce((s, p) => s + p.monto, 0)
    resumen.plan++
    resumen.efectivo += cobro
    const items = r.plan.itemsEntregados.map(i => `${i.producto}×${i.cantidad}`).join(', ')
    console.log(`→ ${etiqueta}: entregar ${items} @ ${r.plan.entregadoAt}; cobro efectivo ${cobro}`)
    if (dryRun || !pedido) continue

    try {
      await ejecutar(r.plan, pedido.createdAt, actor.id)
      const fallo = await verificar(r.plan.pedidoId)
      if (fallo) {
        resumen.error++
        console.log(`  ✗ verificación: ${fallo}`)
      } else {
        resumen.hecho++
        console.log('  ✓ entregado, pagado, factura PAGADA')
      }
    } catch (err) {
      resumen.error++
      console.log(`  ✗ ERROR: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log('\nResumen:', JSON.stringify(resumen))
  if (resumen.conflicto > 0 || resumen.error > 0) process.exitCode = 1
}

main()
  .catch(err => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
