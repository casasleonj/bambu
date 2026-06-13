/**
 * Detector de Alertas Antifraude.
 *
 * Logica pura (sin imports de React/Next) — moved from
 * src/app/(app)/pedidos/pedidos-client/alertas-utils.ts para poder
 * ser testeada con Vitest.
 *
 * El archivo original queda como shim que re-exporta desde aca para
 * no romper imports existentes.
 *
 * Commit 2 (fix sesgos) conecta los `umbrales` a los calculos
 * internos. Por ahora, las funciones aceptan un parametro opcional
 * `umbrales` con defaults que preservan el comportamiento actual
 * del codigo pre-commit-0b.
 *
 * @see src/lib/alertas-config.ts para la guia de cada AlertaTipo
 * @see src/lib/umbrales.ts para los defaults
 */

import { formatCurrency } from '@/lib/utils'
import type { AlertaItem, AlertaRow, SeveridadAlerta } from '@/lib/alertas-config'
import { estaIgnorada } from '@/lib/alertas-config'
import { UMBRALES_DEFAULT, type UmbralesAlertas } from '@/lib/umbrales'

export type { AlertaItem, AlertaRow, AlertaTipo, SeveridadAlerta } from '@/lib/alertas-config'
export { REGLAS_ALERTAS, getGuiaAlerta } from '@/lib/alertas-config'

/**
 * commit 1.2 plan antifraude: shape minima de Embarque para los
 * calculos de alertas por repartidor. El detector NO toca Prisma
 * directamente — recibe un array de estos objetos y los procesa
 * en memoria (puro, testeable).
 *
 * Los campos devueltas/rotas vienen de las columnas legacy
 * (Embarque.devueltasAgua, etc) o de la tabla normalizada
 * EmbarqueProducto (la cual el trigger 20260611_add_embarque_legacy_sync_trigger
 * mantiene sincronizada con las legacy). El caller decide cual usar.
 */
export interface EmbarqueBase {
  id: string
  fecha: string
  trabajadorId: string
  /** legacy columns o suma de EmbarqueProducto (caller normaliza) */
  devueltasAgua: number
  devueltasHielo: number
  rotasAgua: number
  rotasHielo: number
}

/**
 * AlertaRepartidorRow: agrupa alertas por REPARTIDOR (no por cliente).
 * Usado para DEVOLUCIONES_ANORMALES, ROTURAS_ANORMALES, REPARTIDOR_DEUDA_ALTA.
 * La UI los muestra con el nombre del repartidor (no del cliente).
 */
export interface AlertaRepartidorRow {
  repartidorId: string
  nombreRep: string
  alertas: AlertaItem[]
  severidadMasAlta: SeveridadAlerta
}

/**
 * Tupla (producto, cantidad) -> precioMinimo para alertas.
 * El detector hace match del item del pedido contra la tupla correcta
 * segun la cantidad (mismo algoritmo que PrecioVolumen resolver).
 *
 * null = sin restriccion (alerta deshabilitada para esa tupla).
 */
export interface PrecioMinimoRow {
  producto: string
  cantMin: number
  cantMax: number | null
  precioMinimo: number | null
}

/**
 * Encuentra el precioMinimo aplicable para un item (producto, cantidad).
 * Retorna null si no hay match (alerta deshabilitada).
 */
export function findPrecioMinimo(
  rows: PrecioMinimoRow[] | undefined,
  producto: string,
  cantidad: number,
): number | null {
  if (!rows) return null
  for (const r of rows) {
    if (r.producto !== producto) continue
    if (cantidad < r.cantMin) continue
    if (r.cantMax !== null && cantidad > r.cantMax) continue
    return r.precioMinimo
  }
  return null
}

interface PedidoBase {
  id: string
  numero: number
  clienteId: string
  nombreCli?: string
  telefonoCli?: string
  fecha: string
  total: number | string
  saldo: number | string
  estadoEntrega: string
  estadoPago: string
  disputaAbierta?: boolean
  promesaPagoFecha?: string
  items?: Array<{ producto: string; cantPedido: number; precio: number; precioOrigen?: string }>
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

export type { PedidoBase }

const SEVERIDAD_ORDER = { ALTA: 3, MEDIA: 2, BAJA: 1 } as const

export interface CalcularAlertasOptions {
  /** Umbrales (default: UMBRALES_DEFAULT para preservar comportamiento actual) */
  umbrales?: UmbralesAlertas
  /** ID de cliente cuyas alertas BAJA/MEDIA se deben filtrar (24h cooldown) */
  clienteIdIgnorar?: string
  /** Tabla de preciosMinimo por (producto, tier) para detectar PRECIO_POR_DEBAJO_TABLA. */
  precioMinimos?: PrecioMinimoRow[]
}

export function calcularAlertas(pedidos: PedidoBase[], options: CalcularAlertasOptions | string = {}): AlertaRow[] {
  // Backward compat: si options es string, tratarlo como clienteIdIgnorar (firma antigua)
  const opts: CalcularAlertasOptions = typeof options === 'string' ? { clienteIdIgnorar: options } : options
  const umbrales = opts.umbrales ?? UMBRALES_DEFAULT
  const clienteIdIgnorar = opts.clienteIdIgnorar
  const precioMinimos = opts.precioMinimos

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

  // Ultimo precio por producto por cliente (para CAMBIO_PRECIO_BRUSCO)
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
      const pedidosHoy = pedidos
        .filter((p2) => {
          const fecha2 = p2.fecha
            ? new Date(p2.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
            : ''
          return p2.clienteId === p.clienteId && fecha2 === hoy
        })
        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
      const orden = pedidosHoy.findIndex((p2) => p2.id === p.id) + 1

      if (pedidosHoy.length >= 2) {
        if (orden >= 3) {
          alertas.push({
            tipo: '3RO_PEDIDO',
            severidad: 'MEDIA',
            detalle: `${pedidosHoy.length} pedidos hoy`,
            fecha: p.fecha,
            pedidoId: p.id,
          })
        } else if (orden === 2) {
          alertas.push({
            tipo: '2DO_PEDIDO',
            severidad: 'BAJA',
            detalle: '2do pedido hoy',
            fecha: p.fecha,
            pedidoId: p.id,
          })
        } else if (orden === 1) {
          alertas.push({
            tipo: '1ER_PEDIDO',
            severidad: 'BAJA',
            detalle: '1er pedido hoy',
            fecha: p.fecha,
            pedidoId: p.id,
          })
        }
      }

      // 18. Multiples pedidos muy seguidos (< 1h)
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

    // 2. Monto anomalo (>N x promedio personal)
    // TODO commit 2: usar umbrales.multiplicadorMontoAnomalo en vez de hardcoded 2
    const promedio = promedioPorCliente.get(p.clienteId) || 0
    if (promedio > 0 && Number(p.total) > promedio * umbrales.multiplicadorMontoAnomalo) {
      alertas.push({
        tipo: 'MONTO_ANOMALO',
        severidad: 'ALTA',
        detalle: `${formatCurrency(Number(p.total))} (promedio: ${formatCurrency(promedio)})`,
        fecha: p.fecha,
        pedidoId: p.id,
      })
    }

    // 3. Fiado recurrente (2+ pedidos con saldo en 7 dias)
    const hace7Dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const fiadosRecientes = pedidos.filter(
      (p2) =>
        p2.clienteId === p.clienteId &&
        Number(p2.saldo) > 0 &&
        p2.fecha >= hace7Dias,
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

    // 9. Promesa proxima a vencer
    // TODO commit 2: usar umbrales.diasVencimientoPromesa en vez de hardcoded 2/-1
    if (p.promesaPagoFecha && p.estadoPago !== 'PAGADO' && p.estadoPago !== 'ANTICIPADO' && p.estadoPago !== 'ANULADO') {
      const promesa = new Date(p.promesaPagoFecha)
      const diffMs = promesa.getTime() - Date.now()
      const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      if (diffDias <= umbrales.diasVencimientoPromesa && diffDias >= -1) {
        alertas.push({
          tipo: 'PROMESA_PROXIMA_VENCER',
          severidad: 'MEDIA',
          detalle: diffDias >= 0 ? `Vence en ${diffDias} días` : `Venció hace ${Math.abs(diffDias)} días`,
          fecha: p.promesaPagoFecha,
          pedidoId: p.id,
        })
      }
    }

    // 19. Cambio precio brusco
    // TODO commit 2: el skip de precioOrigen='manual' se hace inseguro (cambia a autorizadoPorAdmin)
    const items = p.items && p.items.length > 0 ? p.items : legacyItems(p)
    items.forEach((item) => {
      if (item.cantPedido > 0 && item.precio > 0) {
        if (item.precioOrigen === 'manual') return

        const ultPrecioMap = ultimoPrecioPorClienteProducto.get(p.clienteId)
        const ultPrecio = ultPrecioMap?.get(item.producto)
        if (ultPrecio && ultPrecio > 0) {
          const variacion = Math.abs(item.precio - ultPrecio) / ultPrecio
          const variacionPct = umbrales.variacionPrecioBruscoPct / 100
          if (variacion > variacionPct) {
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

    // 15. Precio por debajo de tabla (commit 1.1 plan antifraude)
    // Para cada item del pedido, busca el precioMinimo aplicable
    // segun (producto, cantidad) y compara contra item.precio.
    // Si item.precio < precioMinimo, alerta ALTA.
    //
    // Comportamiento por caso:
    //   - precioMinimos no provisto: alerta deshabilitada (no rompe UI)
    //   - sin match para (producto, cantidad): alerta deshabilitada
    //   - precioMinimo === null: alerta deshabilitada
    //   - item.precio >= precioMinimo: OK
    //   - item.precio < precioMinimo: ALERTA
    if (precioMinimos) {
      items.forEach((item) => {
        if (item.cantPedido > 0 && item.precio > 0) {
          const minimo = findPrecioMinimo(precioMinimos, item.producto, item.cantPedido)
          if (minimo !== null && Number(item.precio) < minimo) {
            alertas.push({
              tipo: 'PRECIO_POR_DEBAJO_TABLA',
              severidad: 'ALTA',
              detalle: `${item.producto}: ${formatCurrency(Number(item.precio))} < minimo ${formatCurrency(minimo)}`,
              fecha: p.fecha,
              pedidoId: p.id,
            })
          }
        }
      })
    }

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
  const noEntregadosPorCliente = new Map<string, PedidoBase[]>()
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
    row.severidadMasAlta = row.alertas.reduce<SeveridadAlerta>(
      (max, a) => (SEVERIDAD_ORDER[a.severidad] > SEVERIDAD_ORDER[max] ? a.severidad : max),
      'BAJA',
    )
    if (clienteIdIgnorar) {
      row.alertas = row.alertas.filter((a) => a.severidad === 'ALTA' || !estaIgnorada(clienteIdIgnorar, a.tipo))
    }
  })

  return Array.from(clientesMap.values()).filter((r) => r.alertas.length > 0)
}

function legacyItems(p: PedidoBase): Array<{ producto: string; cantPedido: number; precio: number; precioOrigen?: string }> {
  // precioOrigen es undefined: las columnas legacy no tienen origen. Esto
  // evita que la alerta CAMBIO_PRECIO_BRUSCO skipee por "manual" en pedidos
  // legacy. Coincide con la logica original (que tampoco las skipeaba).
  const items: Array<{ producto: string; cantPedido: number; precio: number; precioOrigen?: string }> = []
  if (p.cPacaAguaPed > 0) items.push({ producto: 'PACA_AGUA', cantPedido: p.cPacaAguaPed, precio: p.precioPacaAgua })
  if (p.cPacaHieloPed > 0) items.push({ producto: 'PACA_HIELO', cantPedido: p.cPacaHieloPed, precio: p.precioPacaHielo })
  const botellonTotal = (p.cBotellonFabPed || 0) + (p.cBotellonDomPed || 0)
  const botellonPrecio = Number(p.precioBotellonFab) || Number(p.precioBotellonDom) || 0
  if (botellonTotal > 0) items.push({ producto: 'BOTELLON', cantPedido: botellonTotal, precio: botellonPrecio })
  if (p.cBolsaAguaPed > 0) items.push({ producto: 'BOLSA_AGUA', cantPedido: p.cBolsaAguaPed, precio: p.precioBolsaAgua })
  if (p.cBolsaHieloPed > 0) items.push({ producto: 'BOLSA_HIELO', cantPedido: p.cBolsaHieloPed, precio: p.precioBolsaHielo })
  return items
}

export interface CalcularAlertasClienteOptions {
  umbrales?: UmbralesAlertas
  /** Tabla de preciosMinimo por (producto, tier) para detectar PRECIO_POR_DEBAJO_TABLA. */
  precioMinimos?: PrecioMinimoRow[]
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
  pedidos: PedidoBase[],
  options: CalcularAlertasClienteOptions = {},
): AlertaItem[] {
  const umbrales = options.umbrales ?? UMBRALES_DEFAULT
  const precioMinimos = options.precioMinimos

  const alertas: AlertaItem[] = []
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

  // 2DO / 3RO / MULTIPLES_RAPIDO
  const pedidosHoy = pedidos
    .filter((p) => {
      const fechaColombia = p.fecha
        ? new Date(p.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
        : ''
      return fechaColombia === hoy
    })
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
  if (pedidosHoy.length >= 2) {
    alertas.push({ tipo: '1ER_PEDIDO', severidad: 'BAJA', detalle: '1er pedido hoy', fecha: hoy })
  }
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
    // TODO commit 2: usar umbrales.diasVencimientoPromesa
    if (p.promesaPagoFecha && p.estadoPago !== 'PAGADO' && p.estadoPago !== 'ANTICIPADO' && p.estadoPago !== 'ANULADO') {
      const promesa = new Date(p.promesaPagoFecha)
      const diffDias = Math.ceil((promesa.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      if (diffDias <= umbrales.diasVencimientoPromesa && diffDias >= -1) {
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
  // TODO commit 2: filtrar por creadoPorRol === 'REPARTIDOR'
  // TODO commit 2: usar umbrales.diasNoVerificado en vez de hardcoded 30
  if (cliente.verificado === false && cliente.createdAt) {
    const dias = Math.floor((Date.now() - new Date(cliente.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    if (dias > umbrales.diasNoVerificado) {
      alertas.push({ tipo: 'CLIENTE_NO_VERIFICADO', severidad: 'MEDIA', detalle: `Sin verificar hace ${dias} días`, fecha: cliente.createdAt })
    }
  }

  // MONTO_ANOMALO (ultimo pedido)
  // TODO commit 2: usar umbrales.multiplicadorMontoAnomalo
  const ultimoPedido = pedidos[0]
  if (ultimoPedido) {
    const promedio = calcularPromedioCliente(pedidos)
    if (promedio > 0 && Number(ultimoPedido.total) > promedio * umbrales.multiplicadorMontoAnomalo) {
      alertas.push({ tipo: 'MONTO_ANOMALO', severidad: 'ALTA', detalle: `${formatCurrency(Number(ultimoPedido.total))} (promedio: ${formatCurrency(promedio)})`, fecha: ultimoPedido.fecha, pedidoId: ultimoPedido.id })
    }
  }

  // PRECIO_POR_DEBAJO_TABLA (commit 1.1)
  // Itera sobre los items del primer pedido (o el unico, usualmente el
  // contexto de /clientes/[id] muestra los pedidos recientes del cliente).
  if (precioMinimos && ultimoPedido) {
    const items = ultimoPedido.items && ultimoPedido.items.length > 0 ? ultimoPedido.items : legacyItems(ultimoPedido)
    items.forEach((item) => {
      if (item.cantPedido > 0 && item.precio > 0) {
        const minimo = findPrecioMinimo(precioMinimos, item.producto, item.cantPedido)
        if (minimo !== null && Number(item.precio) < minimo) {
          alertas.push({ tipo: 'PRECIO_POR_DEBAJO_TABLA', severidad: 'ALTA', detalle: `${item.producto}: ${formatCurrency(Number(item.precio))} < minimo ${formatCurrency(minimo)}`, fecha: ultimoPedido.fecha, pedidoId: ultimoPedido.id })
        }
      }
    })
  }

  // Filtrar ignoradas (solo BAJA/MEDIA)
  return alertas.filter((a) => a.severidad === 'ALTA' || !estaIgnorada(cliente.id, a.tipo))
}

export function calcularPromedioCliente(pedidos: PedidoBase[]): number {
  const validos = pedidos.filter((p) => p.estadoEntrega !== 'ANULADO' && p.estadoEntrega !== 'CANCELADO')
  if (validos.length === 0) return 0
  const total = validos.reduce((acc, p) => acc + Number(p.total), 0)
  return total / validos.length
}

export interface CalcularAlertasRepartidorOptions {
  /** Multiplicador sobre promedio para disparar alerta (default: umbrales.pctDevolucionesAnormales) */
  multiplicador?: number
  /** Minimo de embarques historicos para que un repartidor sea evaluado (default: 5) */
  minEmbarquesMuestral?: number
  /** Mapa opcional de repartidorId → nombre (si no se pasa, se usa el id) */
  nombres?: Map<string, string>
}

/**
 * commit 1.2 plan antifraude: detecta DEVOLUCIONES_ANORMALES y
 * ROTURAS_ANORMALES por repartidor.
 *
 * Algoritmo:
 *   1. Agrupa embarques por repartidorId
 *   2. Para cada repartidor con >= minEmbarquesMuestral embarques,
 *      calcula promedio de (devueltas y rotas) sumando agua + hielo
 *   3. Para cada embarque de ese repartidor, si devueltas o rotas
 *      superan promedio * multiplicador, agrega alerta
 *   4. Retorna AlertaRepartidorRow[] con todas las alertas agrupadas
 *      por repartidor
 *
 * Notas:
 *   - Si minEmbarquesMuestral no se cumple, NO alerta (pocos datos
 *     para comparar — evita falsos positivos en repartidores nuevos)
 *   - DEVOLUCIONES y ROTURAS se evaluan en el mismo embarque, ambos
 *     pueden disparar alertas independientes
 *   - La UI muestra estos rows con el nombre del repartidor (no
 *     del cliente) usando la `severidadMasAlta` como badge
 */
export function calcularAlertasRepartidor(
  embarques: EmbarqueBase[],
  options: CalcularAlertasRepartidorOptions = {},
): AlertaRepartidorRow[] {
  const multiplicador = options.multiplicador ?? UMBRALES_DEFAULT.pctDevolucionesAnormales
  const minEmbarquesMuestral = options.minEmbarquesMuestral ?? 5
  const nombres = options.nombres

  // 1. Agrupar embarques por repartidor
  const embarquesPorRepartidor = new Map<string, EmbarqueBase[]>()
  for (const e of embarques) {
    const arr = embarquesPorRepartidor.get(e.trabajadorId) || []
    arr.push(e)
    embarquesPorRepartidor.set(e.trabajadorId, arr)
  }

  const rows: AlertaRepartidorRow[] = []

  for (const [repartidorId, lista] of embarquesPorRepartidor) {
    // 2. Minimo muestral
    if (lista.length < minEmbarquesMuestral) continue

    // Calcular promedios de devueltas y rotas
    const totalDevueltas = lista.reduce(
      (acc, e) => acc + (e.devueltasAgua || 0) + (e.devueltasHielo || 0),
      0,
    )
    const totalRotas = lista.reduce(
      (acc, e) => acc + (e.rotasAgua || 0) + (e.rotasHielo || 0),
      0,
    )
    const promedioDevueltas = totalDevueltas / lista.length
    const promedioRotas = totalRotas / lista.length

    // 3. Evaluar cada embarque del repartidor
    const alertas: AlertaItem[] = []
    for (const e of lista) {
      const devueltas = (e.devueltasAgua || 0) + (e.devueltasHielo || 0)
      const rotas = (e.rotasAgua || 0) + (e.rotasHielo || 0)

      if (promedioDevueltas > 0 && devueltas > promedioDevueltas * multiplicador) {
        alertas.push({
          tipo: 'DEVOLUCIONES_ANORMALES',
          severidad: 'MEDIA',
          detalle: `${devueltas} devueltas (promedio: ${promedioDevueltas.toFixed(1)}, umbral: ${(promedioDevueltas * multiplicador).toFixed(1)})`,
          fecha: e.fecha,
          embarqueId: e.id,
        })
      }

      if (promedioRotas > 0 && rotas > promedioRotas * multiplicador) {
        alertas.push({
          tipo: 'ROTURAS_ANORMALES',
          severidad: 'BAJA',
          detalle: `${rotas} rotas (promedio: ${promedioRotas.toFixed(1)}, umbral: ${(promedioRotas * multiplicador).toFixed(1)})`,
          fecha: e.fecha,
          embarqueId: e.id,
        })
      }
    }

    if (alertas.length > 0) {
      // Calcular severidadMasAlta
      const severidadMasAlta = alertas.reduce<SeveridadAlerta>((max, a) =>
        SEVERIDAD_ORDER[a.severidad] > SEVERIDAD_ORDER[max] ? a.severidad : max,
        'BAJA',
      )

      rows.push({
        repartidorId,
        nombreRep: nombres?.get(repartidorId) ?? repartidorId,
        alertas,
        severidadMasAlta,
      })
    }
  }

  return rows
}
