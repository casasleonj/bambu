import { prisma } from '/home/cristof/Documents/bambu_demo_multimodelo/src/lib/prisma';
import { EstadoPedido, EstadoEmbarque, EstadoEntrega, EstadoFactura, MetodoPago } from '@prisma/client';

async function testCierreQueries() {
  const fechaStr = '2026-05-19';
  const startOfDay = new Date(fechaStr + 'T00:00:00.000Z');
  const nextDay = new Date(startOfDay);
  nextDay.setDate(nextDay.getDate() + 1);

  console.log('Testing queries for:', fechaStr);
  console.log('Start:', startOfDay.toISOString());
  console.log('Next:', nextDay.toISOString());

  try {
    console.log('1. embarquesAbiertos...');
    const embarquesAbiertos = await prisma.embarque.findMany({
      where: {
        fecha: { gte: startOfDay, lt: nextDay },
        estado: EstadoEmbarque.ABIERTO,
      },
      select: { id: true, numero: true, trabajador: { select: { nombre: true } } },
    });
    console.log('  Result:', embarquesAbiertos.length, 'embarques abiertos');

    console.log('2. pedidos...');
    const pedidos = await prisma.pedido.findMany({
      where: {
        fecha: { gte: startOfDay, lt: nextDay },
        estado: { notIn: [EstadoPedido.CANCELADO, EstadoPedido.ANULADO] },
      },
      include: { pagos: true },
    });
    console.log('  Result:', pedidos.length, 'pedidos');

    console.log('3. produccion...');
    const produccion = await prisma.produccion.findFirst({
      where: { fecha: { gte: startOfDay, lt: nextDay } },
    });
    console.log('  Result:', produccion ? 'found' : 'not found');

    console.log('4. gastos aggregate...');
    const gastos = await prisma.gasto.aggregate({
      where: { fecha: { gte: startOfDay, lt: nextDay } },
      _sum: { monto: true },
    });
    console.log('  Result:', gastos._sum.monto || 0);

    console.log('5. notas credito...');
    const notasCredito = await prisma.notaCredito.findMany({
      where: { fecha: { gte: startOfDay, lt: nextDay } },
    });
    console.log('  Result:', notasCredito.length, 'notas credito');

    console.log('6. abonos...');
    const abonos = await prisma.abono.findMany({
      where: { fecha: { gte: startOfDay, lt: nextDay } },
      include: {
        factura: { select: { numero: true, cliente: { select: { nombre: true } } } },
        pedido: { select: { id: true } },
      },
    });
    console.log('  Result:', abonos.length, 'abonos');

    console.log('7. facturas...');
    const facturas = await prisma.factura.findMany({
      where: { fecha: { gte: startOfDay, lt: nextDay } },
      include: { cliente: { select: { nombre: true } } },
    });
    console.log('  Result:', facturas.length, 'facturas');

    console.log('8. gastos groupBy...');
    const gastosDetalle = await prisma.gasto.groupBy({
      by: ['categoria'],
      where: { fecha: { gte: startOfDay, lt: nextDay } },
      _sum: { monto: true },
      _count: { id: true },
    });
    console.log('  Result:', gastosDetalle.length, 'categorias');

    console.log('9. embarques detalle...');
    const embarquesDetalle = await prisma.embarque.findMany({
      where: { fecha: { gte: startOfDay, lt: nextDay } },
      include: {
        trabajador: { select: { nombre: true } },
        ruta: { select: { nombre: true } },
      },
    });
    console.log('  Result:', embarquesDetalle.length, 'embarques');

    console.log('10. ventasPorOrigen...');
    const ventasPorOrigenRaw = await prisma.pedido.groupBy({
      by: ['origen'],
      where: { fecha: { gte: startOfDay, lt: nextDay }, estado: { notIn: [EstadoPedido.CANCELADO, EstadoPedido.ANULADO] } },
      _sum: { total: true },
      _count: { id: true },
    });
    console.log('  Result:', ventasPorOrigenRaw.length, 'origenes');

    console.log('11. descuentos...');
    const descuentos = await prisma.descuentoRepartidor.findMany({
      where: { fecha: { gte: startOfDay, lt: nextDay } },
      include: { trabajador: { select: { nombre: true } } },
    });
    console.log('  Result:', descuentos.length, 'descuentos');

    console.log('12. cierreExistente...');
    const cierreExistente = await prisma.cierreDia.findFirst({
      where: { fecha: { gte: startOfDay, lt: nextDay } },
      select: { reporte: true, horaCierre: true, netoCaja: true },
    });
    console.log('  Result:', cierreExistente ? 'found' : 'not found');

    console.log('\nAll queries completed successfully!');
  } catch (error) {
    console.error('Query failed:', (error as Error).message);
    console.error((error as Error).stack);
  } finally {
    await prisma.$disconnect();
  }
}

testCierreQueries();
