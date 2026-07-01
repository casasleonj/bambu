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
import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'
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
  items?: Array<{
    producto: string
    cantPedido: number
    precio: number
    precioOrigen?: string
    /** commit 0c/2 plan antifraude: si true, el admin autorizo este precio manual
     *  y la alerta CAMBIO_PRECIO_BRUSCO skipea este item. Sin esta marca,
     *  cualquier precio manual es sospechoso (vector de fraude). */
    autorizadoPorAdmin?: boolean
  }>
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
  /**
   * commit 1.3 plan antifraude: cuenta de Notas de Credito por cliente
   * (en los ultimos N dias, default 30). Si count >= 2 → NOTA_CREDITO_FRECUENTE.
   * El caller (la alerts page) hace el filtro por fecha y el count
   * via /api/alertas/notas-credito-count.
   */
  notasCreditoCount?: Map<string, number>
  /** Minimo de NCs en el periodo para disparar alerta (default 2) */
  minNotasCreditoCount?: number
}

export function calcularAlertas(pedidos: PedidoBase[], options: CalcularAlertasOptions | string = {}): AlertaRow[] {
  // Backward compat: si options es string, tratarlo como clienteIdIgnorar (firma antigua)
  const opts: CalcularAlertasOptions = typeof options === 'string' ? { clienteIdIgnorar: options } : options
  const umbrales = opts.umbrales ?? UMBRALES_DEFAULT
  const clienteIdIgnorar = opts.clienteIdIgnorar
  const precioMinimos = opts.precioMinimos
  const notasCreditoCount = opts.notasCreditoCount
  const minNotasCreditoCount = opts.minNotasCreditoCount ?? 2

  // FIX Fase 4: las ventas anónimas (CONSUMIDOR_FINAL) no son un cliente real,
  // por lo que no deben generar alertas de fraude ni aparecer en el panel.
  pedidos = pedidos.filter((p) => p.clienteId !== CANONICAL_CONSUMIDOR_FINAL_ID)

  const clientesMap = new Map<string, AlertaRow>()
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

  // Promedio por cliente (excluyendo anulados/cancelados)
  // commit 2 plan antifraude: mediana de los ultimos N pedidos por
  // cliente (no promedio). La mediana es mas robusta a outliers: si un
  // fraude historico infla el promedio, futuros fraudes pueden pasar
  // desapercibidos. Con la mediana, el fraude es siempre comparable
  // contra el grueso del historial.
  //
  // Algoritmo:
  // 1. Por cada cliente, tomar los ultimos 5 pedidos validos
  //    (cronologicamente), excluyendo el pedido actual del check
  // 2. Excluir outliers (>3x mediana tentativa) — recursivo 1 vez
  // 3. Si quedan <3 pedidos, no alertar (datos insuficientes)
  // 4. Computar mediana final
  const medianaPorCliente = new Map<string, number>()
  {
    // Agrupar pedidos por cliente, ordenados por fecha
    const pedidosPorCliente = new Map<string, PedidoBase[]>()
    for (const p of pedidos) {
      if (p.estadoEntrega === 'ANULADO' || p.estadoEntrega === 'CANCELADO') continue
      const arr = pedidosPorCliente.get(p.clienteId) || []
      arr.push(p)
      pedidosPorCliente.set(p.clienteId, arr)
    }
    for (const [clienteId, lista] of pedidosPorCliente) {
      // Ordenar por fecha asc y tomar ultimos 5
      const recientes = lista
        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
        .slice(-5)
      const totales = recientes.map((p) => Number(p.total))
      if (totales.length < 3) {
        // No hay suficientes datos para una mediana confiable
        continue
      }
      // Mediana tentativa
      let m = calcularMediana(totales)
      // Excluir outliers > 3x mediana (recursivo 1 vez)
      const sinOutliers = totales.filter((t) => t <= m * 3)
      if (sinOutliers.length >= 3) {
        m = calcularMediana(sinOutliers)
      }
      medianaPorCliente.set(clienteId, m)
    }
  }

  // Mantener promedioPorCliente por backward compat (usado en detalle del alert)
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

    // 2. Monto anomalo (>N x mediana personal)
    // commit 2 plan antifraude: usa la MEDIANA de los ultimos 5 pedidos
    // (no el promedio). La mediana es mas robusta a outliers — si un
    // fraude historico infla el promedio, futuros fraudes pueden pasar
    // desapercibidos. Con la mediana, el fraude siempre se compara
    // contra el grueso del historial.
    // Si medianaPorCliente no tiene el cliente (<3 pedidos historicos),
    // no alertar (datos insuficientes).
    const mediana = medianaPorCliente.get(p.clienteId) || 0
    if (mediana > 0 && Number(p.total) > mediana * umbrales.multiplicadorMontoAnomalo) {
      alertas.push({
        tipo: 'MONTO_ANOMALO',
        severidad: 'ALTA',
        detalle: `${formatCurrency(Number(p.total))} (mediana: ${formatCurrency(mediana)})`,
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
    // commit 2 plan antifraude: el skip de precioOrigen='manual' ahora
    // requiere autorizadoPorAdmin=true. Sin esa marca, un precio
    // manual es sospechoso (vector de fraude: el repartidor marca
    // como 'manual' para evadir la deteccion).
    // - precioOrigen='manual' + autorizadoPorAdmin=true → skip (autorizado)
    // - precioOrigen='manual' + autorizadoPorAdmin=false/undefined → alerta
    // - precioOrigen='base'/'volumen'/'cliente' → compara contra ultimo
    const items = p.items && p.items.length > 0 ? p.items : legacyItems(p)
    items.forEach((item) => {
      if (item.cantPedido > 0 && item.precio > 0) {
        if (item.precioOrigen === 'manual' && item.autorizadoPorAdmin === true) return

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
          nombreCli: p.nombreCli ?? '',
          telefonoCli: p.telefonoCli ?? '',
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
          nombreCli: arr[0].nombreCli ?? '',
          telefonoCli: arr[0].telefonoCli ?? '',
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

  // commit 1.3 plan antifraude: NOTA_CREDITO_FRECUENTE (post-proceso)
  // El caller provee notasCreditoCount (clienteId → count de NCs en
  // el periodo). Si count >= minNotasCreditoCount, agrega alerta ALTA.
  // El alert NO se agrega si el cliente ya tiene una alerta del mismo
  // tipo (dedup intra-row).
  if (notasCreditoCount) {
    for (const [clienteId, count] of notasCreditoCount) {
      if (count < minNotasCreditoCount) continue

      const existing = clientesMap.get(clienteId)
      const yaTieneAlerta = existing?.alertas.some((a) => a.tipo === 'NOTA_CREDITO_FRECUENTE')
      if (yaTieneAlerta) continue

      const alerta: AlertaItem = {
        tipo: 'NOTA_CREDITO_FRECUENTE',
        severidad: 'ALTA',
        detalle: `${count} notas de credito en los ultimos 30 dias`,
        fecha: new Date().toISOString(),
      }

      if (existing) {
        existing.alertas.push(alerta)
      } else {
        // Cliente no estaba en el map (sin alertas previas)
        clientesMap.set(clienteId, {
          clienteId,
          nombreCli: clienteId, // fallback: el id. La UI lo resolveria via lookup.
          telefonoCli: '',
          alertas: [alerta],
          severidadMasAlta: 'ALTA',
        })
      }
    }
  }

  return Array.from(clientesMap.values()).filter((r) => r.alertas.length > 0)
}

function legacyItems(p: PedidoBase): Array<{ producto: string; cantPedido: number; precio: number; precioOrigen?: string; autorizadoPorAdmin?: boolean }> {
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
  /** commit 1.3: count de NCs de este cliente en el periodo */
  notasCreditoCount?: number
  /** Minimo para disparar (default 2) */
  minNotasCreditoCount?: number
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
  // commit 2 plan antifraude (Hallazgo 6): solo alertar si el cliente
  // fue creado por un REPARTIDOR. Clientes creados por ADMIN/ASISTENTE
  // son parte del flujo normal de la oficina y no son sospechosos.
  // Patrón: "cliente fantasma" = repartidor crea cliente sin verificar
  // (a veces con datos falsos) y le fía a ese mismo cliente.
  // Sin este filtro, la alerta disparaba para TODOS los clientes no
  // verificados > N días (sobre-detección: falsos positivos en
  // clientes reales de la oficina).
  if (
    cliente.verificado === false &&
    cliente.createdAt &&
    cliente.creadoPorRol === 'REPARTIDOR'
  ) {
    const dias = Math.floor((Date.now() - new Date(cliente.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    if (dias > umbrales.diasNoVerificado) {
      alertas.push({ tipo: 'CLIENTE_NO_VERIFICADO', severidad: 'MEDIA', detalle: `Sin verificar hace ${dias} días (creado por repartidor)`, fecha: cliente.createdAt })
    }
  }

  // MONTO_ANOMALO (ultimo pedido) — commit 2: usa mediana
  const ultimoPedido = pedidos[0]
  if (ultimoPedido) {
    // Calcular mediana de ultimos 5 (excluyendo el actual)
    const validos = pedidos
      .filter((p) => p.estadoEntrega !== 'ANULADO' && p.estadoEntrega !== 'CANCELADO' && p.id !== ultimoPedido.id)
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
      .slice(-5)
    const totales = validos.map((p) => Number(p.total))
    if (totales.length >= 3) {
      let m = calcularMediana(totales)
      const sinOutliers = totales.filter((t) => t <= m * 3)
      if (sinOutliers.length >= 3) m = calcularMediana(sinOutliers)
      if (Number(ultimoPedido.total) > m * umbrales.multiplicadorMontoAnomalo) {
        alertas.push({ tipo: 'MONTO_ANOMALO', severidad: 'ALTA', detalle: `${formatCurrency(Number(ultimoPedido.total))} (mediana: ${formatCurrency(m)})`, fecha: ultimoPedido.fecha, pedidoId: ultimoPedido.id })
      }
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

  // commit 1.3: NOTA_CREDITO_FRECUENTE para este cliente
  const ncCount = options.notasCreditoCount
  const minNc = options.minNotasCreditoCount ?? 2
  if (ncCount !== undefined && ncCount >= minNc) {
    alertas.push({
      tipo: 'NOTA_CREDITO_FRECUENTE',
      severidad: 'ALTA',
      detalle: `${ncCount} notas de credito en los ultimos 30 dias`,
      fecha: hoy,
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

/**
 * commit 2 plan antifraude: helper de mediana.
 * Para inputs vacios retorna 0. Para longitud 1 retorna el unico valor.
 * Para longitud par toma el promedio de los 2 valores centrales.
 */
export function calcularMediana(valores: number[]): number {
  if (valores.length === 0) return 0
  const sorted = [...valores].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) {
    return sorted[mid]
  }
  return (sorted[mid - 1] + sorted[mid]) / 2
}

export interface CalcularAlertasRepartidorOptions {
  /** Multiplicador sobre promedio para disparar alerta (default: umbrales.pctDevolucionesAnormales) */
  multiplicador?: number
  /** Minimo de embarques historicos para que un repartidor sea evaluado (default: 5) */
  minEmbarquesMuestral?: number
  /** Mapa opcional de repartidorId → nombre (si no se pasa, se usa el id) */
  nombres?: Map<string, string>
  /**
   * commit 1.4 plan antifraude: descuentos a repartidor sin justificar
   * (justificado=false y mas viejos que el umbral). El caller pre-filtra
   * por fecha y por justificado=false; el detector solo agrupa y alerta.
   */
  descuentosSinJustificar?: Array<{
    id: string
    repartidorId: string
    fecha: string
    monto: number
    motivo: string
  }>
  /**
   * commit 1.5 plan antifraude: deuda acumulada por repartidor
   * (suma de deudaReposAgua + deudaReposHielo del Trabajador). El caller
   * pasa un Map solo con los repartidores que tienen deuda > 0.
   * Si la deuda total (agua + hielo, en pacas) supera el umbral
   * configurado, alerta REPARTIDOR_DEUDA_ALTA.
   */
  deudasPorRepartidor?: Map<string, { deudaAgua: number; deudaHielo: number }>
  /** Umbral de deuda en pacas para disparar alerta (default: umbrales.umbralDeudaRepartidorPacas) */
  umbralDeudaPacas?: number
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
  const descuentosSinJustificar = options.descuentosSinJustificar
  const deudasPorRepartidor = options.deudasPorRepartidor
  const umbralDeudaPacas = options.umbralDeudaPacas ?? UMBRALES_DEFAULT.umbralDeudaRepartidorPacas

  // 1. Agrupar embarques por repartidor
  const embarquesPorRepartidor = new Map<string, EmbarqueBase[]>()
  for (const e of embarques) {
    const arr = embarquesPorRepartidor.get(e.trabajadorId) || []
    arr.push(e)
    embarquesPorRepartidor.set(e.trabajadorId, arr)
  }

  // Acumulador de alertas por repartidor. Combina los 3 tipos
  // (DEVOLUCIONES, ROTURAS, DESCUENTO) en un solo row.
  const alertasPorRepartidor = new Map<string, AlertaItem[]>()
  const repartidoresEnMap = new Set<string>()

  // 1. DEVOLUCIONES + ROTURAS (requiere minEmbarquesMuestral)
  for (const [repartidorId, lista] of embarquesPorRepartidor) {
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

    // Evaluar cada embarque
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
      alertasPorRepartidor.set(repartidorId, alertas)
      repartidoresEnMap.add(repartidorId)
    }
  }

  // 2. DESCUENTO_NO_JUSTIFICADO (NO requiere minEmbarquesMuestral).
  // El caller pre-filtra descuentos donde justificado=false y
  // fecha < (now - umbral). El detector solo agrupa por repartidor.
  // Cada descuento genera su propia alerta (puede haber varias para
  // el mismo repartidor).
  if (descuentosSinJustificar) {
    for (const d of descuentosSinJustificar) {
      const alertas = alertasPorRepartidor.get(d.repartidorId) ?? []
      alertas.push({
        tipo: 'DESCUENTO_NO_JUSTIFICADO',
        severidad: 'MEDIA',
        detalle: `${formatCurrency(d.monto)} - ${d.motivo}`,
        fecha: d.fecha,
        embarqueId: d.id,
      })
      alertasPorRepartidor.set(d.repartidorId, alertas)
      repartidoresEnMap.add(d.repartidorId)
    }
  }

  // 3. commit 1.5 plan antifraude: REPARTIDOR_DEUDA_ALTA
  // El caller pasa un Map con repartidores que tienen deuda > 0.
  // Si deuda total (agua + hielo en pacas) > umbral, alerta MEDIA.
  // NO requiere minEmbarquesMuestral (la deuda es acumulativa, no
  // necesita historial de embarques).
  if (deudasPorRepartidor) {
    for (const [repartidorId, deuda] of deudasPorRepartidor) {
      const totalPacas = (deuda.deudaAgua || 0) + (deuda.deudaHielo || 0)
      if (totalPacas <= umbralDeudaPacas) continue

      const alertas = alertasPorRepartidor.get(repartidorId) ?? []
      alertas.push({
        tipo: 'REPARTIDOR_DEUDA_ALTA',
        severidad: 'MEDIA',
        detalle: `${totalPacas} pacas adeudadas (agua: ${deuda.deudaAgua}, hielo: ${deuda.deudaHielo}, umbral: ${umbralDeudaPacas})`,
        fecha: new Date().toISOString(),
      })
      alertasPorRepartidor.set(repartidorId, alertas)
      repartidoresEnMap.add(repartidorId)
    }
  }

  // 4. Construir rows finales
  const rows: AlertaRepartidorRow[] = []
  for (const repartidorId of repartidoresEnMap) {
    const alertas = alertasPorRepartidor.get(repartidorId) ?? []
    if (alertas.length === 0) continue
    const severidadMasAlta = alertas.reduce<SeveridadAlerta>(
      (max, a) => (SEVERIDAD_ORDER[a.severidad] > SEVERIDAD_ORDER[max] ? a.severidad : max),
      'BAJA',
    )
    rows.push({
      repartidorId,
      nombreRep: nombres?.get(repartidorId) ?? repartidorId,
      alertas,
      severidadMasAlta,
    })
  }

  return rows
}
