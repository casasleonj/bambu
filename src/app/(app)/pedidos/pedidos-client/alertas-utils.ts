import { formatCurrency } from '@/lib/utils'
import type { Pedido as PedidoPedidos } from './types'
import type { AlertaItem, AlertaRow, AlertaTipo, SeveridadAlerta } from '@/lib/alertas-config'
import { estaIgnorada } from '@/lib/alertas-config'

export type { AlertaItem, AlertaRow, AlertaTipo, SeveridadAlerta }
export { REGLAS_ALERTAS, getGuiaAlerta } from '@/lib/alertas-config'

interface PedidoBase {
  id: string
  numero: number
  clienteId?: string
  nombreCli?: string
  telefonoCli?: string
  fecha: string
  total: number | string
  saldo: number | string
  estadoEntrega: string
  estadoPago: string
  disputaAbierta?: boolean
  promesaPagoFecha?: string
  items?: Array<{ producto: string; cantPedido: number; precio: number }>
  cPacaAguaPed: number
  cPacaHieloPed: number
  cBotellonFabPed: number
  cBotellonDomPed: number
  cBolsaAguaPed: number
  cBolsaHieloPed: number
  precioPacaAgua: number
  precioPacaHielo: number
  precioBotellonFab: number
  precioBotellonDom: number
  precioBolsaAgua: number
  precioBolsaHielo: number
}

const SEVERIDAD_ORDER = { ALTA: 3, MEDIA: 2, BAJA: 1 }

export function calcularAlertas(pedidos: PedidoPedidos[], clienteIdIgnorar?: string): AlertaRow[] {
  const clientesMap = new Map<string, AlertaRow>()
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

  // Promedio por cliente (excluyendo anulados/cancelados)
  const promedioPorCliente = new Map<string, number>()
  const conteoPorCliente = new Map<string, number>()
  pedidos.forEach((p) => {
    if (p.estadoEntrega !== 'ANULADO' && p.estadoEntrega !== 'CANCELADO') {
      const actual = promedioPorCliente.get(p.clienteId) || 0
      promedioPorCliente.set(p.clienteId, actual + Number(p.total))
      const count = conteoPorCliente.get(p.clienteId) || 0
      conteoPorCliente.set(p.clienteId, count + 1)
    }
  })
  promedioPorCliente.forEach((total, clienteId) => {
    const count = conteoPorCliente.get(clienteId) || 1
    promedioPorCliente.set(clienteId, total / count)
  })

  // Último precio por producto por cliente (para CAMBIO_PRECIO_BRUSCO)
  const ultimoPrecioPorClienteProducto = new Map<string, Map<string, number>>()
  pedidos
    .filter((p) => p.estadoEntrega === 'ENTREGADO')
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
    .forEach((p) => {
      const map = ultimoPrecioPorClienteProducto.get(p.clienteId) || new Map<string, number>()
      const items = p.items && p.items.length > 0 ? p.items : legacyItems(p)
      items.forEach((item) => {
        if (item.cantPedido > 0 && item.precio > 0) {
          map.set(item.producto, item.precio)
        }
      })
      ultimoPrecioPorClienteProducto.set(p.clienteId, map)
    })

  pedidos.forEach((p) => {
    const alertas: AlertaItem[] = []
    const fechaColombia = p.fecha
      ? new Date(p.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
      : ''

    // 1. 2do+ pedido hoy
    if (fechaColombia === hoy) {
      const pedidosHoy = pedidos.filter((p2) => {
        const fecha2 = p2.fecha
          ? new Date(p2.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
          : ''
        return p2.clienteId === p.clienteId && fecha2 === hoy
      })
      if (pedidosHoy.length >= 3) {
        alertas.push({
          tipo: '3RO_PEDIDO',
          severidad: 'MEDIA',
          detalle: `${pedidosHoy.length} pedidos hoy`,
          fecha: p.fecha,
          pedidoId: p.id,
        })
      } else if (pedidosHoy.length === 2) {
        alertas.push({
          tipo: '2DO_PEDIDO',
          severidad: 'BAJA',
          detalle: '2do pedido hoy',
          fecha: p.fecha,
          pedidoId: p.id,
        })
      }

      // 18. Múltiples pedidos muy seguidos (< 1h)
      const horas = pedidosHoy
        .map((ph) => new Date(ph.fecha).getTime())
        .sort((a, b) => a - b)
      for (let i = 1; i < horas.length; i++) {
        const diffMin = (horas[i] - horas[i - 1]) / (1000 * 60)
        if (diffMin < 60) {
          alertas.push({
            tipo: 'MULTIPLES_PEDIDOS_RAPIDO',
            severidad: 'MEDIA',
            detalle: `2 pedidos a ${Math.round(diffMin)} min de diferencia`,
            fecha: p.fecha,
            pedidoId: p.id,
          })
          break
        }
      }
    }

    // 2. Monto anómalo (>2x promedio personal)
    const promedio = promedioPorCliente.get(p.clienteId) || 0
    if (promedio > 0 && Number(p.total) > promedio * 2) {
      alertas.push({
        tipo: 'MONTO_ANOMALO',
        severidad: 'ALTA',
        detalle: `${formatCurrency(Number(p.total))} (promedio: ${formatCurrency(promedio)})`,
        fecha: p.fecha,
        pedidoId: p.id,
      })
    }

    // 3. Fiado recurrente (2+ pedidos con saldo en 7 días)
    const hace7Dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const fiadosRecientes = pedidos.filter(
      (p2) =>
        p2.clienteId === p.clienteId &&
        Number(p2.saldo) > 0 &&
        p2.fecha >= hace7Dias
    )
    if (fiadosRecientes.length >= 2) {
      alertas.push({
        tipo: 'FIADO_REcurrente',
        severidad: 'MEDIA',
        detalle: `${fiadosRecientes.length} pedidos fiados en 7 días`,
        fecha: p.fecha,
      })
    }

    // 4. Cliente bloqueado (estadoPago VENCIDO)
    if (p.estadoPago === 'VENCIDO') {
      alertas.push({
        tipo: 'CLIENTE_BLOQUEADO',
        severidad: 'ALTA',
        detalle: 'Promesa de pago vencida',
        fecha: p.fecha,
        pedidoId: p.id,
      })
    }

    // 6. Disputa abierta
    if (p.disputaAbierta) {
      alertas.push({
        tipo: 'DISPUTA_ABIERTA',
        severidad: 'ALTA',
        detalle: `Pedido #${p.numero} con disputa abierta`,
        fecha: p.fecha,
        pedidoId: p.id,
      })
    }

    // 9. Promesa próxima a vencer
    if (p.promesaPagoFecha && p.estadoPago !== 'PAGADO' && p.estadoPago !== 'ANTICIPADO' && p.estadoPago !== 'ANULADO') {
      const promesa = new Date(p.promesaPagoFecha)
      const diffMs = promesa.getTime() - Date.now()
      const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      if (diffDias <= 2 && diffDias >= -1) {
        alertas.push({
          tipo: 'PROMESA_PROXIMA_VENCER',
          severidad: 'MEDIA',
          detalle: diffDias >= 0 ? `Vence en ${diffDias} días` : `Venció hace ${Math.abs(diffDias)} días`,
          fecha: p.promesaPagoFecha,
          pedidoId: p.id,
        })
      }
    }

    // 10. NO_ENTREGADO repetido (se calcula por cliente, no por pedido)
    // Se maneja abajo en post-proceso

    // 15. Precio por debajo de tabla / 19. Cambio precio brusco
    const items = p.items && p.items.length > 0 ? p.items : legacyItems(p)
    items.forEach((item) => {
      if (item.cantPedido > 0 && item.precio > 0) {
        const ultPrecioMap = ultimoPrecioPorClienteProducto.get(p.clienteId)
        const ultPrecio = ultPrecioMap?.get(item.producto)
        if (ultPrecio && ultPrecio > 0) {
          const variacion = Math.abs(item.precio - ultPrecio) / ultPrecio
          if (variacion > 0.3) {
            alertas.push({
              tipo: 'CAMBIO_PRECIO_BRUSCO',
              severidad: 'ALTA',
              detalle: `${item.producto}: ${formatCurrency(item.precio)} vs ${formatCurrency(ultPrecio)}`,
              fecha: p.fecha,
              pedidoId: p.id,
            })
          }
        }
      }
    })

    if (alertas.length > 0) {
      const existing = clientesMap.get(p.clienteId)
      if (existing) {
        existing.alertas.push(...alertas)
      } else {
        clientesMap.set(p.clienteId, {
          clienteId: p.clienteId,
          nombreCli: p.nombreCli,
          telefonoCli: p.telefonoCli,
          alertas,
          severidadMasAlta: 'BAJA',
        })
      }
    }
  })

  // Post-proceso: NO_ENTREGADO repetido por cliente
  const hace30Dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const noEntregadosPorCliente = new Map<string, PedidoPedidos[]>()
  pedidos
    .filter((p) => p.estadoEntrega === 'NO_ENTREGADO' && p.fecha >= hace30Dias)
    .forEach((p) => {
      const arr = noEntregadosPorCliente.get(p.clienteId) || []
      arr.push(p)
      noEntregadosPorCliente.set(p.clienteId, arr)
    })
  noEntregadosPorCliente.forEach((arr, clienteId) => {
    if (arr.length >= 2) {
      const row = clientesMap.get(clienteId)
      const alerta: AlertaItem = {
        tipo: 'NO_ENTREGADO_REPETIDO',
        severidad: 'MEDIA',
        detalle: `${arr.length} entregas fallidas en 30 días`,
        fecha: arr[0].fecha,
      }
      if (row) {
        row.alertas.push(alerta)
      } else {
        clientesMap.set(clienteId, {
          clienteId,
          nombreCli: arr[0].nombreCli,
          telefonoCli: arr[0].telefonoCli,
          alertas: [alerta],
          severidadMasAlta: 'BAJA',
        })
      }
    }
  })

  // Calcular severidadMasAlta y filtrar ignoradas
  clientesMap.forEach((row) => {
    row.severidadMasAlta = row.alertas.reduce<SeveridadAlerta>((max, a) =>
      SEVERIDAD_ORDER[a.severidad] > SEVERIDAD_ORDER[max] ? a.severidad : max,
      'BAJA'
    )
    if (clienteIdIgnorar) {
      row.alertas = row.alertas.filter((a) => a.severidad === 'ALTA' || !estaIgnorada(clienteIdIgnorar, a.tipo))
    }
  })

  return Array.from(clientesMap.values()).filter((r) => r.alertas.length > 0)
}

function legacyItems(p: PedidoPedidos) {
  const items: Array<{ producto: string; cantPedido: number; precio: number }> = []
  if (p.cPacaAguaPed > 0) items.push({ producto: 'PACA_AGUA', cantPedido: p.cPacaAguaPed, precio: p.precioPacaAgua })
  if (p.cPacaHieloPed > 0) items.push({ producto: 'PACA_HIELO', cantPedido: p.cPacaHieloPed, precio: p.precioPacaHielo })
  const botellonTotal = (p.cBotellonFabPed || 0) + (p.cBotellonDomPed || 0)
  const botellonPrecio = Number(p.precioBotellonFab) || Number(p.precioBotellonDom) || 0
  if (botellonTotal > 0) items.push({ producto: 'BOTELLON', cantPedido: botellonTotal, precio: botellonPrecio })
  if (p.cBolsaAguaPed > 0) items.push({ producto: 'BOLSA_AGUA', cantPedido: p.cBolsaAguaPed, precio: p.precioBolsaAgua })
  if (p.cBolsaHieloPed > 0) items.push({ producto: 'BOLSA_HIELO', cantPedido: p.cBolsaHieloPed, precio: p.precioBolsaHielo })
  return items
}

export function calcularAlertasCliente(
  cliente: {
    id: string
    nombre: string
    telefono: string
    verificado?: boolean
    bloqueado?: boolean
    reclamaciones?: number
    creadoPorRol?: string
    createdAt?: string
  },
  pedidos: PedidoBase[]
): AlertaItem[] {
  const alertas: AlertaItem[] = []
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

  // 2DO / 3RO / MULTIPLES_RAPIDO
  const pedidosHoy = pedidos.filter((p) => {
    const fechaColombia = p.fecha
      ? new Date(p.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
      : ''
    return fechaColombia === hoy
  })
  if (pedidosHoy.length >= 3) {
    alertas.push({ tipo: '3RO_PEDIDO', severidad: 'MEDIA', detalle: `${pedidosHoy.length} pedidos hoy`, fecha: hoy })
  } else if (pedidosHoy.length === 2) {
    alertas.push({ tipo: '2DO_PEDIDO', severidad: 'BAJA', detalle: '2do pedido hoy', fecha: hoy })
  }
  const horas = pedidosHoy.map((ph) => new Date(ph.fecha).getTime()).sort((a, b) => a - b)
  for (let i = 1; i < horas.length; i++) {
    const diffMin = (horas[i] - horas[i - 1]) / (1000 * 60)
    if (diffMin < 60) {
      alertas.push({ tipo: 'MULTIPLES_PEDIDOS_RAPIDO', severidad: 'MEDIA', detalle: `2 pedidos a ${Math.round(diffMin)} min`, fecha: hoy })
      break
    }
  }

  // FIADO_REcurrente
  const hace7Dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const fiadosRecientes = pedidos.filter((p) => Number(p.saldo) > 0 && p.fecha >= hace7Dias)
  if (fiadosRecientes.length >= 2) {
    alertas.push({ tipo: 'FIADO_REcurrente', severidad: 'MEDIA', detalle: `${fiadosRecientes.length} pedidos fiados en 7 días`, fecha: fiadosRecientes[0].fecha })
  }

  // CLIENTE_BLOQUEADO / PROMESA_PROXIMA_VENCER / DISPUTA_ABIERTA / NO_ENTREGADO
  const noEntregados30d = pedidos.filter((p) => p.estadoEntrega === 'NO_ENTREGADO' && p.fecha >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
  if (noEntregados30d.length >= 2) {
    alertas.push({ tipo: 'NO_ENTREGADO_REPETIDO', severidad: 'MEDIA', detalle: `${noEntregados30d.length} entregas fallidas en 30 días`, fecha: noEntregados30d[0].fecha })
  }

  pedidos.forEach((p) => {
    if (p.estadoPago === 'VENCIDO') {
      alertas.push({ tipo: 'CLIENTE_BLOQUEADO', severidad: 'ALTA', detalle: `Pedido #${p.numero}: promesa vencida`, fecha: p.fecha, pedidoId: p.id })
    }
    if (p.disputaAbierta) {
      alertas.push({ tipo: 'DISPUTA_ABIERTA', severidad: 'ALTA', detalle: `Pedido #${p.numero} con disputa`, fecha: p.fecha, pedidoId: p.id })
    }
    if (p.promesaPagoFecha && p.estadoPago !== 'PAGADO' && p.estadoPago !== 'ANTICIPADO' && p.estadoPago !== 'ANULADO') {
      const promesa = new Date(p.promesaPagoFecha)
      const diffDias = Math.ceil((promesa.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      if (diffDias <= 2 && diffDias >= -1) {
        alertas.push({ tipo: 'PROMESA_PROXIMA_VENCER', severidad: 'MEDIA', detalle: diffDias >= 0 ? `Vence en ${diffDias} días` : `Venció hace ${Math.abs(diffDias)} días`, fecha: p.promesaPagoFecha, pedidoId: p.id })
      }
    }
  })

  // RECLAMACIONES
  const reclamaciones = cliente.reclamaciones || 0
  if (reclamaciones >= 3) {
    alertas.push({ tipo: 'RECLAMACIONES_MULTIPLES', severidad: 'ALTA', detalle: `${reclamaciones} reclamaciones acumuladas`, fecha: hoy })
  } else if (reclamaciones > 0) {
    alertas.push({ tipo: 'RECLAMACION_ACTIVA', severidad: 'MEDIA', detalle: `${reclamaciones} reclamación activa`, fecha: hoy })
  }

  // CLIENTE_NO_VERIFICADO
  if (cliente.verificado === false && cliente.createdAt) {
    const dias = Math.floor((Date.now() - new Date(cliente.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    if (dias > 30) {
      alertas.push({ tipo: 'CLIENTE_NO_VERIFICADO', severidad: 'MEDIA', detalle: `Sin verificar hace ${dias} días`, fecha: cliente.createdAt })
    }
  }

  // MONTO_ANOMALO (último pedido)
  const ultimoPedido = pedidos[0]
  if (ultimoPedido) {
    const promedio = calcularPromedioCliente(pedidos)
    if (promedio > 0 && Number(ultimoPedido.total) > promedio * 2) {
      alertas.push({ tipo: 'MONTO_ANOMALO', severidad: 'ALTA', detalle: `${formatCurrency(Number(ultimoPedido.total))} (promedio: ${formatCurrency(promedio)})`, fecha: ultimoPedido.fecha, pedidoId: ultimoPedido.id })
    }
  }

  // Filtrar ignoradas (solo BAJA/MEDIA)
  return alertas.filter((a) => a.severidad === 'ALTA' || !estaIgnorada(cliente.id, a.tipo))
}

function calcularPromedioCliente(pedidos: PedidoBase[]): number {
  const validos = pedidos.filter((p) => p.estadoEntrega !== 'ANULADO' && p.estadoEntrega !== 'CANCELADO')
  if (validos.length === 0) return 0
  const total = validos.reduce((acc, p) => acc + Number(p.total), 0)
  return total / validos.length
}
