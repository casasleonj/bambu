// #630 F1-B1a: pruebas de tiempo sintético de ventas en ruta.
import { describe, expect, it } from 'vitest'
import { resolverFechaEntregaVentaLibre } from '@/lib/venta-libre-fecha-entrega'
import { clasificarVentaLibre } from '@/lib/venta-libre-clasificacion'

const d = (s: string) => new Date(s)
const recibido = d('2032-04-13T05:10:00.000Z')
const ocurrido = d('2032-04-13T04:59:00.000Z')
const base = {
  entregarAhora: true, occurredAt: ocurrido, capturedAt: ocurrido,
  serverReceivedAt: recibido, clasificacionTemporal: 'NORMAL' as const,
}

describe('#630 F1-B1a instante físico declarado', () => {
  it('mantiene la fecha anterior a medianoche aunque llegue al día siguiente', () => {
    expect(resolverFechaEntregaVentaLibre(base)?.toISOString()).toBe(ocurrido.toISOString())
  })
  it('una venta offline de dos horas usa el instante declarado si es consistente', () => {
    const serverReceivedAt = d('2032-04-13T07:10:00.000Z')
    const clasificacionTemporal = clasificarVentaLibre({ occurredAt: ocurrido, capturedAt: ocurrido, serverReceivedAt })
    expect(clasificacionTemporal).toBe('TARDIA')
    expect(resolverFechaEntregaVentaLibre({ ...base, serverReceivedAt, clasificacionTemporal })).toEqual(ocurrido)
  })
  it('una venta diferida no declara entrega', () => {
    expect(resolverFechaEntregaVentaLibre({ ...base, entregarAhora: false })).toBeNull()
  })
  it('un legacy sin fecha real no se refecha con la hora de recepción', () => {
    expect(resolverFechaEntregaVentaLibre({ ...base, occurredAt: null })).toBeNull()
    expect(resolverFechaEntregaVentaLibre({ ...base, capturedAt: null })).toBeNull()
  })
  it('más de 24 horas sigue siendo venta válida pero con fecha por revisar', () => {
    const serverReceivedAt = d('2032-04-15T08:00:00.000Z')
    const clasificacionTemporal = clasificarVentaLibre({ occurredAt: ocurrido, capturedAt: ocurrido, serverReceivedAt })
    expect(clasificacionTemporal).toBe('SOSPECHOSA')
    expect(resolverFechaEntregaVentaLibre({ ...base, serverReceivedAt, clasificacionTemporal })).toBeNull()
  })
  it('declaración de hora muy distinta a captura no certifica el día físico', () => {
    expect(resolverFechaEntregaVentaLibre({ ...base, occurredAt: new Date(+ocurrido - 3600_000) })).toBeNull()
  })
  it('reloj futuro más de cinco minutos no modifica el tiempo del servidor', () => {
    const futuro = new Date(+recibido + 7 * 60_000)
    expect(resolverFechaEntregaVentaLibre({ ...base, occurredAt: futuro, capturedAt: futuro })).toBeNull()
  })
  it('fecha inválida se rechaza como evidencia, no como venta', () => {
    expect(resolverFechaEntregaVentaLibre({ ...base, occurredAt: new Date('invalid') })).toBeNull()
  })
  it('sin mutaciones de entrada', () => {
    const antes = JSON.stringify(base)
    resolverFechaEntregaVentaLibre(base)
    expect(JSON.stringify(base)).toBe(antes)
  })
})
