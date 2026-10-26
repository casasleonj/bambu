/**
 * PreviewPedidoUseCase — prepara una creación de Pedido SIN persistir ni
 * mutar nada. Compone servicios y repos de LECTURA existentes. Nunca escribe,
 * nunca toma lock, nunca abre transacción, nunca crea/modifica un Cliente.
 * El commit real (POST /api/pedidos) revalida y recalcula todo.
 *
 * Contrato normativo: docs/pedidos/02-api-contract-pedidos.md.
 * Plan: docs/pedidos/fase4-preview-endpoint-plan.md.
 */

import type { IPricingPort } from '../../domain/repositories/IPricingPort'
import type { IClienteRepository, ClienteBasico } from '../../domain/repositories/IClienteRepository'
import type { IPedidoRepository } from '../../domain/repositories/IPedidoRepository'
import type { GetFiadoStatusUseCase } from './GetFiadoStatusUseCase'
import type { PreviewPedidoInput, PreviewPedidoResult, PreviewCalculationItem } from '../dto'
import type { ProductCode } from '@/shared/domain'
import { PedidoId } from '../../domain/value-objects/PedidoId'
import { normalizarPagos, calcularSaldo, calcularEstadoPago } from '../../domain/services/pagos-calculator.service'
import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'
import {
  destinoEfectivoCambia,
  estadoEntregaAlCrear,
  requiereEntregaSuficiente,
  ubicacionEntregaValida,
} from '../../domain/services/entrega-politica.service'
import { pickDireccionTexto } from '@/lib/geo/pedido-direccion'
import { calcularAlertasCliente } from '@/lib/alertas-detector'
import { draftToPedidoBase, pedidoEntityToPedidoBase } from './pedido-to-pedido-base'
import { resolverEntrega } from '../../domain/services/entrega-suficiencia.service'

export class ClienteNotFoundError extends Error {
  constructor(id: string) { super(`CLIENTE_NOT_FOUND: ${id}`); this.name = 'ClienteNotFoundError' }
}
export class PedidoOrigenNotFoundError extends Error {
  constructor(id: string) { super(`PEDIDO_ORIGEN_NOT_FOUND: ${id}`); this.name = 'PedidoOrigenNotFoundError' }
}
export class PedidoNotFoundError extends Error {
  constructor(id: string) { super(`PEDIDO_NOT_FOUND: ${id}`); this.name = 'PedidoNotFoundError' }
}

export interface PreviewPedidoDeps {
  pricingPort: IPricingPort
  clienteRepo: IClienteRepository
  pedidoRepo: IPedidoRepository
  getFiadoStatusUseCase: GetFiadoStatusUseCase
  getPrecioMinimos: () => Promise<Array<{ producto: string; cantMin: number; cantMax: number | null; precioMinimo: number | null }>>
  /** `linkUbicacion → coords` server-only (best-effort). Solo se llama si no hay coords almacenadas. */
  resolverCoordsDeLink: (link: string | null | undefined) => Promise<{ lat: number; lng: number } | null>
}

/** Id sintético de un cliente nuevo que aún no existe (solo vive en el preview, nunca se persiste). */
const CLIENTE_NUEVO_PREVIEW_ID = '__cliente_nuevo__'

const ESTADOS_ENTREGA_VALIDOS = ['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'NO_ENTREGADO']

export class PreviewPedidoUseCase {
  constructor(private deps: PreviewPedidoDeps) {}

  async execute(input: PreviewPedidoInput): Promise<PreviewPedidoResult> {
    const canal = input.canal ?? 'DOMICILIO'
    const origen = input.origen ?? 'PEDIDO'
    const esEdicion = Boolean(input.pedidoId)

    // B-19 (#346): cliente nuevo aún sin persistir. Se resuelve igual que el
    // commit (`CrearPedidoUseCase`): si el teléfono ya pertenece a un cliente,
    // es ese cliente (con su límite, bloqueo y precios); si no, es un cliente
    // sin historial. Nada se crea en el preview.
    let clienteId = input.clienteId
    let cliente: ClienteBasico | null = null
    let esClienteNuevo = false
    if (!clienteId && input.clienteNuevo) {
      const existente = await this.deps.clienteRepo.findByTelefono(input.clienteNuevo.telefono)
      if (existente) {
        clienteId = existente.id
      } else {
        esClienteNuevo = true
        clienteId = CLIENTE_NUEVO_PREVIEW_ID
        cliente = {
          id: CLIENTE_NUEVO_PREVIEW_ID,
          nombre: input.clienteNuevo.nombre,
          apellido: input.clienteNuevo.apellido,
          telefono: input.clienteNuevo.telefono,
          direccion: input.clienteNuevo.direccion,
          barrio: input.clienteNuevo.barrio,
          bloqueado: false,
          verificado: false,
          creadoPorRol: 'ASISTENTE',
          limitePedidosFiados: null,
          preciosEspeciales: null,
        }
      }
    }
    if (!clienteId) throw new ClienteNotFoundError('')
    const esAnonimo = clienteId === CANONICAL_CONSUMIDOR_FINAL_ID

    if (!cliente) {
      cliente = await this.deps.clienteRepo.findById(clienteId)
      if (!cliente) throw new ClienteNotFoundError(clienteId)
    }

    const negocio = input.negocioId
      ? await this.deps.clienteRepo.findNegocioById(input.negocioId)
      : null

    if (input.pedidoOrigenId) {
      const origenPedido = await this.deps.pedidoRepo.findById(PedidoId.from(input.pedidoOrigenId))
      if (!origenPedido) throw new PedidoOrigenNotFoundError(input.pedidoOrigenId)
    }

    // ── Modo edición: el PUT /api/pedidos/[id] es declarativo de items y
    // conserva los pagos existentes. `totalPagado` NO viene del body, y el
    // `estadoEntrega` no cambia (el PUT proyecta el estadoPago contra el
    // estadoEntrega actual, no contra 'PENDIENTE'). ──
    let totalPagadoBase = 0
    let estadoEntregaExistente: string | null = null
    // Destino propio del pedido existente (snapshot de texto + ubicación) — para
    // decidir, igual que ActualizarPedidoUseCase, si la edición CAMBIA el destino.
    let destinoExistente: { direccion: string | null; barrio: string | null; lat: number | null; lng: number | null } | null = null
    if (esEdicion) {
      const existente = await this.deps.pedidoRepo.findById(PedidoId.from(input.pedidoId as string))
      if (!existente) throw new PedidoNotFoundError(input.pedidoId as string)
      totalPagadoBase = existente.totalPagado.toDecimal()
      estadoEntregaExistente = existente.estadoEntrega.get()
      destinoExistente = {
        direccion: existente.direccionEntrega ?? null,
        barrio: existente.barrioEntrega ?? null,
        lat: existente.entregaLat ?? null,
        lng: existente.entregaLng ?? null,
      }
    }

    // ── Pricing (mismo port que CrearPedidoUseCase) ──
    const activeCodes = [...new Set(input.items.map(i => i.producto))] as ProductCode[]
    const pricingData = await this.deps.pricingPort.loadPricingContext(esClienteNuevo ? CANONICAL_CONSUMIDOR_FINAL_ID : clienteId, input.negocioId ?? null, activeCodes)
    const resueltos = await this.deps.pricingPort.resolverPrecios(
      input.items.map(i => ({ codigo: i.producto as ProductCode, cantidad: i.cantidad, precioManual: i.precioManual })),
      canal,
      pricingData,
    )

    const items: PreviewCalculationItem[] = resueltos.map(r => ({
      producto: r.producto,
      cantidad: r.cantidad,
      precioUnitario: r.precio, // ya incluye recargo domicilio si aplica
      subtotal: r.subtotal, // = r.precio × r.cantidad
      precioOrigen: r.origen,
    }))

    // ── Semántica de cálculo (contrato) ──
    const total = items.reduce((s, i) => s + i.subtotal, 0)
    const recargoDomicilio = canal === 'DOMICILIO'
      ? resueltos.reduce((acc, r) => {
          // Solo el precio base lleva recargo; manual, especial y volumen son finales (#493).
          const cfg = pricingData.productosByCode[r.producto]
          return acc + (r.origen === 'base' && cfg?.aplicaDomicilio ? cfg.sobreCostoDomicilio * r.cantidad : 0)
        }, 0)
      : 0
    const subtotal = total - recargoDomicilio

    // ── Pagos ──
    // Creación: proyección virtual de `input.pagos` con las reglas existentes.
    // Edición: el PUT es declarativo de items y conserva los pagos → `totalPagado`
    // es el del pedido existente; el saldo a favor no cambia en este flujo.
    const { pagosAplicados, excedente } = normalizarPagos(
      (esEdicion ? [] : (input.pagos ?? [])).map(p => ({ metodo: p.metodo, monto: p.monto })),
      total,
    )
    const totalPagado = esEdicion ? totalPagadoBase : pagosAplicados.reduce((s, p) => s + p.monto, 0)
    // CONSUMIDOR_FINAL no acumula saldo a favor: el excedente es cambio
    // entregado (paridad con CrearPedidoUseCase, HUB_REVISION_INTEGRAL §11).
    const saldoFavorProyectado = esEdicion || esAnonimo ? 0 : excedente
    // Edición: el estadoEntrega no cambia — se proyecta el estadoPago contra el
    // actual (igual que ActualizarPedidoUseCase). Creación: PENDIENTE/ENTREGADO.
    // Creación: MISMA función que CrearPedidoUseCase (respeta el origen: antes el
    // preview ignoraba `origen` y proyectaba distinto al commit).
    const estadoEntregaProyectado = (esEdicion && estadoEntregaExistente
      ? estadoEntregaExistente
      : estadoEntregaAlCrear({ origen, canal: input.canal, entregado: input.entregado })
    ) as PreviewPedidoResult['calculation']['estadoEntregaProyectado']
    const saldoProyectado = calcularSaldo(total, totalPagado)
    const estadoPagoProyectado = calcularEstadoPago(total, totalPagado, estadoEntregaProyectado) as
      PreviewPedidoResult['calculation']['estadoPagoProyectado']

    const tienePrecioManual = resueltos.some(r => r.origen === 'manual')

    // ── Permissions + warnings ──
    const warnings: PreviewPedidoResult['warnings'] = []
    let canCreate = true
    let excepcionAplicada: PreviewPedidoResult['excepcionAplicada']
    let excepcionNoAplica: PreviewPedidoResult['excepcionNoAplica']
    let credito: PreviewPedidoResult['credito']

    // El límite de fiados es un guard de ALTA — editar un pedido existente no
    // crea un nuevo fiado, así que no aplica en modo edición. El bloqueo por
    // cliente.bloqueado sí se conserva en edición: es un chequeo local (el
    // dato ya está cargado), no requiere la autoridad de crédito.
    if (esEdicion) {
      if (!esAnonimo && cliente.bloqueado && totalPagado < total) {
        canCreate = false
        warnings.push({ code: 'CLIENTE_BLOQUEADO', message: 'Cliente bloqueado por deuda vencida. Pague primero.' })
      }
    } else if (esAnonimo) {
      // P0 (HUB_REVISION_INTEGRAL §1/§5): saldo pendiente exige deudor
      // identificado — misma regla que CrearPedidoUseCase (DEUDOR_REQUERIDO).
      if (totalPagado < total) {
        canCreate = false
        warnings.push({
          code: 'DEUDOR_REQUERIDO',
          message: 'Falta registrar el pago. Para dejar saldo pendiente, identifica al cliente que queda debiendo.',
          field: 'pagos',
        })
      }
    } else if (!esClienteNuevo) {
      // (cliente nuevo: sin fiados abiertos; el commit revalida con la autoridad)
      // F1 (Autoridad de Crédito): misma autoridad que usan CrearPedidoUseCase
      // y venta-libre — mismo guard `totalPagado < total` ya vigente, ahora
      // evaluado DENTRO de GetFiadoStatusUseCase en vez de acá. `errorDeuda`
      // es la única fuente de la decisión; `cliente.bloqueado` solo elige
      // qué código de warning mostrar (bloqueado vs límite), no decide nada.
      const fiado = await this.deps.getFiadoStatusUseCase.execute({
        clienteId,
        operacion: { total, totalPagado },
        excepcionId: input.excepcionId,
      })
      if (fiado.errorDeuda) {
        canCreate = false
        warnings.push({
          code: cliente.bloqueado ? 'CLIENTE_BLOQUEADO' : 'FIADO_SOBRE_LIMITE',
          message: fiado.errorDeuda,
        })
      } else if (fiado.excepcionAplicada) {
        // F2: no se reinterpreta — se repropaga tal cual lo resolvió la autoridad.
        excepcionAplicada = fiado.excepcionAplicada
      }
      if (fiado.excepcionNoAplica) {
        excepcionNoAplica = fiado.excepcionNoAplica
        warnings.push({
          code: 'EXCEPCION_NO_APLICA',
          message: fiado.excepcionNoAplica.motivo === 'VENCIDA'
            ? 'La excepción autorizada ya venció (vale solo el día en que se autorizó). Pide una nueva.'
            : `La excepción autorizada cubre un saldo de hasta $${Math.round(fiado.excepcionNoAplica.saldoAutorizado).toLocaleString('es-CO')}; esta venta deja más. Pide una nueva.`,
        })
      }
      // P0-3 (#357): números de la Autoridad de Crédito para el panel del Hub.
      credito = {
        limite: fiado.limite,
        abiertos: fiado.count,
        saldoAbierto: fiado.outstandingAmount,
        saldoOperacion: fiado.operationOutstanding ?? 0,
        abiertosDespues: fiado.projectedOpenCount ?? fiado.count,
        saldoDespues: fiado.projectedOutstandingAmount ?? fiado.outstandingAmount,
        bloqueado: Boolean(fiado.errorDeuda),
        causa: fiado.errorDeuda ? (cliente.bloqueado ? 'CLIENTE_BLOQUEADO' : 'LIMITE') : undefined,
      }
    }

    // ── Suficiencia de la información de entrega (autoridad única de dominio).
    // Si no hay coords almacenadas pero hay linkUbicacion → intentar resolverlo
    // server-side (best-effort) para pasar coords ya resueltas a `resolverEntrega`.
    const efectivoLink = (negocio?.linkUbicacion ?? cliente.linkUbicacion) || null
    const hayCoordsAlmacenadas =
      (negocio?.lat != null && negocio?.lng != null) || (cliente.lat != null && cliente.lng != null)
    const coordsDeLink =
      canal === 'DOMICILIO' && !hayCoordsAlmacenadas && efectivoLink
        ? await this.deps.resolverCoordsDeLink(efectivoLink)
        : null

    // Ubicación propia del pedido (destino puntual). Creación: la del input.
    // Edición: la del pedido existente salvo que el input la toque (igual que
    // ActualizarPedidoUseCase).
    const tocaUbicacion = esEdicion
      ? input.entregaLat !== undefined || input.entregaLng !== undefined
      : input.entregaLat != null || input.entregaLng != null
    const quitaUbicacion = tocaUbicacion && input.entregaLat == null && input.entregaLng == null
    const ubicacionInput = tocaUbicacion && !quitaUbicacion
      ? ubicacionEntregaValida(input.entregaLat, input.entregaLng)
      : null
    if (tocaUbicacion && !quitaUbicacion && !ubicacionInput) {
      canCreate = false
      warnings.push({
        code: 'UBICACION_ENTREGA_INVALIDA',
        message: 'La ubicación del domicilio debe traer latitud y longitud válidas.',
        field: 'ubicacion',
      })
    } else if (ubicacionInput && canal !== 'DOMICILIO') {
      canCreate = false
      warnings.push({
        code: 'UBICACION_SOLO_DOMICILIO',
        message: 'La ubicación de destino solo aplica a pedidos a domicilio.',
        field: 'ubicacion',
      })
    }
    const coordsExistentes = destinoExistente && destinoExistente.lat != null && destinoExistente.lng != null
      ? { lat: destinoExistente.lat, lng: destinoExistente.lng }
      : null
    const pedidoCoords = !tocaUbicacion ? coordsExistentes : ubicacionInput

    const entrega = resolverEntrega({
      canal,
      pedidoCoords,
      overrideDireccion: input.direccionEntrega,
      overrideBarrio: input.barrioEntrega,
      cliente: {
        direccion: cliente.direccion, barrio: cliente.barrio, referencia: cliente.referencia,
        linkUbicacion: cliente.linkUbicacion, lat: cliente.lat, lng: cliente.lng, geocodeOrigen: cliente.geocodeOrigen,
      },
      negocio: negocio
        ? { direccion: negocio.direccion, barrio: negocio.barrio, referencia: negocio.referencia, linkUbicacion: negocio.linkUbicacion, lat: negocio.lat, lng: negocio.lng }
        : null,
      coordsDeLink,
    })

    // ¿Se exige la suficiencia? MISMA decisión que Crear/Actualizar (D3): hay
    // mercancía pendiente en un DOMICILIO — el carácter anónimo del cliente NO
    // es una excepción. En edición solo si CAMBIA el destino efectivo (D2).
    let gateaSuficiencia = requiereEntregaSuficiente({ canal, estadoEntrega: estadoEntregaProyectado, origen })
    if (gateaSuficiencia && esEdicion && destinoExistente) {
      const actualTexto = pickDireccionTexto({ cliente, negocio })
      const dirActual = destinoExistente.direccion ?? actualTexto.direccion
      const barrioActual = destinoExistente.barrio ?? actualTexto.barrio
      gateaSuficiencia = destinoEfectivoCambia(
        { direccion: dirActual, barrio: barrioActual, lat: coordsExistentes?.lat ?? null, lng: coordsExistentes?.lng ?? null },
        {
          direccion: input.direccionEntrega !== undefined ? (input.direccionEntrega ?? '') : dirActual,
          barrio: input.barrioEntrega !== undefined ? (input.barrioEntrega ?? '') : barrioActual,
          lat: pedidoCoords?.lat ?? null,
          lng: pedidoCoords?.lng ?? null,
        },
      )
    }

    if (gateaSuficiencia && entrega.estado === 'INSUFICIENTE') {
      canCreate = false
      warnings.push({
        code: 'ENTREGA_INSUFICIENTE',
        message: origen === 'VENTA_RAPIDA'
          ? 'Falta la dirección de entrega: escríbela o agrega una ubicación.'
          : 'Necesitamos información para localizar el domicilio: una dirección escrita o una ubicación.',
        field: 'direccion',
      })
    } else if (gateaSuficiencia && entrega.estado === 'SUFICIENTE_COMPLEMENTARIA_FALTANTE') {
      warnings.push({
        code: 'ENTREGA_COMPLEMENTARIA',
        message: 'Puedes continuar. Agregar ' + entrega.faltaComplementario.join(' y ') + ' puede facilitar la entrega.',
      })
    }

    if (tienePrecioManual) {
      warnings.push({ code: 'PRECIO_MANUAL_APLICADO', message: 'Se aplicó un precio manual a uno o más productos.' })
    }

    const allowedActions: PreviewPedidoResult['allowedActions'] = []
    if (canCreate) {
      if (esEdicion) {
        allowedActions.push('actualizar')
      } else {
        allowedActions.push('crear')
        if (estadoEntregaProyectado === 'PENDIENTE') allowedActions.push('crear-y-enviar-a-ruta')
      }
    }

    // hoy no se restringe para ADMIN/ASISTENTE — la política de umbral es
    // PENDIENTE DE NEGOCIO (§8.2 del blueprint).
    const canSetManualPrice = true

    // ── Risk signals (detector detectivo — señal ≠ bloqueo).
    // CONSUMIDOR_FINAL = ausencia de cliente real: sin historial ni riesgo. ──
    let riskSignals: PreviewPedidoResult['riskSignals'] = []
    if (!esAnonimo) {
      const [pedidosRecientesRaw, precioMinimos] = await Promise.all([
        esClienteNuevo
          ? Promise.resolve([])
          : this.deps.pedidoRepo.findMany(
              { clienteId, estadoEntrega: ESTADOS_ENTREGA_VALIDOS },
              { take: 6, orderBy: 'desc' },
            ),
        this.deps.getPrecioMinimos(),
      ])
      // en edición, el propio pedido no debe compararse contra sí mismo.
      const pedidosRecientes = (esEdicion
        ? pedidosRecientesRaw.filter(p => readEntityId(p) !== input.pedidoId)
        : pedidosRecientesRaw
      ).slice(0, 5)
      const historial = pedidosRecientes.map((p, idx) =>
        pedidoEntityToPedidoBase(p as never, readEntityId(p) ?? `__real_${idx}__`),
      )
      const draft = draftToPedidoBase({
        clienteId,
        canal,
        resolvedItems: resueltos,
        total,
        saldo: saldoProyectado,
        nowIso: new Date().toISOString(),
      })
      const alertas = calcularAlertasCliente(
        {
          id: cliente.id,
          nombre: cliente.nombre ?? '',
          telefono: cliente.telefono ?? '',
          verificado: cliente.verificado,
          bloqueado: cliente.bloqueado,
          creadoPorRol: cliente.creadoPorRol,
        },
        [...historial, draft],
        { precioMinimos },
      )
      riskSignals = alertas.map(a => ({ tipo: a.tipo, severidad: a.severidad, detalle: a.detalle }))
    }

    return {
      calculation: {
        items,
        subtotal,
        recargoDomicilio,
        total,
        totalPagado,
        saldoProyectado,
        saldoFavorProyectado,
        estadoEntregaProyectado,
        estadoPagoProyectado,
      },
      permissions: { canCreate, canSetManualPrice },
      allowedActions,
      warnings,
      riskSignals,
      excepcionAplicada,
      excepcionNoAplica,
      credito,
      entrega,
      requiresAuthorization: false,
      auditPreview: {
        actor: input.actorId,
        accion: esEdicion ? 'ACTUALIZAR_PEDIDO' : 'CREAR_PEDIDO',
        recurso: esEdicion ? 'Pedido (edición)' : 'Pedido (nuevo)',
        valoresRelevantes: { total, clienteId, canal, origen, tienePrecioManual },
      },
    }
  }
}

/** El id de la entidad Pedido es un VO PedidoId (`.get()`). Defensa por si el
 *  repo devuelve otra forma — el detector solo necesita un id único y estable. */
function readEntityId(p: unknown): string | undefined {
  const id = (p as { id?: unknown }).id
  if (typeof id === 'string') return id
  if (id && typeof (id as { get?: unknown }).get === 'function') return (id as { get(): string }).get()
  return undefined
}
