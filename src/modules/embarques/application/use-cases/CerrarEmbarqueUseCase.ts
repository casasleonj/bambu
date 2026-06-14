/**
 * CerrarEmbarqueUseCase.
 *
 * Closes an embarque: processes pedidos, creates child pedidos for partials,
 * creates ventas libres, reconciles products, calculates discrepancies,
 * creates descuentos, creates gastos, and updates facturas.
 *
 * This is the most complex use case — formerly a 582-line route handler.
 */

import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

import type { IEmbarqueRepository } from '../../domain/repositories/IEmbarqueRepository'
import type { IGastoEmbarqueRepository } from '../../domain/repositories/IGastoEmbarqueRepository'
import type { IEmbarqueProductoRepository } from '../../domain/repositories/IEmbarqueProductoRepository'
import { EmbarqueTransitionsService } from '../../domain/services/embarque-transitions.service'
import { CierreEmbarqueService } from '../../domain/services/cierre-embarque.service'
import { ProcesarPedidoService } from '../../domain/services/procesar-pedido.service'
import { CrearVentasLibresService } from '../../domain/services/crear-ventas-libres.service'
import { CrearDescuentoDiscrepanciaService } from '../../domain/services/crear-descuento-discrepancia.service'
import { CerrarEmbarqueSideEffectsService } from '../../domain/services/cerrar-embarque-side-effects.service'
import { Carga, type ProductCode } from '../../domain/value-objects/Carga'
import { EstadoEmbarque as EstadoEmbarqueVO } from '../../domain/value-objects/EstadoEmbarque'
import type { CerrarEmbarqueInput, CierreResultadoDTO } from '../dto'
import type { ITransactionManager } from '../../infrastructure/transactions/PrismaTransactionManager'

type TxOrPrisma = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

interface PedidoRaw {
  id: string
  numero: number
  clienteId: string
  embarqueId: string | null
  estadoEntrega: string
  estado: string
  tipo: string
  canal: string
  origen: string
  precioPacaAgua: number | { toNumber: () => number }
  precioPacaHielo: number | { toNumber: () => number }
  precioBotellonFab: number | { toNumber: () => number }
  precioBotellonDom: number | { toNumber: () => number }
  precioBolsaAgua: number | { toNumber: () => number }
  precioBolsaHielo: number | { toNumber: () => number }
  cPacaAguaPed: number
  cPacaHieloPed: number
  cBotellonFabPed: number
  cBotellonDomPed: number
  cBolsaAguaPed: number
  cBolsaHieloPed: number
  cPacaAguaEnt: number
  cPacaHieloEnt: number
  cBotellonFabEnt: number
  cBotellonDomEnt: number
  cBolsaAguaEnt: number
  cBolsaHieloEnt: number
  total: number | { toNumber: () => number }
  obs: string | null
  createdById: string | null
  items: Array<{ producto: string }>
  factura: { id: string } | null
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
    // FIX F4.10-d: inyectar CerrarEmbarqueSideEffectsService para
    // delegar los side effects finales: crearGastos y actualizarProductosRetorno.
    // Default: nueva instancia (backward compatible con callers existentes).
    private readonly sideEffectsService: CerrarEmbarqueSideEffectsService = new CerrarEmbarqueSideEffectsService(),
  ) {}

  async execute(input: CerrarEmbarqueInput): Promise<CierreResultadoDTO> {
    // FIX F2.2: usar executeWithLock('CIERRE', ...) en vez de execute sin lock.
    //
    // Antes: dos cierres concurrentes del mismo embarque (o cierres
    // paralelos de embarques distintos) podían crear el mismo número
    // de pedido/factura porque getNextNumero usa `_max + 1` (count + 1),
    // que NO es atómico entre transacciones paralelas.
    //
    // pg_advisory_xact_lock(7) — el id de CIERRE en LOCK_IDS (locks.ts:10)
    // — serializa TODAS las operaciones de cierre dentro de la misma
    // conexión PostgreSQL. Se libera automáticamente al hacer commit/rollback.
    //
    // Trade-off conocido (aceptable):
    // - Si dos admins intentan cerrar embarques al MISMO tiempo, uno espera
    //   al otro. El lock se mantiene solo durante el cierre, no encolar
    //   requests, pero el segundo sentirá latencia. Aceptable porque los
    //   cierres son operaciones infrecuentes (1-3 por día típicamente).
    // - Si la operación falla dentro del lock, el rollback libera el lock.
    return this.txManager.executeWithLock('CIERRE', async (tx) => {
      const client = this.getTx(tx)

      // 1. Verify embarque exists and can be closed
      const embarque = await this.embarqueRepo.findById(input.id, tx)
      if (!embarque) throw new Error('EMBARQUE_NOT_FOUND')

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

      // 9. Close embarque
      await this.embarqueRepo.update(
        input.id,
        {
          estado: new EstadoEmbarqueVO('CERRADO'),
          horaLlegada: new Date(),
          dineroEntregado: input.dineroEntregado ?? 0,
          obs: input.obs ?? embarque.obs,
        },
        tx,
      )

      // 10. Log audit
      logAudit({
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
        },
        usuarioId: this.userId,
      })

      return {
        embarqueId: input.id,
        estado: 'CERRADO',
        pedidosProcesados: pedidosActualizados.length,
        pedidosHijosCreados,
        pedidosActualizados,
        ventasLibresCreadas: ventasLibresCount,
        discrepanciaTotal: totalDiscrepancia,
        descuentoCreado,
        gastosCreados: gastosCount,
        totalVentas,
        comision: totalVentas * 0.05,
        // FIX HIGH (C-BIZ-2): Calcular caja con la función de dominio
        // Previously: returned hardcoded { 0, 0, 0 } — discrepancia entre lo que
        // esperaba el sistema y lo que reportó el repartidor no se computaba.
        caja: this.calcularCajaFinal(
          embarque.baseDinero ?? 0,
          totalVentas,
          this.coleccionarPagos(pedidosRaw, input.ventasLibres ?? []),
          (input.gastos ?? []).reduce((sum, g) => sum + (g.monto || 0), 0),
          input.dineroEntregado ?? 0,
        ),
      }
    })
  }

  private async fetchPedidosForEmbarque(embarqueId: string, client: TxOrPrisma): Promise<PedidoRaw[]> {
    const raw = await client.pedido.findMany({
      where: { embarqueId },
      include: { cliente: true, pagos: true, items: true, factura: true },
    })
    return raw as unknown as PedidoRaw[]
  }


  private conciliarProductos(
    embarque: { productos: Array<{ producto: string; cargadas: number }> },
    pedidosRaw: PedidoRaw[],
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

  /**
   * FIX HIGH (C-BIZ-2): Helper que colecta todos los pagos (de pedidos
   * del embarque + ventas libres) y llama al service de dominio.
   * @param baseDinero - efectivo que el repartidor recibió al salir
   * @param totalVentas - suma de todos los pedidos + ventas libres
   * @param pagos - array unificado de pagos con metodo y monto
   * @param gastosTotal - suma de gastos del embarque
   * @param dineroEntregado - efectivo que el repartidor retorna
   */
  private calcularCajaFinal(
    baseDinero: number,
    totalVentas: number,
    pagos: Array<{ metodo: string; monto: number }>,
    gastosTotal: number,
    dineroEntregado: number,
  ) {
    const cajaCalc = this.cierreService.calcularCaja(
      totalVentas,
      pagos,
      baseDinero,
      gastosTotal,
    )
    // efectivoReal (calculado por service) refleja lo que el sistema esperaba
    // que el repartidor retornara. La `diferencia` efectiva entre lo reportado
    // (dineroEntregado) y lo esperado (efectivoReal) es la "sobrante/faltante".
    return {
      efectivoEsperado: cajaCalc.efectivoEsperado,
      efectivoReal: cajaCalc.efectivoReal,
      diferencia: cajaCalc.diferencia,
      otrosPagos: cajaCalc.otrosPagos,
      dineroEntregadoReportado: dineroEntregado,
      sobranteFaltante: dineroEntregado - cajaCalc.efectivoReal,
    }
  }

  /**
   * FIX HIGH (C-BIZ-2): Helper que une pagos de pedidos del embarque
   * con pagos de ventas libres en un solo array para calcular caja.
   */
  private coleccionarPagos(
    pedidosRaw: PedidoRaw[],
    ventasLibres: NonNullable<CerrarEmbarqueInput['ventasLibres']>,
  ): Array<{ metodo: string; monto: number }> {
    const out: Array<{ metodo: string; monto: number }> = []
    for (const p of pedidosRaw) {
      // FIX TypeScript: cast to unknown first, then to expected shape
      const pedidoConPagos = p as unknown as {
        pagos?: Array<{ metodo: string; monto: number | { toNumber: () => number } }>
      }
      if (Array.isArray(pedidoConPagos.pagos)) {
        for (const pg of pedidoConPagos.pagos) {
          const monto = typeof pg.monto === 'number' ? pg.monto : pg.monto.toNumber()
          out.push({ metodo: pg.metodo, monto })
        }
      }
    }
    for (const v of ventasLibres) {
      if (Array.isArray(v.pagos)) {
        for (const pg of v.pagos) {
          out.push({ metodo: pg.metodo, monto: pg.monto || 0 })
        }
      }
    }
    return out
  }
}
