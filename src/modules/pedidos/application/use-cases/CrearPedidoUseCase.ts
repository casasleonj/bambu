/**
 * CrearPedidoUseCase.
 *
 * Orchestrates the creation of a Pedido including:
 * - Client resolution/creation
 * - Credit limit validation
 * - Price resolution
 * - Transactional persistence (Pedido + Items + Pagos + Factura)
 */

import { Money } from '@/shared/domain'
import { getNextNumero } from '@/lib/sequence'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { Pedido } from '../../domain/entities/Pedido'
import { PedidoItem } from '../../domain/entities/PedidoItem'
import { PedidoId } from '../../domain/value-objects/PedidoId'
import { CanalVO } from '../../domain/value-objects/Canal'
import { OrigenPedidoVO } from '../../domain/value-objects/OrigenPedido'
import { EstadoEntregaVO } from '../../domain/value-objects/EstadoEntrega'
import { EstadoPagoVO } from '../../domain/value-objects/EstadoPago'
import type { IPedidoRepository } from '../../domain/repositories/IPedidoRepository'
import type { IFacturaRepository } from '../../domain/repositories/IFacturaRepository'
import type { IPagoRepository } from '../../domain/repositories/IPagoRepository'
import type { IClienteRepository } from '../../domain/repositories/IClienteRepository'
import type { IPricingPort } from '../../domain/repositories/IPricingPort'
import { puedeCrearPedido, resolverLimiteFiados } from '../../domain/services/pedido-validation.service'
import { normalizarPagos } from '../../domain/services/pagos-calculator.service'
import type { ITransactionManager } from '../../infrastructure/transactions/PrismaTransactionManager'
import type { CrearPedidoInput, CrearPedidoResult } from '../dto'
import { PedidoDTOMapper } from '../dto/PedidoDTOMapper'
import { pickDireccionTexto } from '@/lib/geo/pedido-direccion'
import { ensureConsumidorFinalCanonical, isConsumidorFinalCanonical } from '@/lib/cliente-canonical'
import { getFacturaEmpresaSnapshot } from '@/lib/factura-empresa'
import { registrarReceivableEntry } from '@/lib/receivable-entry'

export class CrearPedidoUseCase {
  constructor(
    private pedidoRepo: IPedidoRepository,
    private facturaRepo: IFacturaRepository,
    private pagoRepo: IPagoRepository,
    private clienteRepo: IClienteRepository,
    private pricingPort: IPricingPort,
    private txManager: ITransactionManager,
  ) {}

  async execute(input: CrearPedidoInput): Promise<CrearPedidoResult> {
    // Snapshot de empresa fuera del lock: lectura simple de Config,
    // no genera contención y no cambia durante la tx.
    const empresaSnapshot = await getFacturaEmpresaSnapshot()

    // FASE 0 (ADR-CONCURRENCIA-001): lock `SECUENCIA:pedido` — la creación
    // de pedido usa getNextNumero(model:'pedido') con fallback MAX+1 (no
    // secuencia atómica), por lo que el número de pedido exige serialización
    // global de todas las creaciones de pedido (incluye hijos de entrega y
    // ventas libres). En FASE 8, cuando Pedido.numero migre a secuencia
    // atómica, este lock se refina a `CARTERA:{clienteId}` (saldoFavor/límite
    // de fiados) según §6.
    return this.txManager.executeWithLock('SECUENCIA', 'pedido', async (tx) => {
      // FIX F-N10: dedup por offlineId DENTRO del lock.
      // Antes: la route hacía findUnique FUERA del lock (línea 151-153
      // de pedidos/route.ts antes del fix). Dos requests idénticos
      // (mismo offlineId) llegaban casi simultáneos, ambos pasaban
      // el check (findUnique retorna null porque el primero no ha
      // commiteado), ambos entraban al use case, el segundo chocaba
      // con la unique constraint de Pedido.offlineId → P2002 → 500.
      // Ahora: el check corre dentro del lock. El segundo request
      // ve el pedido ya creado y retorna deduped: true.
      if (input.offlineId) {
        const existente = await this.pedidoRepo.findByOfflineId(input.offlineId, tx)
        if (existente) {
          return {
            pedido: PedidoDTOMapper.toResumen(existente),
            clienteId: existente.clienteId,
            deduped: true,
          }
        }
      }

      // 1. Resolve/create cliente
      let clienteId = input.clienteId

      if (input.clienteNuevo) {
        const existente = await this.clienteRepo.findByTelefono(input.clienteNuevo.telefono, tx)
        if (existente) {
          clienteId = existente.id
        } else {
          const nuevo = await this.clienteRepo.create({
            nombre: input.clienteNuevo.nombre,
            apellido: input.clienteNuevo.apellido,
            telefono: input.clienteNuevo.telefono,
            direccion: input.clienteNuevo.direccion,
            barrio: input.clienteNuevo.barrio,
            fuente: input.clienteNuevo.fuente,
            creadoPorRol: input.createdByRole || 'ASISTENTE',
          }, tx)
          clienteId = nuevo.id
        }
      }

      // 2. Validate cliente exists
      // FIX consumidor-final-duplicado: el cliente canónico usa el id literal
      // CANONICAL_CONSUMIDOR_FINAL_ID. Si no existe (entorno sin seed/migración),
      // lo aseguramos atómicamente con el helper para evitar generar un CUID
      // nuevo y duplicar el registro en futuras ventas anónimas.
      if (isConsumidorFinalCanonical(clienteId)) {
        await ensureConsumidorFinalCanonical(tx)
      }

      const cliente = await this.clienteRepo.findById(clienteId, tx)
      if (!cliente) {
        throw new Error('CLIENTE_NOT_FOUND')
      }

      // 3. Update cliente address if needed
      // NUNCA aplicar si el destino del pedido es un negocio/sucursal: en ese
      // caso actualizarCliente traería la dirección del negocio, no una
      // edición real de la dirección propia del cliente (ver bug silencioso
      // donde la dirección del cliente quedaba pisada por la del negocio).
      if (input.actualizarCliente && !input.negocioId && !isConsumidorFinalCanonical(clienteId) && cliente) {
        await this.clienteRepo.updateDireccion(
          clienteId,
          input.actualizarCliente.direccion || '',
          input.actualizarCliente.barrio,
          tx,
          { usuarioId: input.createdById },
        )
        // Reflejar el update en el objeto en memoria: el snapshot de abajo
        // compara contra la dirección resuelta, y si no se actualiza acá
        // seguiría viendo el valor viejo de `cliente` y guardaría un
        // snapshot redundante (dirección puntual == dirección ya persistida).
        cliente.direccion = input.actualizarCliente.direccion || ''
        cliente.barrio = input.actualizarCliente.barrio
      }

      // 3b. Snapshot de dirección puntual del pedido (Pedido.direccionEntrega/
      // barrioEntrega). Nunca toca Cliente/Negocio — es un dato propio del
      // pedido. Se persiste SOLO si el texto tipeado difiere de la dirección
      // resuelta en vivo (negocio gana, fallback cliente vía
      // pickDireccionTexto), para no duplicar en cada pedido un dato que ya
      // coincide con lo guardado. Aplica independientemente del checkbox
      // "solo para este pedido" — ese checkbox solo decide si además se
      // actualiza Cliente.direccion.
      let direccionEntregaSnapshot: string | undefined
      let barrioEntregaSnapshot: string | undefined
      if (input.direccionEntrega || input.barrioEntrega) {
        const negocioParaDireccion = input.negocioId
          ? await this.clienteRepo.findNegocioById(input.negocioId, tx)
          : null
        const resuelta = pickDireccionTexto({
          cliente: { direccion: cliente.direccion, barrio: cliente.barrio },
          negocio: negocioParaDireccion,
        })
        if (
          (input.direccionEntrega || '') !== resuelta.direccion ||
          (input.barrioEntrega || '') !== resuelta.barrio
        ) {
          direccionEntregaSnapshot = input.direccionEntrega
          barrioEntregaSnapshot = input.barrioEntrega
        }
      }

      // 4. Resolve prices
      const activeCodes = input.items.filter(i => i.cantidad > 0).map(i => i.producto)
      const pricingData = await this.pricingPort.loadPricingContext(clienteId, input.negocioId, activeCodes, tx)
      const preciosResueltos = await this.pricingPort.resolverPrecios(
        input.items.filter(i => i.cantidad > 0).map(i => ({
          codigo: i.producto,
          cantidad: i.cantidad,
          precioManual: i.precioManual,
        })),
        input.canal,
        pricingData,
      )

      // 5. Build domain entities
      const canal = CanalVO.create(input.canal)
      const origen = input.ventaRapida ? OrigenPedidoVO.create('VENTA_RAPIDA') : OrigenPedidoVO.create(input.origen || 'PEDIDO')
      const estadoEntrega = origen.isVentaRapida() ? EstadoEntregaVO.create('ENTREGADO') : EstadoEntregaVO.create('PENDIENTE')
      const total = preciosResueltos.reduce((sum, pr) => sum + pr.subtotal, 0)

      // FIX Fase 2 §3.4: aplicar saldo a favor disponible del cliente
      // antes de calcular lo que falta pagar. Si saldoFavor cubre
      // parcialmente el pedido, se acredita esa parte.
      const saldoFavorDisponible = await this.clienteRepo.getSaldoFavor(clienteId, tx)
      const montoCredito = Math.min(saldoFavorDisponible, total)
      if (montoCredito > 0) {
        await this.clienteRepo.aplicarSaldoFavor(clienteId, montoCredito, tx)
      }
      const totalDespuesCredito = total - montoCredito

      // FIX Fase 2 §3.4: el normalizarPagos ahora devuelve { pagosAplicados, excedente }
      const { pagosAplicados: pagosNormalizados, excedente } = normalizarPagos(input.pagos || [], totalDespuesCredito)
      const totalPagado = pagosNormalizados.reduce((sum, p) => sum + p.monto, 0) + montoCredito
      // G5.1: un pedido normal pagado completo pero aún no entregado →
      // ANTICIPADO (venta rápida sí es ENTREGADO → PAGADO).
      const estadoPago = EstadoPagoVO.proyectar(total, totalPagado, estadoEntrega.get())

      // 6. Validate credit limit — solo si el pedido va a quedar con saldo
      // pendiente (fiado real). Un pedido pagado de contado (o cubierto por
      // saldo a favor, ver montoCredito arriba) no debe bloquearse por el
      // límite de fiados histórico del cliente: bloquear ventas ya pagadas
      // contradice el propósito del límite (evitar más deuda) y rompe Venta
      // Rápida ("paga en el momento") para clientes que ya están al límite.
      // Mismo criterio que /api/pedidos/venta-libre. Se evalúa acá (no antes
      // de calcular totalPagado) porque recién en este punto se sabe si el
      // pedido quedará fiado.
      if (totalPagado < total) {
        const pedidosPendientes = await this.pedidoRepo.findPendingByCliente(clienteId, tx)
        const configLimite = await tx.config.findUnique({
          where: { clave: 'LIMITE_PEDIDOS_FIADOS_DEFAULT' },
          select: { valor: true },
        })
        const limite = resolverLimiteFiados(cliente ?? {}, configLimite?.valor ?? null)
        const errorDeuda = puedeCrearPedido(
          { id: clienteId, bloqueado: cliente?.bloqueado ?? false, verificado: cliente?.verificado ?? false, creadoPorRol: cliente?.creadoPorRol || '' },
          pedidosPendientes,
          limite,
        )
        if (errorDeuda) {
          throw new Error(`CLIENTE_DEBE: ${errorDeuda}`)
        }
      }

      // FIX Fase 2 §3.4: si hay excedente sobre el saldo restante, se acredita al cliente
      if (excedente > 0) {
        await this.clienteRepo.incrementarSaldoFavor(clienteId, excedente, tx)
      }

      const items = preciosResueltos.map(pr =>
        new PedidoItem(
          pr.producto,
          pr.cantidad,
          Money.fromDecimal(pr.precio),
          pr.origen,
          origen.isVentaRapida() ? pr.cantidad : 0,
        ),
      )

      const numero = await getNextNumero(tx, { model: 'pedido', field: 'numero' })

      const pedido = Pedido.create({
        id: PedidoId.from(''), // Will be assigned by Prisma
        numero,
        clienteId,
        negocioId: input.negocioId,
        canal,
        origen,
        estadoEntrega,
        estadoPago,
        items,
        total: Money.fromDecimal(total),
        totalPagado: Money.fromDecimal(totalPagado),
        pagos: pagosNormalizados,
        fecha: new Date(),
        fechaEntrega: input.fechaEntrega,
        obs: input.obs,
        direccionEntrega: direccionEntregaSnapshot,
        barrioEntrega: barrioEntregaSnapshot,
        createdById: input.createdById,
      })

      // 7. Persist
      const saved = await this.pedidoRepo.save(pedido, tx, { offlineId: input.offlineId })
      logger.info(
        { pedidoId: saved.id.get(), numero: saved.numero, clienteId, total, offlineId: input.offlineId ?? null },
        'Pedido created'
      )

      // 8. Persist pagos
      if (pagosNormalizados.length > 0) {
        await this.pagoRepo.createMany(saved.id.get(), pagosNormalizados, tx)
      }

      // 9. Create factura
      const facturaNum = await getNextNumero(tx, { model: 'factura', field: 'numero' })
      await this.facturaRepo.create({
        numero: `FAC-${facturaNum.toString().padStart(5, '0')}`,
        subtotal: total,
        total,
        saldo: total - totalPagado,
        estado: totalPagado >= total ? 'PAGADA' : (totalPagado > 0 ? 'PARCIAL' : 'EMITIDA'),
        montoPagado: totalPagado,
        empresaNombre: empresaSnapshot.empresaNombre,
        empresaNit: empresaSnapshot.empresaNit,
        empresaDireccion: empresaSnapshot.empresaDireccion,
        empresaTelefono: empresaSnapshot.empresaTelefono,
        empresaEmail: empresaSnapshot.empresaEmail,
      }, saved.id.get(), clienteId, tx)

      // 10. Audit
      await logAudit({
        entidad: 'Pedido',
        registroId: saved.id.get(),
        accion: 'CREATE',
        datos: { numero: saved.numero, origen: origen.get(), tipo: canal.get(), total, clienteId },
        usuarioId: input.createdById,
      }, tx)

      // FASE 5 (ADR-MONETARIO-001, §12): proyección de auditoría de los pagos
      // iniciales, en la MISMA transacción del Pago.
      if (totalPagado > 0) {
        await registrarReceivableEntry(tx, {
          pedidoId: saved.id.get(),
          clienteId,
          tipo: 'PAGO',
          monto: totalPagado,
          saldoResultante: total - totalPagado,
          totalPagadoResultante: totalPagado,
          offlineId: input.offlineId ?? null,
        })
      }

      return {
        pedido: PedidoDTOMapper.toResumen(saved),
        clienteId,
      }
    })
  }
}
