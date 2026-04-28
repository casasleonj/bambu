import { prisma } from "@/lib/prisma";
import { getNextNumero } from "@/lib/sequence";
import { resolverPreciosPedido, type Canal, type ProductCode } from "@/lib/pricing";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getFrecuenciaDias(frecuencia: string | null): number | null {
  switch (frecuencia) {
    case "DIARIO": return 1;
    case "SEMANAL": return 7;
    case "QUINCENAL": return 15;
    case "MENSUAL": return 30;
    default: return null;
  }
}

export async function generarPedidosRecurrentes(fechaReferencia: Date = new Date()) {
  const inicioDia = new Date(fechaReferencia);
  inicioDia.setHours(0, 0, 0, 0);

  const recurrentes = await prisma.pedido.findMany({
    where: {
      esRecurrente: true,
      OR: [
        { ultimaGeneracion: null },
        {
          frecuencia: { in: ["DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL"] },
          ultimaGeneracion: { lt: inicioDia },
        },
      ],
    },
    include: { cliente: true },
  });

  const generados = [];

  for (const pedido of recurrentes) {
    const dias = getFrecuenciaDias(pedido.frecuencia);
    if (!dias) continue;

    const ultima = pedido.ultimaGeneracion || pedido.fecha;
    const diasDesdeUltima = Math.floor(
      (inicioDia.getTime() - new Date(ultima).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diasDesdeUltima < dias) continue;

    // Resolve fresh prices using the pricing engine
    const items: Array<{ codigo: ProductCode; cantidad: number }> = [
      { codigo: 'PACA_AGUA', cantidad: pedido.cPacaAguaPed },
      { codigo: 'PACA_HIELO', cantidad: pedido.cPacaHieloPed },
      { codigo: 'BOTELLON_FAB', cantidad: pedido.cBotellonFabPed },
      { codigo: 'BOTELLON_DOM', cantidad: pedido.cBotellonDomPed },
      { codigo: 'BOLSA_AGUA', cantidad: pedido.cBolsaAguaPed },
      { codigo: 'BOLSA_HIELO', cantidad: pedido.cBolsaHieloPed },
    ];

    const preciosResueltos = await resolverPreciosPedido(
      items,
      (pedido.canal || 'DOMICILIO') as Canal,
      pedido.clienteId,
    );

    const precioMap: Record<string, number> = {};
    for (const pr of preciosResueltos) {
      precioMap[pr.codigo] = pr.precio;
    }

    const total = preciosResueltos.reduce((sum, pr) => sum + pr.subtotal, 0);

    const nuevo = await prisma.$transaction(async (tx) => {
      const numero = await getNextNumero(tx, { seqName: 'pedido_numero_seq', model: 'pedido' });

      const creado = await tx.pedido.create({
        data: {
          numero,
          clienteId: pedido.clienteId,
          tipo: pedido.tipo,
          canal: pedido.canal || 'DOMICILIO',
          estado: "PENDIENTE",
          cPacaAguaPed: pedido.cPacaAguaPed,
          cPacaHieloPed: pedido.cPacaHieloPed,
          cBotellonFabPed: pedido.cBotellonFabPed,
          cBotellonDomPed: pedido.cBotellonDomPed,
          cBolsaAguaPed: pedido.cBolsaAguaPed,
          cBolsaHieloPed: pedido.cBolsaHieloPed,
          precioPacaAgua: precioMap['PACA_AGUA'] || 0,
          precioPacaHielo: precioMap['PACA_HIELO'] || 0,
          precioBotellonFab: precioMap['BOTELLON_FAB'] || 0,
          precioBotellonDom: precioMap['BOTELLON_DOM'] || 0,
          precioBolsaAgua: precioMap['BOLSA_AGUA'] || 0,
          precioBolsaHielo: precioMap['BOLSA_HIELO'] || 0,
          total,
          saldo: total,
          totalPagado: 0,
          idOrigen: pedido.id,
          esRecurrente: false,
        },
      });

      const facturaNum = await getNextNumero(tx, { seqName: 'factura_numero_seq', model: 'factura' });

      await tx.factura.create({
        data: {
          numero: `FAC-${facturaNum.toString().padStart(5, "0")}`,
          clienteId: pedido.clienteId,
          pedidoId: creado.id,
          subtotal: total,
          total,
          saldo: total,
        },
      });

      await tx.pedido.update({
        where: { id: pedido.id },
        data: { ultimaGeneracion: new Date() },
      });

      return creado;
    });

    generados.push(nuevo);
  }

  return generados;
}
