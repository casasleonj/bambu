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
const { syncWithServer } = await import('@/lib/db/sync')

const mockDb = offlineDb as unknown as {
  pedidos: FakeTable
  clientes: FakeTable
  syncQueue: FakeTable
  requestQueue: FakeTable
  failedItems: FakeTable
}

const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

describe('queuePedidoOffline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mockDb.pedidos.add).mockResolvedValue(undefined as never)
    vi.mocked(mockDb.requestQueue.add).mockResolvedValue(undefined as never)
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

    expect(mockDb.pedidos.add).toHaveBeenCalledTimes(1)
    const pedido = vi.mocked(mockDb.pedidos.add).mock.calls[0][0]
    expect(pedido.syncStatus).toBe('pending')
    expect(pedido.localId).toBe(localId)

    expect(mockDb.requestQueue.add).toHaveBeenCalledTimes(1)
    const req = vi.mocked(mockDb.requestQueue.add).mock.calls[0][0]
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
    vi.mocked(mockDb.requestQueue.add).mockRejectedValue(new Error('fail'))

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

function mockOrderByToArray(table: FakeTable, items: unknown[]) {
  vi.mocked(table.orderBy).mockReturnValue({
    limit: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(items),
    }),
  } as never)
}

function mockWhereFirst(table: FakeTable, item: unknown, modifyMock?: ReturnType<typeof vi.fn>) {
  const modify = modifyMock ?? vi.fn().mockResolvedValue(undefined)
  const equalsMock = vi.fn().mockReturnValue({
    first: vi.fn().mockResolvedValue(item),
    modify,
  })
  vi.mocked(table.where).mockReturnValue({
    equals: equalsMock,
  } as never)
  return modify
}

describe('syncWithServer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrderByToArray(mockDb.syncQueue, [])
    mockOrderByToArray(mockDb.requestQueue, [])
    vi.mocked(mockDb.requestQueue.count).mockResolvedValue(0)
    vi.mocked(mockDb.syncQueue.count).mockResolvedValue(0)
    vi.mocked(mockDb.requestQueue.update).mockResolvedValue(undefined as never)
    vi.mocked(mockDb.requestQueue.delete).mockResolvedValue(undefined as never)
    vi.mocked(mockDb.failedItems.add).mockResolvedValue(undefined as never)
    vi.mocked(mockDb.pedidos.modify).mockResolvedValue(undefined as never)
    vi.mocked(mockDb.clientes.modify).mockResolvedValue(undefined as never)
  })

  it('success: actualiza pedido a synced y borra requestQueue', async () => {
    const req = {
      id: 1,
      url: '/api/pedidos/venta-libre',
      method: 'POST',
      body: '{}',
      offlineId: 'local-1',
      localEndpoint: 'venta-libre',
      createdAt: new Date(),
      attempts: 0,
    }
    mockOrderByToArray(mockDb.requestQueue, [req])
    mockWhereFirst(mockDb.pedidos, { id: 1, localId: 'local-1', syncStatus: 'pending' })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ pedido: { id: 'server-1', numero: 123 } }),
    })

    const modifyMock = mockWhereFirst(mockDb.pedidos, { id: 1, localId: 'local-1', syncStatus: 'pending' })

    const result = await syncWithServer()
    expect(result.synced).toBe(1)
    expect(result.drained).toBe(true)
    expect(modifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ syncStatus: 'synced', numero: 123 })
    )
    expect(mockDb.requestQueue.delete).toHaveBeenCalledWith(1)
  })

  it('401: no purga colas y redirige', async () => {
    const req = {
      id: 1,
      url: '/api/pedidos/venta-libre',
      method: 'POST',
      body: '{}',
      offlineId: 'local-1',
      localEndpoint: 'venta-libre',
      createdAt: new Date(),
      attempts: 0,
    }
    mockOrderByToArray(mockDb.requestQueue, [req])
    mockWhereFirst(mockDb.pedidos, { id: 1, localId: 'local-1', syncStatus: 'pending' })
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })

    const originalLocation = window.location
    const locationHref = { value: originalLocation.href }
    Object.defineProperty(window, 'location', {
      value: {
        ...originalLocation,
        set href(value: string) { locationHref.value = value },
        get href() { return locationHref.value },
      },
      writable: true,
      configurable: true,
    })

    const result = await syncWithServer()
    expect(result.sessionExpired).toBe(true)
    expect(mockDb.requestQueue.clear).not.toHaveBeenCalled()
    expect(mockDb.syncQueue.clear).not.toHaveBeenCalled()
    expect(window.location.href).toBe('/login?reason=expired')

    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
  })

  it('concurrente: devuelve alreadyRunning', async () => {
    mockOrderByToArray(mockDb.requestQueue, [])
    const first = syncWithServer()
    const second = syncWithServer()
    const [, r2] = await Promise.all([first, second])
    expect(r2.alreadyRunning).toBe(true)
    await first
  })

  it('429: mantiene en cola y registra lastError', async () => {
    const req = {
      id: 1,
      url: '/api/pedidos/venta-libre',
      method: 'POST',
      body: '{}',
      offlineId: 'local-1',
      localEndpoint: 'venta-libre',
      createdAt: new Date(),
      attempts: 0,
    }
    mockOrderByToArray(mockDb.requestQueue, [req])
    vi.mocked(mockDb.requestQueue.count).mockResolvedValue(1)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '120' }),
      json: async () => ({}),
    })

    const result = await syncWithServer()
    expect(result.failed).toBe(1)
    expect(mockDb.requestQueue.delete).not.toHaveBeenCalled()
    expect(mockDb.requestQueue.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ lastError: '429: retry after 120s' })
    )
  })

  it('4xx: mueve a DLQ y marca conflict', async () => {
    const req = {
      id: 1,
      url: '/api/pedidos/venta-libre',
      method: 'POST',
      body: '{}',
      offlineId: 'local-1',
      localEndpoint: 'venta-libre',
      createdAt: new Date(),
      attempts: 0,
    }
    mockOrderByToArray(mockDb.requestQueue, [req])
    const modifyMock = mockWhereFirst(mockDb.pedidos, { id: 1, localId: 'local-1', syncStatus: 'pending' })
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) })

    const result = await syncWithServer()
    expect(result.failedPermanently).toBe(1)
    expect(mockDb.failedItems.add).toHaveBeenCalledTimes(1)
    expect(mockDb.requestQueue.delete).toHaveBeenCalledWith(1)
    expect(modifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ syncStatus: 'conflict' })
    )
  })
})
