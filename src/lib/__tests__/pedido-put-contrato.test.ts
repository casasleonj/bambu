import { describe, it, expect } from 'vitest'
import { clasificarCamposPut, PUT_CAMPOS_PROCESADOS, PUT_CAMPOS_RECHAZADOS } from '../pedido-put-contrato'
import { PedidoUpdateSchema } from '../validators'

describe('clasificarCamposPut', () => {
  it('claves procesadas presentes → solicitados; undefined equivale a ausente', () => {
    expect(clasificarCamposPut({ obs: 'x', items: undefined, direccionEntrega: '' }).solicitados).toEqual(['obs', 'direccionEntrega'])
  })

  it('obs: null cuenta como solicitado (limpiar)', () => {
    expect(clasificarCamposPut({ obs: null }).solicitados).toEqual(['obs'])
  })

  it('metadatos (casoId, offlineId) ni se solicitan ni se rechazan', () => {
    const r = clasificarCamposPut({ casoId: 'c', offlineId: 'o' })
    expect(r.solicitados).toEqual([])
    expect(r.rechazados).toEqual({})
  })

  it('canal y tipo se rechazan con motivo que menciona la corrección formal', () => {
    const r = clasificarCamposPut({ canal: 'PUNTO', tipo: 'ENVIO' })
    expect(Object.keys(r.rechazados)).toEqual(['canal', 'tipo'])
    expect(r.rechazados.canal[0]).toMatch(/corrección formal/)
  })

  it('claves desconocidas (typos) se rechazan: nunca éxito silencioso', () => {
    expect(clasificarCamposPut({ observaciones: 'x' }).rechazados).toHaveProperty('observaciones')
  })

  it('body no objeto → sin nada (el route responde SIN_CAMBIOS_SOLICITADOS)', () => {
    for (const b of [null, 'x', 3, [1]]) expect(clasificarCamposPut(b)).toEqual({ solicitados: [], rechazados: {} })
  })

  it('TODA clave del schema legacy está clasificada: procesada, metadata o rechazada (ningún campo aceptado y no atendido)', () => {
    const claves = Object.keys(PedidoUpdateSchema.shape)
    const clasificadas = new Set<string>([
      ...PUT_CAMPOS_PROCESADOS,
      'casoId',
      'offlineId',
      ...Object.keys(PUT_CAMPOS_RECHAZADOS),
    ])
    const sinClasificar = claves.filter((k) => !clasificadas.has(k))
    expect(sinClasificar, `claves del schema sin clasificar: ${sinClasificar.join(', ')}`).toEqual([])
  })
})
