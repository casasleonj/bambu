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
import { resolverPrecio } from '@/lib/pricing'
import { calcularEstadoPago } from '@/lib/pedido-utils'
import { getNextNumero } from '@/lib/sequence'
import { logAudit } from '@/lib/audit'
import type { MetodoPago } from '@prisma/client'

import type { IEmbarqueRepository } from '../../domain/repositories/IEmbarqueRepository'
import type { IGastoEmbarqueRepository } from '../../domain/repositories/IGastoEmbarqueRepository'
import type { IEmbarqueProductoRepository } from '../../domain/repositories/IEmbarqueProductoRepository'
import { EmbarqueTransitionsService } from '../../domain/services/embarque-transitions.service'
import { CierreEmbarqueService } from '../../domain/services/cierre-embarque.service'
import { ProcesarPedidoService } from '../../domain/services/procesar-pedido.service'
import { Carga, type ProductCode } from '../../domain/value-objects/Carga'
import { EstadoEmbarque as EstadoEmbarqueVO } from '../../domain/value-objects/EstadoEmbarque'
import type { CerrarEmbarqueInput, CierreResultadoDTO } from '../dto'
import type { ITransactionManager } from '../../infrastructure/transactions/PrismaTransactionManager'

type TxOrPrisma = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

function toNumber(value: number | { toNumber: () => number } | null | undefined): number {
  if (value === null || value === undefined) return 0
  return typeof value === 'number' ? value : value.toNumber()
}

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

      const ventasLibresCount = await this.crearVentasLibres(client, input.ventasLibres ?? [], input.id)

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
        descuentoCreado = await this.crearDescuento(
          client,
          embarque.trabajadorId,
          input.id,
          discrepanciasPorProducto,
        )
      }

      // 7. Create gastos
      const gastosCount = await this.crearGastos(tx, input.gastos ?? [], input.id, embarque.trabajadorId)

      // 8. Update EmbarqueProducto records
      await this.actualizarProductosRetorno(tx, input.id, input.productosRetorno ?? [])

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
        caja: {
          efectivoEsperado: 0,
          efectivoReal: 0,
          diferencia: 0,
        },
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


  private async crearVentasLibres(
    client: TxOrPrisma,
    ventas: NonNullable<CerrarEmbarqueInput['ventasLibres']>,
    embarqueId: string,
  ): Promise<number> {
    let count = 0

    for (const venta of ventas) {
      const totalItems = (venta.cPacaAgua || 0) + (venta.cPacaHielo || 0) + (venta.cBotellonFab || 0) + (venta.cBotellonDom || 0) + (venta.cBolsaAgua || 0) + (venta.cBolsaHielo || 0)
      if (totalItems === 0) continue

      const totalPagado = venta.pagos.reduce((sum, p) => sum + p.monto, 0)
      const numeroVenta = await getNextNumero(client, { model: 'pedido' })

      const botellonCant = (venta.cBotellonFab || 0) + (venta.cBotellonDom || 0)
      const [precioAgua, precioHielo, precioBot, precioBolAgua, precioBolHielo] = await Promise.all([
        resolverPrecio('PACA_AGUA', venta.cPacaAgua || 0, 'DOMICILIO', null, null, client),
        resolverPrecio('PACA_HIELO', venta.cPacaHielo || 0, 'DOMICILIO', null, null, client),
        resolverPrecio('BOTELLON', botellonCant, 'DOMICILIO', null, null, client),
        resolverPrecio('BOLSA_AGUA', venta.cBolsaAgua || 0, 'DOMICILIO', null, null, client),
        resolverPrecio('BOLSA_HIELO', venta.cBolsaHielo || 0, 'DOMICILIO', null, null, client),
      ])

      const totalVenta =
        (venta.cPacaAgua || 0) * precioAgua.precio +
        (venta.cPacaHielo || 0) * precioHielo.precio +
        botellonCant * precioBot.precio +
        (venta.cBolsaAgua || 0) * precioBolAgua.precio +
        (venta.cBolsaHielo || 0) * precioBolHielo.precio

      const estadoPago = calcularEstadoPago(totalVenta, totalPagado)

      const nuevaVenta = await client.pedido.create({
        data: {
          numero: numeroVenta,
          clienteId: venta.clienteId,
          tipo: 'ENVIO',
          canal: 'DOMICILIO',
          origen: 'VENTA_LIBRE',
          estadoEntrega: 'ENTREGADO',
          estadoPago,
          estado: 'ENTREGADO',
          embarqueId,
          precioPacaAgua: precioAgua.precio,
          precioPacaHielo: precioHielo.precio,
          precioBotellonFab: 0,
          precioBotellonDom: precioBot.precio,
          precioBolsaAgua: precioBolAgua.precio,
          precioBolsaHielo: precioBolHielo.precio,
          cPacaAguaPed: venta.cPacaAgua || 0,
          cPacaAguaEnt: venta.cPacaAgua || 0,
          cPacaHieloPed: venta.cPacaHielo || 0,
          cPacaHieloEnt: venta.cPacaHielo || 0,
          cBotellonFabPed: venta.cBotellonFab || 0,
          cBotellonFabEnt: venta.cBotellonFab || 0,
          cBotellonDomPed: venta.cBotellonDom || 0,
          cBotellonDomEnt: venta.cBotellonDom || 0,
          cBolsaAguaPed: venta.cBolsaAgua || 0,
          cBolsaAguaEnt: venta.cBolsaAgua || 0,
          cBolsaHieloPed: venta.cBolsaHielo || 0,
          cBolsaHieloEnt: venta.cBolsaHielo || 0,
          total: totalVenta,
          totalPagado: totalPagado,
          saldo: totalVenta - totalPagado,
          obs: venta.obs || 'Venta libre en ruta',
          createdById: this.userId,
          items: {
            create: [
              ...((venta.cPacaAgua || 0) > 0 ? [{ producto: 'PACA_AGUA', cantPedido: venta.cPacaAgua, cantEntrega: venta.cPacaAgua, precio: precioAgua.precio, subtotal: precioAgua.precio * venta.cPacaAgua }] : []),
              ...((venta.cPacaHielo || 0) > 0 ? [{ producto: 'PACA_HIELO', cantPedido: venta.cPacaHielo, cantEntrega: venta.cPacaHielo, precio: precioHielo.precio, subtotal: precioHielo.precio * venta.cPacaHielo }] : []),
              ...(botellonCant > 0 ? [{ producto: 'BOTELLON', cantPedido: botellonCant, cantEntrega: botellonCant, precio: precioBot.precio, subtotal: precioBot.precio * botellonCant }] : []),
              ...((venta.cBolsaAgua || 0) > 0 ? [{ producto: 'BOLSA_AGUA', cantPedido: venta.cBolsaAgua, cantEntrega: venta.cBolsaAgua, precio: precioBolAgua.precio, subtotal: precioBolAgua.precio * venta.cBolsaAgua }] : []),
              ...((venta.cBolsaHielo || 0) > 0 ? [{ producto: 'BOLSA_HIELO', cantPedido: venta.cBolsaHielo, cantEntrega: venta.cBolsaHielo, precio: precioBolHielo.precio, subtotal: precioBolHielo.precio * venta.cBolsaHielo }] : []),
            ],
          },
        },
      })

      for (const pago of venta.pagos) {
        if (pago.monto > 0) {
          await client.pago.create({
            data: { pedidoId: nuevaVenta.id, metodo: pago.metodo as MetodoPago, monto: pago.monto },
          })
        }
      }

      const facturaNum = await getNextNumero(client, { model: 'factura', field: 'numero' })
      const facturaClienteId = venta.clienteId === 'CONSUMIDOR_FINAL' ? 'CONSUMIDOR_FINAL' : venta.clienteId
      await client.factura.create({
        data: {
          numero: `FAC-${facturaNum.toString().padStart(5, '0')}`,
          clienteId: facturaClienteId,
          pedidoId: nuevaVenta.id,
          subtotal: totalVenta,
          total: totalVenta,
          saldo: totalVenta - totalPagado,
          estado: totalPagado >= totalVenta ? 'PAGADA' : 'EMITIDA',
        },
      })

      count++
    }

    return count
  }

  /**
   * FIX F4.10-c: adaptador que delega a CierreEmbarqueService en vez
   * de duplicar la lógica de conciliación. Antes: ~50 líneas inline
   * con tipos Record<string, number>. Ahora: usa Carga VO + tipos
   * nombrados del service, que ya tiene tests.
   *
   * El service retorna ProductoConciliacion[] con más campos
   * (cargadas, entregadas, devueltas, cambios, rotas) que el shape
   * antiguo. Para mantener backward compat con `crearDescuento`
   * (que solo necesita producto + discrepancia), proyectamos a la
   * estructura mínima esperada.
   */
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

  private async crearDescuento(
    client: TxOrPrisma,
    trabajadorId: string,
    embarqueId: string,
    discrepancias: Array<{ producto: string; discrepancia: number }>,
  ): Promise<{ id: string; monto: number }> {
    const precioMap: Record<string, number> = {}
    for (const disc of discrepancias) {
      if (disc.discrepancia > 0) {
        const precioResult = await resolverPrecio(disc.producto as ProductCode, 1, 'DOMICILIO', null, null, client)
        precioMap[disc.producto] = precioResult.precio
      }
    }

    let montoTotal = 0
    const motivos: string[] = []
    for (const disc of discrepancias) {
      if (disc.discrepancia > 0) {
        const precio = precioMap[disc.producto] ?? precioMap['PACA_AGUA'] ?? 0
        montoTotal += disc.discrepancia * precio
        motivos.push(`${disc.discrepancia} ${disc.producto}`)
      }
    }

    const descuento = await client.descuentoRepartidor.create({
      data: {
        embarqueId,
        trabajadorId,
        monto: montoTotal,
        motivo: `Discrepancia conciliacion: ${motivos.join(', ')}`,
        justificado: false,
      },
    })

    return { id: descuento.id, monto: toNumber(descuento.monto) }
  }

  private async crearGastos(
    tx: unknown,
    gastos: CerrarEmbarqueInput['gastos'],
    embarqueId: string,
    trabajadorId: string,
  ): Promise<number> {
    let count = 0
    for (const gastoData of gastos ?? []) {
      await this.gastoRepo.create(
        {
          embarqueId,
          categoria: gastoData.categoria,
          descripcion: gastoData.nota || gastoData.categoria,
          monto: gastoData.monto,
          responsable: trabajadorId,
          notas: gastoData.nota,
          createdById: this.userId,
        },
        tx,
      )
      count++
    }
    return count
  }

  private async actualizarProductosRetorno(
    tx: unknown,
    embarqueId: string,
    productosRetorno: CerrarEmbarqueInput['productosRetorno'],
  ): Promise<void> {
    for (const pr of productosRetorno ?? []) {
      await this.productoRepo.upsert(
        embarqueId,
        pr.producto as ProductCode,
        {
          cargadas: 0,
          devueltas: pr.devueltas,
          cambios: pr.cambios,
          rotas: pr.rotas,
        },
        tx,
      )
    }
  }

  private getTx(tx: unknown): TxOrPrisma {
    return (tx as TxOrPrisma) ?? prisma
  }
}
