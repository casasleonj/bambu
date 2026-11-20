import { describe, expect, it, vi } from 'vitest'
import { CrearPedidoUseCase } from '../CrearPedidoUseCase'
import type { CrearPedidoInput } from '@/modules/pedidos/application/dto'

vi.mock('@/lib/factura-empresa', () => ({
  getFacturaEmpresaSnapshot: vi.fn().mockResolvedValue({}),
}))

describe('#925 · confirmar precio visible dentro de la transacción', () => {
  it('rechaza un precio cambiado sin crear pedido, factura ni cobrar', async () => {
    const clienteRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'c1', nombre: 'Cliente prueba', telefono: '3000000000',
        direccion: 'Cra 1', barrio: 'Centro',
      }),
      getSaldoFavor: vi.fn(),
    }
    const pedidoRepo = { create: vi.fn(), findByOfflineId: vi.fn() }
    const facturaRepo = { create: vi.fn() }
    const pagoRepo = { create: vi.fn() }
    const pricingPort = {
      loadPricingContext: vi.fn().mockResolvedValue({
        clienteOverrides: null, tiersByCode: {}, productosByCode: {},
      }),
      resolverPrecios: vi.fn().mockResolvedValue([{
        producto: 'PACA_AGUA',
        cantidad: 7,
        precio: 2500,
        subtotal: 17500,
        origen: 'volumen',
      }]),
    }
    const txManager = {
      executeWithLock: vi.fn().mockImplementation(
        async (_scope: string, _id: string, fn: (tx: object) => Promise<unknown>) => fn({}),
      ),
    }

    type Args = ConstructorParameters<typeof CrearPedidoUseCase>
    const sut = new CrearPedidoUseCase(
      pedidoRepo as unknown as Args[0],
      facturaRepo as unknown as Args[1],
      pagoRepo as unknown as Args[2],
      clienteRepo as unknown as Args[3],
      pricingPort as unknown as Args[4],
      txManager as unknown as Args[5],
      vi.fn() as Args[6],
      {} as unknown as Args[7],
    )

    // Caso A: cambió el total. Caso B: el total coincide, pero la
    // cotización por SKU no; también debe rechazarlo antes de cobrar.
    const casos: Array<Pick<CrearPedidoInput, 'precioEsperado' | 'preciosEsperados'>> = [
      { precioEsperado: 19600 },
      { precioEsperado: 17500, preciosEsperados: [{ producto: 'PACA_AGUA', precio: 2800, origen: 'volumen' }] },
    ]
    for (const cotizacion of casos) {
      await expect(sut.execute({
        clienteId: 'c1', canal: 'PUNTO', origen: 'PEDIDO',
        items: [{ producto: 'PACA_AGUA', cantidad: 7 }],
        ...cotizacion,
        createdById: 'u1', createdByRole: 'ADMIN',
      })).rejects.toThrow('PRECIO_CAMBIO_CONFIRMACION')
    }

    expect(txManager.executeWithLock).toHaveBeenCalledWith('SECUENCIA', 'pedido', expect.any(Function))
    expect(pricingPort.resolverPrecios).toHaveBeenCalledTimes(casos.length)
    expect(clienteRepo.getSaldoFavor).not.toHaveBeenCalled()
    expect(pedidoRepo.create).not.toHaveBeenCalled()
    expect(facturaRepo.create).not.toHaveBeenCalled()
    expect(pagoRepo.create).not.toHaveBeenCalled()
  })
})
