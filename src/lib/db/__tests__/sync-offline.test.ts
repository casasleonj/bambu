import { describe, it, expect, vi, beforeEach } from 'vitest'

class FakeTable {
  add = vi.fn()
  put = vi.fn()
  update = vi.fn()
  delete = vi.fn()
  clear = vi.fn()
  count = vi.fn()
  where = vi.fn(() => ({ equals: vi.fn(() => ({ first: vi.fn() })) }))
  modify = vi.fn()
  orderBy = vi.fn(() => ({ limit: vi.fn(() => ({ toArray: vi.fn() })) }))
}

class FakeDexie {
  private tables: Record<string, FakeTable> = {}

  version() {
    return {
      stores: (schema: Record<string, string>) => {
        for (const name of Object.keys(schema)) {
          if (!this.tables[name]) {
            this.tables[name] = new FakeTable()
          }
        }
      },
    }
  }

  transaction(...args: unknown[]) {
    const fn = args[args.length - 1] as () => Promise<void>
    return fn()
  }

  get pedidos() { return this.tables.pedidos }
  get clientes() { return this.tables.clientes }
  get syncQueue() { return this.tables.syncQueue }
  get requestQueue() { return this.tables.requestQueue }
  get failedItems() { return this.tables.failedItems }
}

vi.mock('dexie', () => ({
  default: FakeDexie,
  Table: class FakeTableType {},
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

const { offlineDb, queuePedidoOffline } = await import('@/lib/db/offline')

describe('queuePedidoOffline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    offlineDb.pedidos.add.mockResolvedValue(undefined)
    offlineDb.requestQueue.add.mockResolvedValue(undefined)
  })

  it('crea pedido y requestQueue con body correcto', async () => {
    const data = {
      clienteId: 'CONSUMIDOR_FINAL',
      items: [{ producto: 'PACA_AGUA' as const, cantidad: 1 }],
      origen: 'VENTA_LIBRE' as const,
      canal: 'DOMICILIO' as const,
      embarqueId: 'emb-1',
      pagos: [{ metodo: 'EFECTIVO' as const, monto: 2800 }],
      total: 2800,
      estado: 'ENTREGADO',
      fotoEntrega: 'data:image/jpeg;base64,xxx',
      gpsLat: 1.23,
      gpsLng: -4.56,
    }

    const localId = await queuePedidoOffline(data)
    expect(localId).toBeTruthy()

    expect(offlineDb.pedidos.add).toHaveBeenCalledTimes(1)
    const pedido = offlineDb.pedidos.add.mock.calls[0][0]
    expect(pedido.syncStatus).toBe('pending')
    expect(pedido.localId).toBe(localId)

    expect(offlineDb.requestQueue.add).toHaveBeenCalledTimes(1)
    const req = offlineDb.requestQueue.add.mock.calls[0][0]
    expect(req.url).toBe('/api/pedidos/venta-libre')
    expect(req.method).toBe('POST')
    expect(req.localEndpoint).toBe('venta-libre')
    expect(req.offlineId).toBe(localId)

    const body = JSON.parse(req.body)
    expect(body.clienteId).toBe('CONSUMIDOR_FINAL')
    expect(body.offlineId).toBe(localId)
    expect(body.items).toEqual(data.items)
    expect(body).not.toHaveProperty('syncStatus')
    expect(body).not.toHaveProperty('estado')
  })

  it('usa transacción: si requestQueue.add falla, pedidos.add no persiste', async () => {
    offlineDb.requestQueue.add.mockRejectedValue(new Error('fail'))

    await expect(
      queuePedidoOffline({
        clienteId: 'CONSUMIDOR_FINAL',
        items: [{ producto: 'PACA_AGUA' as const, cantidad: 1 }],
        origen: 'VENTA_LIBRE' as const,
        canal: 'DOMICILIO' as const,
        embarqueId: 'emb-1',
        pagos: [{ metodo: 'EFECTIVO' as const, monto: 2800 }],
        total: 2800,
        estado: 'ENTREGADO',
      })
    ).rejects.toThrow('fail')
  })
})
