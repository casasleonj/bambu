import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔧 Buscando pedidos ANULADOS inconsistentes...\n')

  // Buscar pedidos con estadoEntrega='ANULADO' pero estadoPago≠'ANULADO' o saldo>0
  const pedidosInconsistentes = await prisma.pedido.findMany({
    where: {
      estadoEntrega: 'ANULADO',
      OR: [
        { estadoPago: { not: 'ANULADO' } },
        { saldo: { gt: 0 } },
      ],
    },
    include: { factura: true },
  })

  if (pedidosInconsistentes.length === 0) {
    console.log('✅ No hay pedidos ANULADOS inconsistentes')
    return
  }

  console.log(`📋 Encontrados ${pedidosInconsistentes.length} pedidos inconsistentes:\n`)

  let fixedPedidos = 0
  let fixedFacturas = 0

  for (const pedido of pedidosInconsistentes) {
    console.log(`  Pedido #${pedido.numero} (ID: ${pedido.id})`)
    console.log(`    estadoEntrega: ${pedido.estadoEntrega}`)
    console.log(`    estadoPago: ${pedido.estadoPago} → ANULADO`)
    console.log(`    saldo: ${pedido.saldo} → 0`)
    console.log(`    factura.estado: ${pedido.factura?.estado || 'N/A'}`)

    // Actualizar pedido
    await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        estadoPago: 'ANULADO',
        saldo: 0,
        totalPagado: 0,
      },
    })
    fixedPedidos++

    // Actualizar factura si existe y no está ya ANULADA
    if (pedido.factura && pedido.factura.estado !== 'ANULADA') {
      console.log(`    factura.estado: ${pedido.factura.estado} → ANULADA`)
      console.log(`    factura.saldo: ${pedido.factura.saldo} → 0`)
      await prisma.factura.update({
        where: { id: pedido.factura.id },
        data: {
          estado: 'ANULADA',
          saldo: 0,
        },
      })
      fixedFacturas++
    }

    console.log('')
  }

  console.log(`✅ Corrección completada:`)
  console.log(`   Pedidos actualizados: ${fixedPedidos}`)
  console.log(`   Facturas actualizadas: ${fixedFacturas}`)
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
