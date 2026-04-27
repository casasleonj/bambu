import { prisma } from "@/lib/prisma";

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
          frecuencia: "DIARIO",
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

    const nuevo = await prisma.$transaction(async (tx) => {
      const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('pedido_numero_seq')
      `;
      const numero = Number(nextval);

      const creado = await tx.pedido.create({
        data: {
          numero,
          clienteId: pedido.clienteId,
          tipo: pedido.tipo,
          estado: "PENDIENTE",
          cAguaPed: pedido.cAguaPed,
          cHieloPed: pedido.cHieloPed,
          cBotellonPed: pedido.cBotellonPed,
          cBolsaAguaPed: pedido.cBolsaAguaPed,
          cBolsaHieloPed: pedido.cBolsaHieloPed,
          precioAgua: pedido.precioAgua,
          precioHielo: pedido.precioHielo,
          precioBotellon: pedido.precioBotellon,
          precioBolsaAgua: pedido.precioBolsaAgua,
          precioBolsaHielo: pedido.precioBolsaHielo,
          total: pedido.total,
          saldo: pedido.total,
          totalPagado: 0,
          idOrigen: pedido.id,
          esRecurrente: false,
        },
      });

      const [{ nextval: facturaNext }] = await tx.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('factura_numero_seq')
      `;
      const facturaNum = Number(facturaNext);

      await tx.factura.create({
        data: {
          numero: `FAC-${facturaNum.toString().padStart(5, "0")}`,
          clienteId: pedido.clienteId,
          pedidoId: creado.id,
          subtotal: pedido.total,
          total: pedido.total,
          saldo: pedido.total,
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
