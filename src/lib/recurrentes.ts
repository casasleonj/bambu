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

function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0]
}

function estaEnSaltarFechas(saltarFechas: string[], fecha: Date): boolean {
  const fechaStr = formatDateISO(fecha)
  return saltarFechas.includes(fechaStr)
}

export interface PreviewRecurrente {
  recurrenteId: string
  clienteId: string
  clienteNombre: string
  frecuencia: string
  ultimaGeneracion: Date | null
  proximaFecha: Date
  pedidosPendientes: Array<{
    id: string
    numero: number
    total: number
    saldo: number
    cPacaAguaPed: number
    cPacaHieloPed: number
    cBotellonFabPed: number
    cBotellonDomPed: number
    cBolsaAguaPed: number
    cBolsaHieloPed: number
  }>
  cantidadBase: {
    cPacaAgua: number
    cPacaHielo: number
    cBotellonFab: number
    cBotellonDom: number
    cBolsaAgua: number
    cBolsaHielo: number
  }
  sugerencias: Array<{
    tipo: 'NORMAL' | 'CON_PENDIENTES' | 'SOLO_PENDIENTES' | 'SALTAR'
    label: string
    descripcion: string
    totalPacas: number
    totalValor: number
  }>
  saltarFechas: string[]
  debeGenerar: boolean
}

export async function previewGeneracionRecurrentes(
  fechaReferencia: Date = new Date()
): Promise<PreviewRecurrente[]> {
  const inicioDia = new Date(fechaReferencia);
  inicioDia.setHours(0, 0, 0, 0);

  const recurrentes = await prisma.pedido.findMany({
    where: {
      esRecurrente: true,
      OR: [
        { ultimaGeneracion: null },
        {
          frecuencia: { in: ["DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL"] },
          ultimaGeneracion: { lt: addDays(inicioDia, 1) },
        },
      ],
    },
    include: { cliente: true },
  });

  const previews: PreviewRecurrente[] = [];

  for (const rec of recurrentes) {
    const dias = getFrecuenciaDias(rec.frecuencia);
    if (!dias) continue;

    const ultima = rec.ultimaGeneracion || rec.fecha;
    const diasDesdeUltima = Math.floor(
      (inicioDia.getTime() - new Date(ultima).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Skip if not due yet
    if (diasDesdeUltima < dias) continue;

    // Skip if in saltarFechas
    if (estaEnSaltarFechas(rec.saltarFechas || [], inicioDia)) continue;

    // Find pending orders for this client
    const pedidosPendientesRaw = await prisma.pedido.findMany({
      where: {
        clienteId: rec.clienteId,
        estado: 'PENDIENTE',
        esRecurrente: false,
        id: { not: rec.id },
      },
      select: {
        id: true,
        numero: true,
        total: true,
        saldo: true,
        cPacaAguaPed: true,
        cPacaHieloPed: true,
        cBotellonFabPed: true,
        cBotellonDomPed: true,
        cBolsaAguaPed: true,
        cBolsaHieloPed: true,
      },
    });

    const pedidosPendientes = pedidosPendientesRaw.map((p) => ({
      ...p,
      total: Number(p.total),
      saldo: Number(p.saldo),
    }));

    const cantidadBase = {
      cPacaAgua: rec.cPacaAguaPed,
      cPacaHielo: rec.cPacaHieloPed,
      cBotellonFab: rec.cBotellonFabPed,
      cBotellonDom: rec.cBotellonDomPed,
      cBolsaAgua: rec.cBolsaAguaPed,
      cBolsaHielo: rec.cBolsaHieloPed,
    };

    const totalPacasBase = Object.values(cantidadBase).reduce((a, b) => a + b, 0);

    // Get fresh prices for base
    const items: Array<{ codigo: ProductCode; cantidad: number }> = [
      { codigo: 'PACA_AGUA', cantidad: cantidadBase.cPacaAgua },
      { codigo: 'PACA_HIELO', cantidad: cantidadBase.cPacaHielo },
      { codigo: 'BOTELLON_FAB', cantidad: cantidadBase.cBotellonFab },
      { codigo: 'BOTELLON_DOM', cantidad: cantidadBase.cBotellonDom },
      { codigo: 'BOLSA_AGUA', cantidad: cantidadBase.cBolsaAgua },
      { codigo: 'BOLSA_HIELO', cantidad: cantidadBase.cBolsaHielo },
    ];
    const preciosBase = await resolverPreciosPedido(items, (rec.canal || 'DOMICILIO') as Canal, rec.clienteId);
    const valorBase = preciosBase.reduce((sum, p) => sum + p.subtotal, 0);

    const sugerencias: PreviewRecurrente['sugerencias'] = [];

    // Option 1: Normal
    sugerencias.push({
      tipo: 'NORMAL',
      label: 'Generar normal',
      descripcion: `${totalPacasBase} pacas - $${Math.round(valorBase).toLocaleString()}`,
      totalPacas: totalPacasBase,
      totalValor: valorBase,
    });

    // Option 2: Con pendientes (if any)
    if (pedidosPendientes.length > 0) {
      const pacasPendientes = pedidosPendientes.reduce((sum, p) =>
        sum + p.cPacaAguaPed + p.cPacaHieloPed + p.cBotellonFabPed + p.cBotellonDomPed + p.cBolsaAguaPed + p.cBolsaHieloPed, 0
      );
      const totalPacasConPendientes = totalPacasBase + pacasPendientes;
      sugerencias.push({
        tipo: 'CON_PENDIENTES',
        label: 'Incluir pendientes',
        descripcion: `${totalPacasConPendientes} pacas (${totalPacasBase} + ${pacasPendientes} pendientes)`,
        totalPacas: totalPacasConPendientes,
        totalValor: valorBase + pedidosPendientes.reduce((sum, p) => sum + Number(p.total), 0),
      });

      // Option 3: Solo pendientes
      sugerencias.push({
        tipo: 'SOLO_PENDIENTES',
        label: 'Solo pendientes',
        descripcion: `Saltar recurrente, enviar solo ${pacasPendientes} pacas pendientes`,
        totalPacas: pacasPendientes,
        totalValor: pedidosPendientes.reduce((sum, p) => sum + Number(p.total), 0),
      });
    }

    // Option 4: Saltar
    sugerencias.push({
      tipo: 'SALTAR',
      label: 'Saltar esta vez',
      descripcion: 'No generar pedido esta fecha',
      totalPacas: 0,
      totalValor: 0,
    });

    previews.push({
      recurrenteId: rec.id,
      clienteId: rec.clienteId,
      clienteNombre: rec.cliente.nombre,
      frecuencia: rec.frecuencia || 'SEMANAL',
      ultimaGeneracion: rec.ultimaGeneracion,
      proximaFecha: inicioDia,
      pedidosPendientes,
      cantidadBase,
      sugerencias,
      saltarFechas: rec.saltarFechas || [],
      debeGenerar: true,
    });
  }

  return previews;
}

export interface DecisionGeneracion {
  recurrenteId: string
  decision: 'NORMAL' | 'CON_PENDIENTES' | 'SOLO_PENDIENTES' | 'SALTAR'
}

export async function generarPedidosRecurrentes(
  decisiones: DecisionGeneracion[],
  fechaReferencia: Date = new Date()
) {
  const inicioDia = new Date(fechaReferencia);
  inicioDia.setHours(0, 0, 0, 0);

  const generados: Array<{ id: string; numero: number; tipo: string }> = [];
  const saltados: string[] = [];

  for (const decision of decisiones) {
    if (decision.decision === 'SALTAR') {
      // Add today to saltarFechas
      await prisma.pedido.update({
        where: { id: decision.recurrenteId },
        data: {
          saltarFechas: { push: formatDateISO(inicioDia) },
          ultimaGeneracion: inicioDia,
        },
      });
      saltados.push(decision.recurrenteId);
      continue;
    }

    const rec = await prisma.pedido.findUnique({
      where: { id: decision.recurrenteId },
      include: { cliente: true },
    });
    if (!rec || !rec.esRecurrente) continue;

    // Resolve quantities based on decision
    let cantidades = {
      cPacaAgua: rec.cPacaAguaPed,
      cPacaHielo: rec.cPacaHieloPed,
      cBotellonFab: rec.cBotellonFabPed,
      cBotellonDom: rec.cBotellonDomPed,
      cBolsaAgua: rec.cBolsaAguaPed,
      cBolsaHielo: rec.cBolsaHieloPed,
    };

    // If SOLO_PENDIENTES, don't add recurrent quantities
    if (decision.decision === 'SOLO_PENDIENTES') {
      cantidades = { cPacaAgua: 0, cPacaHielo: 0, cBotellonFab: 0, cBotellonDom: 0, cBolsaAgua: 0, cBolsaHielo: 0 };
    }

    // Get pending orders
    const pedidosPendientes = decision.decision === 'CON_PENDIENTES' || decision.decision === 'SOLO_PENDIENTES'
      ? await prisma.pedido.findMany({
          where: {
            clienteId: rec.clienteId,
            estado: 'PENDIENTE',
            esRecurrente: false,
            id: { not: rec.id },
          },
        })
      : [];

    // If CON_PENDIENTES or SOLO_PENDIENTES, add pending quantities
    if (decision.decision === 'CON_PENDIENTES' || decision.decision === 'SOLO_PENDIENTES') {
      for (const p of pedidosPendientes) {
        cantidades.cPacaAgua += p.cPacaAguaPed;
        cantidades.cPacaHielo += p.cPacaHieloPed;
        cantidades.cBotellonFab += p.cBotellonFabPed;
        cantidades.cBotellonDom += p.cBotellonDomPed;
        cantidades.cBolsaAgua += p.cBolsaAguaPed;
        cantidades.cBolsaHielo += p.cBolsaHieloPed;
      }
    }

    // Skip if no quantities
    const totalPacas = Object.values(cantidades).reduce((a, b) => a + b, 0);
    if (totalPacas === 0) {
      // Still update ultimaGeneracion so we don't suggest again tomorrow
      await prisma.pedido.update({
        where: { id: rec.id },
        data: { ultimaGeneracion: inicioDia },
      });
      continue;
    }

    // Resolve fresh prices
    const items: Array<{ codigo: ProductCode; cantidad: number }> = [
      { codigo: 'PACA_AGUA', cantidad: cantidades.cPacaAgua },
      { codigo: 'PACA_HIELO', cantidad: cantidades.cPacaHielo },
      { codigo: 'BOTELLON_FAB', cantidad: cantidades.cBotellonFab },
      { codigo: 'BOTELLON_DOM', cantidad: cantidades.cBotellonDom },
      { codigo: 'BOLSA_AGUA', cantidad: cantidades.cBolsaAgua },
      { codigo: 'BOLSA_HIELO', cantidad: cantidades.cBolsaHielo },
    ];

    const preciosResueltos = await resolverPreciosPedido(
      items,
      (rec.canal || 'DOMICILIO') as Canal,
      rec.clienteId,
    );

    const precioMap: Record<string, number> = {};
    for (const pr of preciosResueltos) {
      precioMap[pr.codigo] = pr.precio;
    }

    const total = preciosResueltos.reduce((sum, pr) => sum + pr.subtotal, 0);

    const nuevo = await prisma.$transaction(async (tx) => {
      const creado = await tx.pedido.create({
        data: {
          clienteId: rec.clienteId,
          tipo: rec.tipo,
          canal: rec.canal || 'DOMICILIO',
          estado: "PENDIENTE",
          cPacaAguaPed: cantidades.cPacaAgua,
          cPacaHieloPed: cantidades.cPacaHielo,
          cBotellonFabPed: cantidades.cBotellonFab,
          cBotellonDomPed: cantidades.cBotellonDom,
          cBolsaAguaPed: cantidades.cBolsaAgua,
          cBolsaHieloPed: cantidades.cBolsaHielo,
          precioPacaAgua: precioMap['PACA_AGUA'] || 0,
          precioPacaHielo: precioMap['PACA_HIELO'] || 0,
          precioBotellonFab: precioMap['BOTELLON_FAB'] || 0,
          precioBotellonDom: precioMap['BOTELLON_DOM'] || 0,
          precioBolsaAgua: precioMap['BOLSA_AGUA'] || 0,
          precioBolsaHielo: precioMap['BOLSA_HIELO'] || 0,
          total,
          saldo: total,
          totalPagado: 0,
          idOrigen: rec.id,
          esRecurrente: false,
        },
      });

      const facturaNum = await getNextNumero(tx, { model: 'factura', field: 'numero' });

      await tx.factura.create({
        data: {
          numero: `FAC-${facturaNum.toString().padStart(5, "0")}`,
          clienteId: rec.clienteId,
          pedidoId: creado.id,
          subtotal: total,
          total,
          saldo: total,
        },
      });

      // Update template's last generation
      await tx.pedido.update({
        where: { id: rec.id },
        data: { ultimaGeneracion: inicioDia },
      });

      // If we included pending orders, they should be linked/updated
      // For now, just mark them as having been handled (they remain PENDIENTE until delivered)
      // In the future, we might want to cancel them and roll into this new order

      return creado;
    });

    generados.push({ id: nuevo.id, numero: nuevo.numero, tipo: decision.decision });
  }

  return { generados, saltados };
}
