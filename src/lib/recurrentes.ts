import { prisma } from "@/lib/prisma";
import { getNextNumero } from "@/lib/sequence";
import { resolverPreciosPedido, type Canal, type ProductCode } from "@/lib/pricing";
import { getDateRange } from "@/lib/dates";

type ProductosMap = {
  PACA_AGUA: number
  PACA_HIELO: number
  BOTELLON: number
  BOLSA_AGUA: number
  BOLSA_HIELO: number
}

function parseProductos(json: string): ProductosMap {
  try {
    const raw = JSON.parse(json)
    return {
      PACA_AGUA: Math.max(0, raw.PACA_AGUA ?? 0),
      PACA_HIELO: Math.max(0, raw.PACA_HIELO ?? 0),
      BOTELLON: Math.max(0, raw.BOTELLON ?? 0),
      BOLSA_AGUA: Math.max(0, raw.BOLSA_AGUA ?? 0),
      BOLSA_HIELO: Math.max(0, raw.BOLSA_HIELO ?? 0),
    }
  } catch {
    return { PACA_AGUA: 0, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0 }
  }
}

function formatDateISO(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function calcularProxGeneracion(desde: Date, cadaNDias: number): Date {
  const result = new Date(desde)
  result.setDate(result.getDate() + cadaNDias)

  const bogotaDate = new Date(result.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) + 'T00:00:00-05:00')
  bogotaDate.setHours(0, 0, 0, 0)

  // Sunday rule: shift to Monday for all frequencies
  if (bogotaDate.getDay() === 0) {
    bogotaDate.setDate(bogotaDate.getDate() + 1)
  }

  return bogotaDate
}

function productosToCantidades(p: ProductosMap, canal: string) {
  return {
    cPacaAgua: p.PACA_AGUA,
    cPacaHielo: p.PACA_HIELO,
    cBotellonFab: canal === 'PUNTO' ? p.BOTELLON : 0,
    cBotellonDom: canal === 'DOMICILIO' ? p.BOTELLON : 0,
    cBolsaAgua: p.BOLSA_AGUA,
    cBolsaHielo: p.BOLSA_HIELO,
  }
}

export function sanitizarSaltos(saltos: string[]): string[] {
  const treintaDiasAtras = formatDateISO(new Date(Date.now() - 30 * 86400000))
  const filtrados = saltos.filter(s => s >= treintaDiasAtras)
  return filtrados.slice(-365)
}

function estaEnSaltos(saltos: string[], fecha: Date): boolean {
  return saltos.includes(formatDateISO(fecha))
}

export interface PreviewRecurrente {
  recurrenteId: string
  clienteId: string
  clienteNombre: string
  cadaNDias: number
  ultimaGeneracion: Date | null
  proximaFecha: Date
  horaPreferida: string | null
  clienteBloqueado: boolean
  esDomingo: boolean
  pedidosPendientes: Array<{
    id: string
    numero: number
    total: number
    saldo: number
    totalPagado: number
    cPacaAguaPed: number
    cPacaHieloPed: number
    cBotellonFabPed: number
    cBotellonDomPed: number
    cBolsaAguaPed: number
    cBolsaHieloPed: number
  }>
  pedidosConDeuda: Array<{
    id: string
    numero: number
    total: number
    saldo: number
    totalPagado: number
    cPacaAguaPed: number
    cPacaHieloPed: number
    cBotellonFabPed: number
    cBotellonDomPed: number
    cBolsaAguaPed: number
    cBolsaHieloPed: number
  }>
  pedidosPagados: Array<{
    id: string
    numero: number
    total: number
    totalPagado: number
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
    tipo: 'NORMAL' | 'CON_PENDIENTES' | 'SOLO_PENDIENTES' | 'APLICAR_CREDITO' | 'SALTAR'
    label: string
    descripcion: string
    totalPacas: number
    totalValor: number
    disabled?: boolean
    disabledReason?: string
  }>
  saltos: string[]
  cumpleMinimo: boolean
}

export async function previewGeneracionRecurrentes(
  fechaReferencia: Date = new Date()
): Promise<PreviewRecurrente[]> {
  const { endDate } = getDateRange(
    fechaReferencia.toISOString().slice(0, 10),
    fechaReferencia.toISOString().slice(0, 10)
  )

  const lookaheadEnd = new Date(endDate)
  lookaheadEnd.setDate(lookaheadEnd.getDate() + 2)

  const plantillas = await prisma.plantillaRecurrente.findMany({
    where: {
      activo: true,
      proxGeneracion: { lte: lookaheadEnd },
    },
    include: { cliente: true, negocio: { include: { cliente: true } } },
  })

  // Batch fetch all pending orders for all clients in a single query
  const clienteIds = plantillas.map(pt => pt.clienteId).filter((id): id is string => id !== null)
  const pedidosPendientesTodos = await prisma.pedido.findMany({
    where: {
      clienteId: { in: clienteIds },
      estadoEntrega: 'PENDIENTE',
      origen: { not: 'RECURRENTE' },
    },
    select: {
      id: true,
      numero: true,
      total: true,
      saldo: true,
      totalPagado: true,
      clienteId: true,
      cPacaAguaPed: true,
      cPacaHieloPed: true,
      cBotellonFabPed: true,
      cBotellonDomPed: true,
      cBolsaAguaPed: true,
      cBolsaHieloPed: true,
    },
  })

  const pedidosPorCliente = new Map<string, typeof pedidosPendientesTodos>()
  for (const p of pedidosPendientesTodos) {
    const list = pedidosPorCliente.get(p.clienteId) || []
    list.push(p)
    pedidosPorCliente.set(p.clienteId, list)
  }

  const previews: PreviewRecurrente[] = []

  for (const pt of plantillas) {
    // Support negocio-only templates (migrated from clienteId)
    if (!pt.clienteId && !pt.negocioId) continue
    const effectiveClienteId: string = pt.clienteId ?? pt.negocio?.clienteId ?? ''
    if (!effectiveClienteId) continue
    // For blocked/inactive check, resolve the actual cliente
    const clienteForCheck = pt.cliente ?? pt.negocio?.cliente
    // A4: Blocked/inactive clients are visible in preview but with restricted options
    const clienteBloqueado = clienteForCheck?.bloqueado || !clienteForCheck?.activo

    const prox = pt.proxGeneracion!
    const fechaGen = new Date(prox)

    // A3: Sunday rule — show in preview with badge, don't skip
    const esDomingo = fechaGen.getDay() === 0

    const saltosSanitizados = sanitizarSaltos(pt.saltos || [])
    if (estaEnSaltos(saltosSanitizados, fechaGen)) continue

    const productos = parseProductos(pt.productos)
    const cantidadBase = productosToCantidades(productos, pt.canal)

    const pedidosPendientesRaw = pedidosPorCliente.get(effectiveClienteId) || []
    const pedidosPendientes = pedidosPendientesRaw.map(p => ({
      ...p,
      total: Number(p.total),
      saldo: Number(p.saldo),
      totalPagado: Number(p.totalPagado),
    }))

    // Separar pedidos pendientes en con deuda vs pagados
    const pedidosConDeuda = pedidosPendientes.filter(p => Number(p.saldo) > 0)
    const pedidosPagados = pedidosPendientes.filter(p => Number(p.saldo) === 0 && Number(p.totalPagado) > 0)

    const totalDeuda = pedidosConDeuda.reduce((sum, p) => sum + Number(p.saldo), 0)
    const totalCredito = pedidosPagados.reduce((sum, p) => sum + Number(p.totalPagado), 0)

    const totalPacasBase = Object.values(cantidadBase).reduce((a, b) => a + b, 0)

    const items: Array<{ codigo: ProductCode; cantidad: number }> = [
      { codigo: 'PACA_AGUA', cantidad: cantidadBase.cPacaAgua },
      { codigo: 'PACA_HIELO', cantidad: cantidadBase.cPacaHielo },
      { codigo: 'BOTELLON', cantidad: cantidadBase.cBotellonFab + cantidadBase.cBotellonDom },
      { codigo: 'BOLSA_AGUA', cantidad: cantidadBase.cBolsaAgua },
      { codigo: 'BOLSA_HIELO', cantidad: cantidadBase.cBolsaHielo },
    ]
    const preciosBase = await resolverPreciosPedido(items, pt.canal as Canal, effectiveClienteId, pt.negocioId)
    const valorBase = preciosBase.reduce((sum, p) => sum + p.subtotal, 0)

    const sugerencias: PreviewRecurrente['sugerencias'] = []

    if (clienteBloqueado) {
      // A4: Blocked client — only SALTAR option, don't advance date automatically
      sugerencias.push({
        tipo: 'SALTAR',
        label: 'Cliente bloqueado',
        descripcion: clienteForCheck?.bloqueado ? 'Cliente bloqueado por deuda' : 'Cliente inactivo',
        totalPacas: 0,
        totalValor: 0,
        disabled: false,
        disabledReason: undefined,
      })
    } else if (esDomingo) {
      // A3: Sunday — show in preview with badge, only SALTAR option
      const lunes = addDays(fechaGen, 1)
      sugerencias.push({
        tipo: 'SALTAR',
        label: 'Domingo → Lunes',
        descripcion: `Cae en domingo. Se pospondrá al ${formatDateISO(lunes)}`,
        totalPacas: 0,
        totalValor: 0,
        disabled: false,
        disabledReason: undefined,
      })
    } else {
      // Normal flow
      const cumpleMinimo = totalPacasBase >= 3
      sugerencias.push({
        tipo: 'NORMAL',
        label: 'Generar normal',
        descripcion: `${totalPacasBase} pacas - $${Math.round(valorBase).toLocaleString()}`,
        totalPacas: totalPacasBase,
        totalValor: valorBase,
        disabled: !cumpleMinimo,
        disabledReason: !cumpleMinimo ? 'Mínimo 3 productos por entrega' : undefined,
      })

      if (pedidosPendientes.length > 0) {
        const pacasPendientes = pedidosPendientes.reduce((sum, p) =>
          sum + p.cPacaAguaPed + p.cPacaHieloPed + p.cBotellonFabPed + p.cBotellonDomPed + p.cBolsaAguaPed + p.cBolsaHieloPed, 0
        )
        const totalPacasConPendientes = totalPacasBase + pacasPendientes
        const totalPagadoPendientes = pedidosPendientes.reduce((sum, p) => sum + Number(p.totalPagado), 0)
        const saldoPendientes = pedidosPendientes.reduce((sum, p) => sum + Number(p.saldo), 0)

        // Bloquear CON_PENDIENTES/SOLO_PENDIENTES solo si hay DEUDA real
        const disabled = pedidosConDeuda.length > 0
        const disabledReason = disabled
          ? `Pendientes con deuda: $${Math.round(totalDeuda).toLocaleString()}`
          : undefined

        const pagadoLabel = totalPagadoPendientes > 0 ? `, $${Math.round(totalPagadoPendientes).toLocaleString()} ya pagado` : ''

        sugerencias.push({
          tipo: 'CON_PENDIENTES',
          label: 'Incluir pendientes',
          descripcion: `${totalPacasConPendientes} pacas (${totalPacasBase} + ${pacasPendientes} pendientes${pagadoLabel})`,
          totalPacas: totalPacasConPendientes,
          totalValor: valorBase + saldoPendientes,
          disabled,
          disabledReason,
        })

        sugerencias.push({
          tipo: 'SOLO_PENDIENTES',
          label: 'Solo pendientes',
          descripcion: `Saltar recurrente, enviar solo ${pacasPendientes} pacas pendientes${pagadoLabel}`,
          totalPacas: pacasPendientes,
          totalValor: saldoPendientes,
          disabled,
          disabledReason,
        })

        // APLICAR_CREDITO: solo si hay pedidos pagados y NO hay deuda
        if (pedidosPagados.length > 0 && pedidosConDeuda.length === 0) {
          sugerencias.push({
            tipo: 'APLICAR_CREDITO',
            label: 'Aplicar crédito',
            descripcion: `${totalPacasBase} pacas - $${Math.round(valorBase - totalCredito).toLocaleString()} (descuento $${Math.round(totalCredito).toLocaleString()})`,
            totalPacas: totalPacasBase,
            totalValor: valorBase - totalCredito,
            disabled: false,
          })
        }
      }

      sugerencias.push({
        tipo: 'SALTAR',
        label: 'Saltar esta vez',
        descripcion: 'No generar pedido esta fecha',
        totalPacas: 0,
        totalValor: 0,
      })
    }

    previews.push({
      recurrenteId: pt.id,
      clienteId: effectiveClienteId,
      clienteNombre: clienteForCheck?.nombre ?? 'Sin nombre',
      cadaNDias: pt.cadaNDias,
      ultimaGeneracion: pt.ultimaGeneracion,
      proximaFecha: fechaGen,
      horaPreferida: pt.horaPreferida,
      clienteBloqueado,
      esDomingo,
      pedidosPendientes,
      pedidosConDeuda,
      pedidosPagados,
      cantidadBase,
      sugerencias,
      saltos: saltosSanitizados,
      cumpleMinimo: totalPacasBase >= 3,
    })
  }

  return previews
}


export interface DecisionGeneracion {
  recurrenteId: string
  decision: 'NORMAL' | 'CON_PENDIENTES' | 'SOLO_PENDIENTES' | 'APLICAR_CREDITO' | 'SALTAR'
}

export async function generarPedidosRecurrentes(
  decisiones: DecisionGeneracion[],
  _fechaReferencia: Date = new Date()
) {
  const generados: Array<{ id: string; numero: number; tipo: string }> = []
  const saltados: string[] = []

  for (const decision of decisiones) {
    const pt = await prisma.plantillaRecurrente.findUnique({
      where: { id: decision.recurrenteId },
      include: { cliente: true, negocio: { include: { cliente: true } } },
    })
    if (!pt || !pt.activo) continue
    // Support negocio-only templates (migrated from clienteId)
    if (!pt.clienteId && !pt.negocioId) continue
    const effectiveClienteId: string = pt.clienteId ?? pt.negocio?.clienteId ?? ''
    if (!effectiveClienteId) continue
    const clienteForCheck = pt.cliente ?? pt.negocio?.cliente
    if (!clienteForCheck) continue

    // Auto-fix Sunday: if proxGeneracion lands on Sunday, shift to Monday
    let prox = pt.proxGeneracion!
    if (prox.getDay() === 0) {
      const lunes = calcularProxGeneracion(prox, 1)
      await prisma.plantillaRecurrente.update({
        where: { id: pt.id },
        data: { proxGeneracion: lunes },
      })
      saltados.push(pt.id)
      continue
    }

    if (clienteForCheck.bloqueado || !clienteForCheck.activo) {
      await prisma.plantillaRecurrente.update({
        where: { id: pt.id },
        data: {
          ultimaGeneracion: prox,
          proxGeneracion: calcularProxGeneracion(prox, pt.cadaNDias),
        },
      })
      continue
    }

    // Verificar limite de fiados (se re-verifica dentro de la transacción para evitar race conditions)
    const limite = clienteForCheck.limitePedidosFiados ?? 3

    const pedidosPendientesCount = await prisma.pedido.count({
      where: {
        clienteId: effectiveClienteId,
        estadoEntrega: { notIn: ['ANULADO', 'CANCELADO'] },
        estadoPago: { notIn: ['PAGADO', 'ANTICIPADO', 'ANULADO'] },
      },
    })

    if (pedidosPendientesCount >= limite) {
      await prisma.plantillaRecurrente.update({
        where: { id: pt.id },
        data: {
          ultimaGeneracion: prox,
          proxGeneracion: calcularProxGeneracion(prox, pt.cadaNDias),
        },
      })
      continue
    }

    if (decision.decision === 'SALTAR') {
      const saltosActualizados = sanitizarSaltos([
        ...(pt.saltos || []),
        formatDateISO(prox),
      ])
      await prisma.plantillaRecurrente.update({
        where: { id: pt.id },
        data: {
          saltos: saltosActualizados,
          ultimaGeneracion: prox,
          proxGeneracion: calcularProxGeneracion(prox, pt.cadaNDias),
        },
      })
      saltados.push(pt.id)
      continue
    }

    const productos = parseProductos(pt.productos)
    let cantidades = productosToCantidades(productos, pt.canal)

    if (decision.decision === 'SOLO_PENDIENTES' || decision.decision === 'APLICAR_CREDITO') {
      cantidades = { cPacaAgua: 0, cPacaHielo: 0, cBotellonFab: 0, cBotellonDom: 0, cBolsaAgua: 0, cBolsaHielo: 0 }
    }

    const pedidosPendientes = decision.decision === 'CON_PENDIENTES' || decision.decision === 'SOLO_PENDIENTES' || decision.decision === 'APLICAR_CREDITO'
      ? await prisma.pedido.findMany({
          where: {
        clienteId: effectiveClienteId,
            estadoEntrega: 'PENDIENTE',
            origen: { not: 'RECURRENTE' },
          },
        })
      : []

    // Separar pedidos con deuda vs pagados
    const pedidosConDeuda = pedidosPendientes.filter(p => Number(p.saldo) > 0)
    const pedidosPagados = pedidosPendientes.filter(p => Number(p.saldo) === 0 && Number(p.totalPagado) > 0)

    // Block CON_PENDIENTES/SOLO_PENDIENTES if any pending order has debt
    if ((decision.decision === 'CON_PENDIENTES' || decision.decision === 'SOLO_PENDIENTES') && pedidosConDeuda.length > 0) {
      await prisma.plantillaRecurrente.update({
        where: { id: pt.id },
        data: {
          ultimaGeneracion: prox,
          proxGeneracion: calcularProxGeneracion(prox, pt.cadaNDias),
        },
      })
      saltados.push(pt.id)
      continue
    }

    // Block APLICAR_CREDITO if there is debt or no paid orders
    if (decision.decision === 'APLICAR_CREDITO' && (pedidosConDeuda.length > 0 || pedidosPagados.length === 0)) {
      await prisma.plantillaRecurrente.update({
        where: { id: pt.id },
        data: {
          ultimaGeneracion: prox,
          proxGeneracion: calcularProxGeneracion(prox, pt.cadaNDias),
        },
      })
      saltados.push(pt.id)
      continue
    }

    if (decision.decision === 'CON_PENDIENTES' || decision.decision === 'SOLO_PENDIENTES') {
      for (const p of pedidosPendientes) {
        cantidades.cPacaAgua += p.cPacaAguaPed
        cantidades.cPacaHielo += p.cPacaHieloPed
        cantidades.cBotellonFab += p.cBotellonFabPed
        cantidades.cBotellonDom += p.cBotellonDomPed
        cantidades.cBolsaAgua += p.cBolsaAguaPed
        cantidades.cBolsaHielo += p.cBolsaHieloPed
      }
    }

    // APLICAR_CREDITO: sumar solo los pedidos pagados (no todos los pendientes)
    if (decision.decision === 'APLICAR_CREDITO') {
      for (const p of pedidosPagados) {
        cantidades.cPacaAgua += p.cPacaAguaPed
        cantidades.cPacaHielo += p.cPacaHieloPed
        cantidades.cBotellonFab += p.cBotellonFabPed
        cantidades.cBotellonDom += p.cBotellonDomPed
        cantidades.cBolsaAgua += p.cBolsaAguaPed
        cantidades.cBolsaHielo += p.cBolsaHieloPed
      }
    }

    const totalPacas = Object.values(cantidades).reduce((a, b) => a + b, 0)
    if (totalPacas < 3) {
      await prisma.plantillaRecurrente.update({
        where: { id: pt.id },
        data: {
          ultimaGeneracion: pt.proxGeneracion,
          proxGeneracion: calcularProxGeneracion(pt.proxGeneracion!, pt.cadaNDias),
        },
      })
      continue
    }

    const items: Array<{ codigo: ProductCode; cantidad: number }> = [
      { codigo: 'PACA_AGUA', cantidad: cantidades.cPacaAgua },
      { codigo: 'PACA_HIELO', cantidad: cantidades.cPacaHielo },
      { codigo: 'BOTELLON', cantidad: cantidades.cBotellonFab + cantidades.cBotellonDom },
      { codigo: 'BOLSA_AGUA', cantidad: cantidades.cBolsaAgua },
      { codigo: 'BOLSA_HIELO', cantidad: cantidades.cBolsaHielo },
    ]

    const preciosResueltos = await resolverPreciosPedido(
      items,
      pt.canal as Canal,
      effectiveClienteId,
      pt.negocioId,
    )

    const precioMap: Record<string, number> = {}
    const precioOrigenMap: Record<string, string> = {}
    for (const pr of preciosResueltos) {
      precioMap[pr.codigo] = pr.precio
      precioOrigenMap[pr.codigo] = pr.origen
    }

    const total = preciosResueltos.reduce((sum, pr) => sum + pr.subtotal, 0)

    // Calcular crédito total si es APLICAR_CREDITO
    const totalCredito = decision.decision === 'APLICAR_CREDITO'
      ? pedidosPagados.reduce((sum, p) => sum + Number(p.totalPagado), 0)
      : 0

    const nuevo = await prisma.$transaction(async (tx) => {
      // Re-check clienteId within transaction (TypeScript narrowing)
      const clienteId = effectiveClienteId
      if (!clienteId) return null

      // Re-verificar limite de fiados dentro de la transacción para evitar race conditions
      const pedidosPendientesTx = await tx.pedido.findMany({
        where: {
          clienteId,
          estadoEntrega: { notIn: ['ANULADO', 'CANCELADO'] },
          estadoPago: { notIn: ['PAGADO', 'ANTICIPADO', 'ANULADO'] },
        },
        select: { id: true, numero: true, saldo: true },
      })

      let limiteTx = clienteForCheck.limitePedidosFiados ?? 3
      if (clienteForCheck.limitePedidosFiados == null) {
        const configLimite = await tx.config.findUnique({ where: { clave: 'LIMITE_PEDIDOS_FIADOS_DEFAULT' } })
        if (configLimite) {
          const parsed = parseInt(configLimite.valor, 10)
          if (!isNaN(parsed)) limiteTx = parsed
        }
      }

      if (pedidosPendientesTx.length >= limiteTx) {
        await tx.plantillaRecurrente.update({
          where: { id: pt.id },
          data: {
            ultimaGeneracion: prox,
            proxGeneracion: calcularProxGeneracion(prox, pt.cadaNDias),
          },
        })
        return null
      }

      const creado = await tx.pedido.create({
        data: {
          clienteId,
          negocioId: pt.negocioId,
          tipo: pt.tipo,
          canal: pt.canal,
          origen: 'RECURRENTE',
          estadoEntrega: 'PENDIENTE',
          estadoPago: 'PENDIENTE',
          cPacaAguaPed: cantidades.cPacaAgua,
          cPacaHieloPed: cantidades.cPacaHielo,
          cBotellonFabPed: cantidades.cBotellonFab,
          cBotellonDomPed: cantidades.cBotellonDom,
          cBolsaAguaPed: cantidades.cBolsaAgua,
          cBolsaHieloPed: cantidades.cBolsaHielo,
          precioPacaAgua: precioMap['PACA_AGUA'] || 0,
          precioPacaHielo: precioMap['PACA_HIELO'] || 0,
          precioBotellonFab: pt.canal === 'PUNTO' ? (precioMap['BOTELLON'] || 0) : 0,
          precioBotellonDom: pt.canal === 'DOMICILIO' ? (precioMap['BOTELLON'] || 0) : 0,
          precioBolsaAgua: precioMap['BOLSA_AGUA'] || 0,
          precioBolsaHielo: precioMap['BOLSA_HIELO'] || 0,
          total,
          saldo: total - totalCredito,
          totalPagado: totalCredito,
          obs: totalCredito > 0
            ? `Crédito de $${totalCredito.toLocaleString()} aplicado de pedidos: ${pedidosPagados.map(p => '#' + p.numero).join(', ')}`
            : undefined,
          idOrigen: pt.id,
          horaPreferida: pt.horaPreferida,
          items: {
            create: items
              .filter(item => item.cantidad > 0)
              .map(item => ({
                producto: item.codigo,
                cantPedido: item.cantidad,
                cantEntrega: 0,
                precio: precioMap[item.codigo] || 0,
                subtotal: (precioMap[item.codigo] || 0) * item.cantidad,
                precioOrigen: precioOrigenMap[item.codigo] || 'base',
              }))
          },
        },
      })

      const facturaNum = await getNextNumero(tx, { model: 'factura', field: 'numero' })

      await tx.factura.create({
        data: {
          numero: `FAC-${facturaNum.toString().padStart(5, "0")}`,
          clienteId,
          pedidoId: creado.id,
          subtotal: total,
          total,
          saldo: total - totalCredito,
        },
      })

      await tx.plantillaRecurrente.update({
        where: { id: pt.id },
        data: {
          ultimaGeneracion: prox,
          proxGeneracion: calcularProxGeneracion(prox, pt.cadaNDias),
        },
      })

      if (decision.decision === 'CON_PENDIENTES' || decision.decision === 'SOLO_PENDIENTES') {
        for (const p of pedidosPendientes) {
          await tx.pedido.update({
            where: { id: p.id },
            data: {
              estadoEntrega: 'CANCELADO',
              estado: 'CANCELADO',
            },
          })

          const ncNumero = await getNextNumero(tx, { model: 'notaCredito', field: 'numero' })

          await tx.notaCredito.create({
            data: {
              numero: `NC-${ncNumero.toString().padStart(5, '0')}`,
              pedidoId: p.id,
              monto: p.saldo,
              motivo: `Consolidado en pedido recurrente #${creado.numero}`,
            },
          })
        }
      }

      // APLICAR_CREDITO: marcar pedidos pagados como ENTREGADO (no CANCELADO)
      if (decision.decision === 'APLICAR_CREDITO') {
        for (const p of pedidosPagados) {
          await tx.pedido.update({
            where: { id: p.id },
            data: {
              estadoEntrega: 'ENTREGADO',
              estado: 'ENTREGADO',
              fechaEntrega: new Date(),
            },
          })

          // Actualizar items del pedido viejo: cantEntrega = cantPedido
          const itemsViejo = await tx.pedidoItem.findMany({
            where: { pedidoId: p.id },
          })
          for (const item of itemsViejo) {
            await tx.pedidoItem.update({
              where: { id: item.id },
              data: { cantEntrega: item.cantPedido },
            })
          }
        }
      }

      return creado
    })

    if (!nuevo) continue

    generados.push({ id: nuevo.id, numero: nuevo.numero, tipo: decision.decision })
  }

  return { generados, saltados }
}
