import { describe, it, expect, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { leerCobrosPeriodo } from '../cobros-periodo'
import type { CobroCartera } from '../cobro-cartera'

const desde = new Date('2026-10-29T00:00:00-05:00'),
  hasta = new Date('2026-10-30T00:00:00-05:00')
const fecha = new Date('2026-10-29T10:00:00-05:00')
const d = (n: number) => new Prisma.Decimal(n)
function pago(
  id: string,
  monto: number,
  metodo = 'EFECTIVO',
  confirmacion = 'CONFIRMADO',
) {
  return {
    id,
    monto: d(monto),
    metodo,
    confirmacion,
    createdAt: fecha,
    pedido: { id: 'p', numero: 901, fecha, canal: 'PUNTO' },
  }
}
function abono(overrides: Partial<CobroCartera> = {}): CobroCartera {
  return {
    id: 'a',
    numero: 'ABO-001',
    fecha,
    canal: 'DOMICILIO',
    pedidoNumero: 902,
    fechaPedido: new Date('2026-10-28T12:00:00-05:00'),
    monto: d(20000),
    reversion: d(0),
    origenCobro: 'INDEPENDIENTE',
    pagoOrigenId: null,
    independienteVerificado: false,
    pagoId: null,
    pedidoId: 'p-viejo',
    pagoPedidoId: null,
    metodoPago: 'EFECTIVO',
    pagoMetodo: null,
    pagoMonto: null,
    pagoFecha: null,
    regularizacionId: null,
    ...overrides,
  }
}
function espejo(overrides: Partial<CobroCartera> = {}) {
  return abono({
    origenCobro: 'ESPEJO_PAGO',
    pedidoId: 'p',
    pagoOrigenId: 'pago',
    pagoId: 'pago',
    pagoPedidoId: 'p',
    pagoMetodo: 'EFECTIVO',
    pagoMonto: d(20000),
    pagoFecha: fecha,
    ...overrides,
  })
}
function tx(
  pagos: ReturnType<typeof pago>[] = [],
  abonos: CobroCartera[] = [],
  datos: unknown[] = [],
) {
  return {
    pago: { findMany: vi.fn(async () => pagos) },
    $queryRaw: vi.fn(async () => abonos),
    historial: {
      findMany: vi.fn(async () =>
        datos.map((dato, i) => ({ id: `h${i}`, datos: JSON.stringify(dato) })),
      ),
    },
  }
}
const leer = (t: ReturnType<typeof tx>) =>
  leerCobrosPeriodo(
    t as unknown as Parameters<typeof leerCobrosPeriodo>[0],
    desde,
    hasta,
  )

describe('cobros del período #526', () => {
  it('separa efectivo y digitales de crédito aplicado y no inventa medios sin actividad', async () => {
    const r = await leer(
      tx([
        pago('cash', 40000),
        pago('nequi', 25000, 'NEQUI', 'REPORTADO'),
        pago('credito', 35000, 'BONO'),
      ]),
    )
    expect(r.subtotalRegistrado).toBe(65000)
    expect(r.creditoAplicado).toBe(35000)
    expect(r.medios.map((m) => m.metodo)).toEqual(['EFECTIVO', 'NEQUI'])
    expect(r.medios[1]).toMatchObject({
      neto: 25000,
      reportado: 25000,
      confirmado: 0,
    })
  })
  it('incluye abono de pedido anterior sin inventar su confirmación', async () => {
    const r = await leer(tx([pago('cash', 40000)], [abono()]))
    expect(r.subtotalRegistrado).toBe(60000)
    expect(r.medios[0]).toMatchObject({
      confirmado: 40000,
      sinEstadoVerificable: 20000,
    })
    expect(r.movimientos.find((m) => m.fuente === 'ABONO')).toMatchObject({
      pedidoAnterior: true,
      canal: 'DOMICILIO',
    })
  })
  it('cuenta una sola vez un espejo identificado y conserva otro abono del mismo importe y hora', async () => {
    const r = await leer(
      tx([pago('pago', 20000)], [espejo(), abono({ id: 'otro' })]),
    )
    expect(r.subtotalRegistrado).toBe(40000)
    expect(r.movimientos).toHaveLength(2)
  })
  it('legado sin evidencia queda pendiente; mantiene subtotales conocidos', async () => {
    const r = await leer(
      tx([pago('pago', 20000)], [abono({ origenCobro: null })]),
    )
    expect(r.subtotalRegistrado).toBe(20000)
    expect(r.porConciliar).toEqual([
      expect.objectContaining({ motivo: 'ORIGEN_ABONO', importe: 20000 }),
    ])
    expect(r.medios[0].pendienteConciliacion).toBe(true)
  })
  it('espejo de otro período no vuelve a entrar como cobro', async () => {
    const r = await leer(
      tx([], [espejo({ pagoFecha: new Date('2026-10-28T10:00:00-05:00') })]),
    )
    expect(r.subtotalRegistrado).toBe(0)
    expect(r.medios).toEqual([])
  })
  it('compensa el cobro por su vínculo aunque el espejo se haya registrado después de medianoche', async () => {
    const r = await leer(
      tx([pago('pago', 20000)], [espejo({ fecha: hasta, reversion: d(5000) })]),
    )
    expect(r.medios[0]).toMatchObject({
      bruto: 20000,
      ajustes: 5000,
      neto: 15000,
      confirmado: 15000,
    })
    expect(r.subtotalRegistrado).toBe(15000)
  })
  it('una reversión completa conserva el medio con actividad aunque su neto sea cero', async () => {
    const r = await leer(tx([], [abono({ reversion: d(20000) })]))
    expect(r.medios[0]).toMatchObject({
      movimientos: 1,
      bruto: 20000,
      ajustes: 20000,
      neto: 0,
    })
  })
  it('ajustes superiores al original exigen revisión; no fabrica un ingreso negativo', async () => {
    const r = await leer(tx([], [abono({ reversion: d(30000) })]))
    expect(r.subtotalRegistrado).toBe(0)
    expect(r.porConciliar[0].motivo).toBe('AJUSTE_INVALIDO')
    expect(r.medios[0].pendienteConciliacion).toBe(true)
  })
  it('discrepancia de método enlazado marca ambos medios, sin adivinar cuál recibió el dinero', async () => {
    const r = await leer(
      tx([pago('pago', 20000)], [espejo({ metodoPago: 'NEQUI' })]),
    )
    expect(r.medios.map((m) => [m.metodo, m.pendienteConciliacion])).toEqual([
      ['EFECTIVO', true],
      ['NEQUI', true],
    ])
    expect(r.subtotalRegistrado).toBe(20000)
  })
  it('#524: el sobrante auditado se señala para conciliar y no se transforma en ingreso canónico', async () => {
    const r = await leer(
      tx(
        [pago('cash', 20000)],
        [],
        [
          {
            operacion: 'COBRO_FIADO_V2',
            resultado: {
              montoSobrante: 5000,
              saldoFavorAcreditado: 5000,
              medios: [{ metodo: 'EFECTIVO', saldoFavor: 5000 }],
            },
          },
        ],
      ),
    )
    expect(r.subtotalRegistrado).toBe(20000)
    expect(r.porConciliar[0]).toMatchObject({
      motivo: 'SOBRANTE_SIN_COBRO',
      importe: 5000,
    })
  })
  it('una auditoría incompleta no se convierte en cero ni en un importe inventado', async () => {
    const r = await leer(
      tx(
        [],
        [],
        [
          {
            operacion: 'COBRO_FIADO_V2',
            resultado: {
              montoSobrante: 5000,
              medios: [{ metodo: 'NEQUI', saldoFavor: null }],
            },
          },
        ],
      ),
    )
    expect(r.porConciliar).toEqual([
      expect.objectContaining({
        motivo: 'REGISTRO_INCOMPLETO',
        importe: null,
        metodo: null,
      }),
    ])
  })
  it('suma centavos sin residuos y mantiene estados ortogonales', async () => {
    const r = await leer(
      tx([
        pago('uno', 0.1, 'NEQUI', 'REPORTADO'),
        pago('dos', 0.2, 'NEQUI', 'DISCREPANTE'),
      ]),
    )
    expect(r.subtotalRegistrado).toBe(0.3)
    expect(r.medios[0]).toMatchObject({
      neto: 0.3,
      reportado: 0.1,
      discrepante: 0.2,
      confirmado: 0,
    })
  })
  it('un fallo de consulta se propaga en lugar de devolver ausencia de cobros', async () => {
    const t = tx()
    t.pago.findMany.mockRejectedValueOnce(new Error('sin base de datos'))
    await expect(leer(t)).rejects.toThrow('sin base de datos')
  })
  it('rechaza intervalos vacíos antes de consultar', async () => {
    const t = tx()
    await expect(
      leerCobrosPeriodo(
        t as unknown as Parameters<typeof leerCobrosPeriodo>[0],
        hasta,
        hasta,
      ),
    ).rejects.toThrow('Rango')
    expect(t.pago.findMany).not.toHaveBeenCalled()
  })
  it('un medio de abono legado desconocido no se inventa como digital ni como dinero nuevo', async () => {
    const r = await leer(tx([], [abono({ metodoPago: 'credito_legacy' })]))
    expect(r.subtotalRegistrado).toBe(0)
    expect(r.porConciliar[0]).toMatchObject({
      motivo: 'MEDIO_NO_IDENTIFICADO',
      metodo: null,
      importe: 20000,
    })
    expect(r.medios[0]).toMatchObject({
      metodo: 'SIN_IDENTIFICAR',
      pendienteConciliacion: true,
      neto: 0,
    })
  })
})

it('el cambio devuelto a Consumidor Final no se confunde con crédito pendiente de ingreso', async () => {
  const r = await leer(
    tx(
      [pago('pago', 10000)],
      [],
      [
        {
          operacion: 'COBRO_FIADO_V2',
          resultado: {
            clienteId: 'CONSUMIDOR_FINAL',
            montoSobrante: 4000,
            saldoFavorAcreditado: 0,
            medios: [{ metodo: 'EFECTIVO', saldoFavor: 4000 }],
          },
        },
      ],
    ),
  )
  expect(r.subtotalRegistrado).toBe(10000)
  expect(r.porConciliar).toEqual([])
})
it('la devolución del sobrante de BONO a saldo a favor no es un ingreso monetario faltante', async () => {
  const r = await leer(
    tx(
      [pago('bono', 10000, 'BONO')],
      [],
      [
        {
          operacion: 'COBRO_FIADO_V2',
          resultado: {
            clienteId: 'cliente',
            montoSobrante: 4000,
            saldoFavorAcreditado: 4000,
            medios: [{ metodo: 'BONO', saldoFavor: 4000 }],
          },
        },
      ],
    ),
  )
  expect(r.subtotalRegistrado).toBe(0)
  expect(r.creditoAplicado).toBe(10000)
  expect(r.porConciliar).toEqual([])
})

it('un abono legado ambiguo con medio desconocido deja también el efectivo por verificar', async () => {
  const r = await leer(
    tx(
      [pago('cash', 10000)],
      [abono({ origenCobro: null, metodoPago: 'medio_legacy' })],
    ),
  )
  expect(r.subtotalRegistrado).toBe(10000)
  expect(r.porConciliar[0].metodo).toBeNull()
  expect(
    r.medios.find((m) => m.metodo === 'EFECTIVO')?.pendienteConciliacion,
  ).toBe(true)
  expect(r.medios.find((m) => m.metodo === 'SIN_IDENTIFICAR')).toBeDefined()
})
