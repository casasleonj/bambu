import { describe, expect, it } from 'vitest'
import { resolverRegaloPedido } from '../regalo-pedido.service'

const ahora = new Date('2026-11-18T10:00:00Z')
const actor = { id: 'admin-test', rol: 'ADMIN' }
const linea = { cantidad: 60, cantidadRegalo: 3, motivoRegalo: '  Regalo acordado  ' }
const previo = () => ({ cantidad: 3, entregada: 0, autorizadoPorId: 'admin-original', autorizadoEn: ahora, motivo: 'Regalo acordado' })

describe('#795 · autorización específica de regalo', () => {
  it('el administrador autoriza y queda evidencia del actor del servidor', () => {
    expect(resolverRegaloPedido(linea, actor, undefined, ahora)).toEqual({
      cantidad: 3, entregada: 0, autorizadoPorId: 'admin-test', autorizadoEn: ahora, motivo: 'Regalo acordado',
    })
  })
  it.each(['REPARTIDOR', 'ASISTENTE', 'SELLADOR', undefined])('el rol %s no concede regalos', rol => {
    expect(() => resolverRegaloPedido(linea, { id: 'otro', rol })).toThrow('REGALO_REQUIERE_ADMIN')
  })
  it('no confunde ADMIN sin identidad con autorización', () => {
    expect(() => resolverRegaloPedido(linea, { rol: 'ADMIN' })).toThrow('REGALO_REQUIERE_ADMIN')
  })
  it.each([-1, 1.1, NaN, Infinity, 2_147_483_648])('rechaza cantidad inválida %s', cantidadRegalo => {
    expect(() => resolverRegaloPedido({ ...linea, cantidadRegalo }, actor)).toThrow('REGALO_CANTIDAD_INVALIDA')
  })
  it('rechaza el desbordamiento de la cantidad física', () => {
    expect(() => resolverRegaloPedido({ ...linea, cantidad: 2_147_483_647 }, actor)).toThrow('REGALO_CANTIDAD_INVALIDA')
  })
  it('no habilita por accidente pedidos exclusivamente gratuitos', () => {
    expect(() => resolverRegaloPedido({ ...linea, cantidad: 0 }, actor)).toThrow('REGALO_REQUIERE_LINEA_CON_PRECIO')
  })
  it('si se declara un motivo, exige que sea válido y acotado', () => {
    for (const motivoRegalo of ['', '   ', 'x'.repeat(501)]) {
      expect(() => resolverRegaloPedido({ ...linea, motivoRegalo }, actor)).toThrow('REGALO_MOTIVO_REQUERIDO')
    }
  })
  it('no inventa un porqué si el administrador concede el regalo sin una razón adicional', () => {
    const r = resolverRegaloPedido({ cantidad: 60, cantidadRegalo: 3 }, actor)
    expect(r?.motivo).toBe('Regalo en pedido autorizado; sin motivo adicional declarado')
    expect(r?.autorizadoPorId).toBe(actor.id)
  })
  it('el camino sin regalos es compatible con callers sin rol', () => {
    expect(resolverRegaloPedido({ cantidad: 60 }, {})).toBeUndefined()
  })
  it('omitir los campos conserva la evidencia anterior, sin otorgar una autorización nueva', () => {
    const original = previo()
    const r = resolverRegaloPedido({ cantidad: 60 }, { id: 'asistente', rol: 'ASISTENTE' }, original)
    expect(r).toEqual(original)
    r?.autorizadoEn.setFullYear(2000)
    expect(original.autorizadoEn.getUTCFullYear()).toBe(2026)
  })
  it('asistente puede conservar, pero no ampliar ni retirar un regalo autorizado', () => {
    expect(resolverRegaloPedido(linea, { id: 'asistente', rol: 'ASISTENTE' }, previo())).toEqual(previo())
    for (const cantidadRegalo of [0, 4]) {
      expect(() => resolverRegaloPedido({ ...linea, cantidadRegalo }, { id: 'asistente', rol: 'ASISTENTE' }, previo())).toThrow('REGALO_REQUIERE_ADMIN')
    }
  })
  it('retirar un regalo pendiente exige cero explícito y autorización', () => {
    expect(resolverRegaloPedido({ cantidad: 60, cantidadRegalo: 0 }, actor, previo())).toBeUndefined()
  })
  it('no reescribe una concesión con unidades gratuitas ya entregadas', () => {
    expect(() => resolverRegaloPedido({ ...linea, cantidadRegalo: 4 }, actor, { ...previo(), entregada: 1 })).toThrow('REGALO_YA_ENTREGADO')
  })
})
