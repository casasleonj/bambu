import { describe, expect, it } from 'vitest'
import { diaColombia, errorDeclaracionFechaVentaLibre, metadataDeclaracionFechaVentaLibre } from '@/lib/declaracion-fecha-venta-libre-630'

const ahora = new Date('2026-11-24T05:20:00.000Z') // Bogotá 00:20
describe('#630 F1-B1b: fechas declaradas ≠ hora de registro', () => {
  it('sin declaración no bloquea el cierre ni inventa un dato', () => {
    expect(errorDeclaracionFechaVentaLibre(undefined, ahora)).toBeNull()
  })
  it('fecha de ayer a las 23:58 sigue siendo domingo aunque se cierre lunes', () => {
    expect(diaColombia(ahora)).toBe('2026-11-24')
    expect(errorDeclaracionFechaVentaLibre({ precision: 'INSTANTE', fecha: '2026-11-23', hora: '23:58' }, ahora)).toBeNull()
  })
  it('conocer sólo el día no crea una hora ficticia', () => {
    const valor = { precision: 'DIA' as const, fecha: '2026-11-23' }
    expect(errorDeclaracionFechaVentaLibre(valor, ahora)).toBeNull()
    const meta = metadataDeclaracionFechaVentaLibre(valor, 'emb-1', ahora)
    expect(meta).toMatchObject({ precision: 'DIA', fechaDeclarada: '2026-11-23', horaDeclarada: null, embarqueId: 'emb-1' })
    expect(meta.registradaEn).toBe('2026-11-24T05:20:00.000Z')
  })
  it.each(['2026-02-30','2026-13-01','2026-2-03','2026-11-25','not-a-date'])('rechaza día inválido o futuro %s', (fecha) => {
    expect(errorDeclaracionFechaVentaLibre({ precision: 'DIA', fecha }, ahora)).not.toBeNull()
  })
  it.each(['24:00','23:60','3:30','mañana',''])('rechaza hora inválida %s', (hora) => {
    expect(errorDeclaracionFechaVentaLibre({ precision: 'INSTANTE', fecha: '2026-11-23', hora }, ahora)).not.toBeNull()
  })
  it('rechaza hora futura en el mismo día incluso a medianoche', () => {
    expect(errorDeclaracionFechaVentaLibre({ precision: 'INSTANTE', fecha: '2026-11-24', hora: '00:21' }, ahora)).not.toBeNull()
  })
  it('rechaza hora enviada con precisión solamente día', () => {
    expect(errorDeclaracionFechaVentaLibre({ precision: 'DIA', fecha: '2026-11-23', hora: '23:58' }, ahora)).not.toBeNull()
  })
  it('preserva el nombre de la operación de auditoría fuera de la lectura física de entregas', () => {
    const meta = metadataDeclaracionFechaVentaLibre({ precision: 'INSTANTE', fecha: '2026-11-23', hora: '23:58' }, 'emb-2', ahora)
    expect(meta).toMatchObject({ fuente: 'OPERADOR_CIERRE_EMBARQUE', estado: 'DECLARADA_NO_CERTIFICADA', horaDeclarada: '23:58' })
  })
})
