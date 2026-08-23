/**
 * CerrarEmbarqueUseCase.
 *
 * Closes an embarque: processes pedidos, creates child pedidos for partials,
 * creates ventas libres, reconciles products, calculates discrepancies,
 * creates descuentos, creates gastos, and updates facturas.
 *
 * Architecture notes (F4.10 refactor):
 * - ProcesarPedidoService handles per-pedido delivery logic.
 * - CrearVentasLibresService handles free-sale pedido creation.
 * - CierreEmbarqueService holds pure domain logic for reconciliation and cash.
 * - CrearDescuentoDiscrepanciaService creates worker discounts.
 * - CerrarEmbarqueSideEffectsService creates gastos and updates returned products.
 * - Cash-collection helpers live in cerrar-embarque-caja.helper.ts.
 *
 * This keeps the use case as an orchestrator rather than a 500-line god method.
 * It formerly was a 582-line route handler, then a 398-line use case, and is now
 * kept intentionally compact by delegating responsibilities to domain services.
 */

import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { acquireAdvisoryLockTx } from '@/lib/locks'

import type { IEmbarqueRepository } from '../../domain/repositories/IEmbarqueRepository'
import type { IGastoEmbarqueRepository } from '../../domain/repositories/IGastoEmbarqueRepository'
import type { IEmbarqueProductoRepository } from '../../domain/repositories/IEmbarqueProductoRepository'
import { EmbarqueTransitionsService } from '../../domain/services/embarque-transitions.service'
import { CierreEmbarqueService } from '../../domain/services/cierre-embarque.service'
import { ProcesarPedidoService } from '../../domain/services/procesar-pedido.service'
import { CrearVentasLibresService } from '../../domain/services/crear-ventas-libres.service'
import { CrearDescuentoDiscrepanciaService } from '../../domain/services/crear-descuento-discrepancia.service'
import { CrearDeudaFaltanteCajaService } from '../../domain/services/crear-deuda-faltante-caja.service'
import { CerrarEmbarqueSideEffectsService } from '../../domain/services/cerrar-embarque-side-effects.service'
import { CierreDedupService } from '../../domain/services/cierre-dedup.service'
import { RegistrarMovimientosCierre } from '../../domain/services/registrar-movimientos-cierre.service'
import type { PedidoRawInput } from '../../domain/services/procesar-pedido.service'
import { Carga, type ProductCode } from '../../domain/value-objects/Carga'
import { EstadoEmbarque as EstadoEmbarqueVO } from '../../domain/value-objects/EstadoEmbarque'
import type { CerrarEmbarqueInput, CierreResultadoDTO } from '../dto'
import type { ITransactionManager } from '../../infrastructure/transactions/PrismaTransactionManager'
import { coleccionarPagos, calcularCajaFinal } from './cerrar-embarque-caja.helper'

type TxOrPrisma = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * A.3.4: señal interna para abortar el commit de un cierre en modo
 * `dryRun`. Se lanza DESPUÉS de calcular el resultado completo (mismos
 * side effects, misma lógica que un cierre real) pero ANTES de que
 * `execute()` retorne — Prisma hace rollback automático de la tx al
 * ver un throw dentro del callback de `$transaction`, y re-lanza el
 * mismo error sin envolverlo. `execute()` la captura y devuelve
 * `result` como si fuera un retorno normal. Ningún dato del dry-run
 * llega a persistirse.
 */
class DryRunSignal extends Error {
  constructor(public readonly result: CierreResultadoDTO) {
    super('DRY_RUN_ROLLBACK')
  }
}

export class CerrarEmbarqueUseCase {
  private readonly transitions = new EmbarqueTransitionsService()

  constructor(
    private readonly embarqueRepo: IEmbarqueRepository,
    private readonly gastoRepo: IGastoEmbarqueRepository,
    private readonly productoRepo: IEmbarqueProductoRepository,
    private readonly txManager: ITransactionManager,
    private readonly userId?: string,
    private readonly userRole?: string,
    // FIX F4.10-c: inyectar CierreEmbarqueService para delegar la
    // conciliación de productos en vez de duplicar la lógica.
    // Default: nueva instancia (backward compatible con callers existentes).
    private readonly cierreService: CierreEmbarqueService = new CierreEmbarqueService(),
    // FIX F4.10-a: inyectar ProcesarPedidoService para delegar el
    // procesamiento de pedidos individuales (entregado/parcial/no entregado)
    // en vez de tener ~119 líneas inline en este use case.
    // Default: nueva instancia (backward compatible con callers existentes).
    private readonly procesarPedidoService: ProcesarPedidoService = new ProcesarPedidoService(),
    // FIX F4.10-b: inyectar CrearVentasLibresService para delegar
    // la creación de ventas libres (~104 líneas inline).
    // Default: nueva instancia (backward compatible con callers existentes).
    private readonly crearVentasLibresService: CrearVentasLibresService = new CrearVentasLibresService(),
    // FIX F4.10-c: inyectar CrearDescuentoDiscrepanciaService para
    // delegar la creación de descuentos por discrepancia (~35 líneas).
    // Default: nueva instancia (backward compatible con callers existentes).
    private readonly crearDescuentoService: CrearDescuentoDiscrepanciaService = new CrearDescuentoDiscrepanciaService(),
    // PR3: inyectar CrearDeudaFaltanteCajaService para crear deudas
    // automáticas por faltante de caja al cerrar embarque.
    // Default: nueva instancia (backward compatible con callers existentes).
    private readonly crearDeudaFaltanteService: CrearDeudaFaltanteCajaService = new CrearDeudaFaltanteCajaService(),
    // FIX F4.10-d: inyectar CerrarEmbarqueSideEffectsService para
    // delegar los side effects finales: crearGastos y actualizarProductosRetorno.
    // Default: nueva instancia (backward compatible con callers existentes).
    private readonly sideEffectsService: CerrarEmbarqueSideEffectsService = new CerrarEmbarqueSideEffectsService(),
    // FASE FINAL (dual-write §23): escribe el ledger físico del cierre.
    private readonly registrarMovimientosService: RegistrarMovimientosCierre = new RegistrarMovimientosCierre(),
    private readonly dedupService: CierreDedupService = new CierreDedupService(), // BAMBU-LOG-006
  ) {}

  async execute(input: CerrarEmbarqueInput): Promise<CierreResultadoDTO> {
    // FIX F2.2 + FASE 0 (ADR-CONCURRENCIA-001, §6 "Cierre"):
    // lock `CIERRE:{embarqueId}` (antes CIERRE global id=7). Dos cierres de
    // embarques DISTINTOS ya no se serializan. El cierre además genera pedidos
    // (ventas libres + hijos) con numeración MAX+1 no atómica, por lo que se
    // adquiere `SECUENCIA:pedido` en la MISMA tx (orden CIERRE → SECUENCIA,
    // anti-deadlock); se elimina en FASE 8 con secuencia atómica de pedido.
    try {
      return await this.txManager.executeWithLock('CIERRE', input.id, async (tx) => {
      const client = this.getTx(tx)

      await acquireAdvisoryLockTx(client, 'SECUENCIA', 'pedido')

      // 1. Verify embarque exists and can be closed
      const embarque = await this.embarqueRepo.findById(input.id, tx)
      if (!embarque) throw new Error('EMBARQUE_NOT_FOUND')

      if (this.dedupService.esReplay(embarque.estado, embarque.offlineId, input.offlineId)) {
        return this.dedupService.buildResult(client, input.id)
      }
      const transitionResult = this.transitions.cerrar(embarque.estado)
      if (!transitionResult.success) throw new Error(transitionResult.error)

      // 2. Fetch pedidos for this embarque
      const pedidosRaw = await this.fetchPedidosForEmbarque(input.id, client)

      const pedidosHijosCreados: Array<{ id: string; numero: number }> = []
      const pedidosActualizados: Array<{ id: string; estado: string }> = []
      let totalVentas = 0

      // 3. Process each pedido (delegate to ProcesarPedidoService)
      for (const cuadre of input.pedidos) {
        const pedido = pedidosRaw.find((p) => p.id === cuadre.pedidoId)
        if (!pedido) continue

        const totalReal = await this.procesarPedidoService.execute(
          client,
          pedido as Parameters<typeof this.procesarPedidoService.execute>[1],
          cuadre,
          this.userRole,
          this.userId,
          pedidosHijosCreados,
          pedidosActualizados,
        )
        totalVentas += totalReal
      }

      const ventasLibresCount = await this.crearVentasLibresService.execute(
        client,
        input.ventasLibres ?? [],
        input.id,
        this.userId,
      )

      // 5. Reconcile products
      const { totalDiscrepancia, discrepanciasPorProducto } = this.conciliarProductos(
        embarque,
        pedidosRaw,
        input.ventasLibres ?? [],
        input.productosRetorno ?? [],
      )

      // 6. Create descuento for unexplained discrepancies
      let descuentoCreado: { id: string; monto: number } | undefined
      if (totalDiscrepancia > 0 && !input.justificacionDiscrepancia) {
        descuentoCreado = await this.crearDescuentoService.execute(
          client,
          embarque.trabajadorId,
          input.id,
          discrepanciasPorProducto,
        )
      }

      // 7. Create gastos (delegate to side effects service)
      const gastosCount = await this.sideEffectsService.crearGastos(
        tx,
        input.gastos ?? [],
        input.id,
        embarque.trabajadorId,
        this.userId,
        this.gastoRepo,
      )

      // 8. Update EmbarqueProducto records (delegate to side effects service)
      await this.sideEffectsService.actualizarProductosRetorno(
        tx,
        input.id,
        input.productosRetorno ?? [],
        this.productoRepo,
      )

      // FASE FINAL (dual-write §23, ADR-FISICO-001): escribir el ledger físico
      // del cierre (ENTREGA/VENTA_RUTA/RETORNO) además de la conciliación legacy.
      await this.registrarMovimientosService.execute(client, {
        embarqueId: input.id,
        pedidosRaw,
        ventasLibres: input.ventasLibres ?? [],
        productosRetorno: input.productosRetorno ?? [],
      })

      // 9. Reconcile cash before closing to detect faltante de caja.
      const pagosColeccionados = coleccionarPagos(pedidosRaw, input.ventasLibres ?? [])
      const gastosTotal = (input.gastos ?? []).reduce((sum, g) => sum + (g.monto || 0), 0)
      const caja = calcularCajaFinal(
        this.cierreService,
        embarque.baseDinero ?? 0,
        pagosColeccionados,
        gastosTotal,
        input.dineroEntregado ?? 0,
      )

      // 10. Create worker debt for unexplained cash shortfall (PR3).
      const deudaCreada = await this.crearDeudaFaltanteService.execute(
        client,
        embarque.trabajadorId,
        input.id,
        caja.sobranteFaltante,
        input.justificacionFaltante,
        this.userId,
      )

      // 11. Close embarque
      await this.embarqueRepo.update(
        input.id,
        {
          estado: new EstadoEmbarqueVO('CERRADO'),
          horaLlegada: new Date(),
          dineroEntregado: input.dineroEntregado ?? 0,
          obs: input.obs ?? embarque.obs,
          ...(input.offlineId ? { offlineId: input.offlineId } : {}),
        },
        tx,
      )

      // 12. Log audit
      await logAudit({
        entidad: 'Embarque',
        registroId: input.id,
        accion: 'UPDATE',
        datos: {
          accion: 'CERRAR',
          pedidosProcesados: pedidosActualizados.length,
          hijosCreados: pedidosHijosCreados.length,
          ventasLibres: ventasLibresCount,
          gastos: gastosCount,
          discrepancia: totalDiscrepancia,
          dineroEntregado: input.dineroEntregado ?? 0,
          deudaCreada: deudaCreada ? { id: deudaCreada.id, monto: deudaCreada.monto } : null,
        },
        usuarioId: this.userId,
      }, tx)

      const finalResult: CierreResultadoDTO = {
        embarqueId: input.id,
        estado: 'CERRADO',
        pedidosProcesados: pedidosActualizados.length,
        pedidosHijosCreados,
        pedidosActualizados,
        ventasLibresCreadas: ventasLibresCount,
        discrepanciaTotal: totalDiscrepancia,
        // FASE 6 (§13): el cierre detecta y crea ResponsibilityCase pendientes de
        // resolución autorizada; ya NO crea el cargo económico automáticamente.
        responsibilityCases: [
          ...(descuentoCreado
            ? [{ id: descuentoCreado.id, tipo: 'DISCREPANCIA_INVENTARIO' as const, montoEstimado: descuentoCreado.monto }]
            : []),
          ...(deudaCreada
            ? [{ id: deudaCreada.id, tipo: 'FALTANTE_CAJA' as const, montoEstimado: deudaCreada.monto }]
            : []),
        ],
        gastosCreados: gastosCount,
        totalVentas,
        comision: totalVentas * 0.05,
        // FIX HIGH (C-BIZ-2): Calcular caja con la función de dominio.
        // Reutilizamos el objeto `caja` calculado en el paso 9.
        caja,
      }

      // A.3.4: en dry-run, todo lo de arriba (pedidos hijos, ventas libres,
      // gastos, deuda, audit log, update del embarque) ya se ejecutó dentro
      // de esta tx para que el cálculo sea idéntico al de un cierre real —
      // pero se aborta el commit lanzando la señal en vez de retornar.
      if (input.dryRun) {
        throw new DryRunSignal(finalResult)
      }

      return finalResult
    })
    } catch (err) {
      if (err instanceof DryRunSignal) return err.result
      throw err
    }
  }

  /**
   * Loads pedidos with related data needed for closing.
   */
  private async fetchPedidosForEmbarque(embarqueId: string, client: TxOrPrisma): Promise<PedidoRawInput[]> {
    const raw = await client.pedido.findMany({
      where: { embarqueId },
      include: { cliente: true, pagos: true, items: true, factura: true },
    })
    return raw as unknown as PedidoRawInput[]
  }


  /**
   * Adapter that builds the Carga value object and delivered-product map,
   * then delegates pure reconciliation math to CierreEmbarqueService.
   * Kept in the use case because it translates Prisma-shaped raw pedidos
   * into the domain value objects the service expects.
   */
  private conciliarProductos(
    embarque: { productos: Array<{ producto: string; cargadas: number }> },
    pedidosRaw: PedidoRawInput[],
    ventasLibres: CerrarEmbarqueInput['ventasLibres'],
    productosRetorno: CerrarEmbarqueInput['productosRetorno'],
  ): { totalDiscrepancia: number; discrepanciasPorProducto: Array<{ producto: string; discrepancia: number }> } {
    // 1. Construir Carga VO desde embarque.productos
    const cargaMap: Record<string, number> = {
      PACA_AGUA: 0, PACA_HIELO: 0, BOTELLON: 0, BOLSA_AGUA: 0, BOLSA_HIELO: 0,
    }
    for (const prod of embarque.productos) {
      if (prod.producto in cargaMap) {
        cargaMap[prod.producto] = prod.cargadas
      }
    }
    const carga = new Carga({
      PACA_AGUA: cargaMap.PACA_AGUA,
      PACA_HIELO: cargaMap.PACA_HIELO,
      BOTELLON: cargaMap.BOTELLON,
      BOLSA_AGUA: cargaMap.BOLSA_AGUA,
      BOLSA_HIELO: cargaMap.BOLSA_HIELO,
    })

    // 2. Agregar entregas: pedidos + ventas libres
    const productosEntregados: Record<ProductCode, { entregadas: number; devueltas: number; cambios: number; rotas: number }> = {
      PACA_AGUA: { entregadas: 0, devueltas: 0, cambios: 0, rotas: 0 },
      PACA_HIELO: { entregadas: 0, devueltas: 0, cambios: 0, rotas: 0 },
      BOTELLON: { entregadas: 0, devueltas: 0, cambios: 0, rotas: 0 },
      BOLSA_AGUA: { entregadas: 0, devueltas: 0, cambios: 0, rotas: 0 },
      BOLSA_HIELO: { entregadas: 0, devueltas: 0, cambios: 0, rotas: 0 },
    }

    for (const p of pedidosRaw) {
      productosEntregados.PACA_AGUA.entregadas += p.cPacaAguaEnt || 0
      productosEntregados.PACA_HIELO.entregadas += p.cPacaHieloEnt || 0
      productosEntregados.BOTELLON.entregadas += (p.cBotellonFabEnt || 0) + (p.cBotellonDomEnt || 0)
      productosEntregados.BOLSA_AGUA.entregadas += p.cBolsaAguaEnt || 0
      productosEntregados.BOLSA_HIELO.entregadas += p.cBolsaHieloEnt || 0
    }

    for (const v of ventasLibres ?? []) {
      productosEntregados.PACA_AGUA.entregadas += v.cPacaAgua || 0
      productosEntregados.PACA_HIELO.entregadas += v.cPacaHielo || 0
      productosEntregados.BOTELLON.entregadas += (v.cBotellonFab || 0) + (v.cBotellonDom || 0)
      productosEntregados.BOLSA_AGUA.entregadas += v.cBolsaAgua || 0
      productosEntregados.BOLSA_HIELO.entregadas += v.cBolsaHielo || 0
    }

    // 3. Devueltas y rotas desde productosRetorno
    for (const pr of productosRetorno ?? []) {
      if (pr.producto in productosEntregados) {
        const pe = productosEntregados[pr.producto as ProductCode]
        pe.devueltas += pr.devueltas
        pe.rotas += pr.rotas
        pe.cambios += pr.cambios
      }
    }

    // 4. Delegar al service (lógica de dominio pura, ya testeada)
    const conciliacion = this.cierreService.conciliarProductos(carga, productosEntregados)
    const result = this.cierreService.calcularDiscrepancia(conciliacion)

    // 5. Proyectar al shape esperado por el call site
    return {
      totalDiscrepancia: result.totalDiscrepancia,
      discrepanciasPorProducto: result.discrepanciasPorProducto.map((d) => ({
        producto: d.producto,
        discrepancia: d.discrepancia,
      })),
    }
  }


  private getTx(tx: unknown): TxOrPrisma {
    return (tx as TxOrPrisma) ?? prisma
  }
}

