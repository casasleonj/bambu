import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const clienteId = process.argv[2]
  const fechaStr = process.argv[3]
  const estadoEntrega = (process.argv[4] || 'ENTREGADO') as 'PENDIENTE' | 'EN_RUTA' | 'ENTREGADO' | 'NO_ENTREGADO' | 'CANCELADO' | 'ANULADO'
  const estadoPago = (process.argv[5] || 'PENDIENTE') as 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'ANTICIPADO' | 'VENCIDO' | 'ANULADO'
  const producto = process.argv[6] || 'PACA_AGUA'
  const cantidad = Number(process.argv[7] || 1)

  if (!clienteId || !fechaStr) {
    console.error('Usage: npx tsx prisma/create-pedido-fiado.ts <clienteId> <YYYY-MM-DD> [estadoEntrega] [estadoPago] [producto] [cantidad]')
    process.exit(1)
  }

  const [year, month, day] = fechaStr.split('-').map(Number)
  const fecha = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))

  const productoRow = await prisma.producto.findUnique({ where: { codigo: producto } })
  const precio = productoRow?.precioBase?.toNumber() || 12000
  const subtotal = precio * cantidad
  const saldo = estadoPago === 'PAGADO' || estadoPago === 'ANTICIPADO' ? 0 : subtotal

  const pedido = await prisma.pedido.create({
    data: {
      clienteId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      estado: estadoEntrega,
      estadoEntrega,
      estadoPago,
      total: subtotal,
      totalPagado: subtotal - saldo,
      saldo,
      fecha,
      fechaEntrega: fecha,
      items: {
        create: {
          producto,
          cantPedido: cantidad,
          cantEntrega: estadoEntrega === 'ENTREGADO' ? cantidad : 0,
          precio,
          subtotal,
        },
      },
    },
  })

  console.log(pedido.id)
}

main().finally(() => prisma.$disconnect())
