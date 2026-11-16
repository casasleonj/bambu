// @tests #788 — la búsqueda local de la lista de Pedidos tolera tildes, prefijos y orden de palabras.
import { describe, expect, it } from 'vitest'
import { coincideContactoPedido, coincidePedidoBusqueda, type PedidoBuscable } from '../pedido-busqueda-local'

const maximo: PedidoBuscable = { nombreCli: 'Máximo Rojas', telefonoCli: '3101110001', numero: 1042 }
const lucia: PedidoBuscable = { nombreCli: 'Lucía Núñez', telefonoCli: '3101110005', numero: 1043 }
const carlos: PedidoBuscable = { nombreCli: 'Carlos Duarte', nombreNegocioCli: 'Punti Frío', telefonoCli: '3101110002', numero: 1044 }
const juan: PedidoBuscable = { nombreCli: 'Juan Pérez', telefonoCli: '3109990000', numero: 1045 }

describe('#788 coincidePedidoBusqueda', () => {
  it.each([
    ['maximo', maximo], ['MAX', maximo], ['máximo', maximo], ['MÁXIMO', maximo],
    ['lucia', lucia], ['nunez', lucia],
    ['PUN', carlos], ['punti', carlos], ['frio', carlos], ['punti frio', carlos],
    ['perez juan', juan], ['juan perez', juan], ['PEREZ', juan],
  ])('«%s» encuentra el pedido esperado', (q, pedido) => {
    expect(coincidePedidoBusqueda(pedido, q)).toBe(true)
  })

  it('conserva el teléfono y el número de pedido', () => {
    expect(coincidePedidoBusqueda(carlos, '3101110002')).toBe(true)
    expect(coincidePedidoBusqueda(maximo, '1042')).toBe(true)
    expect(coincidePedidoBusqueda(maximo, '104')).toBe(true)
  })

  it('no mezcla clientes: un término no encuentra a otro', () => {
    expect(coincidePedidoBusqueda(lucia, 'maximo')).toBe(false)
    expect(coincidePedidoBusqueda(maximo, 'xyzzqk')).toBe(false)
    expect(coincidePedidoBusqueda(juan, 'perez maria')).toBe(false)
  })

  it('el apellido forma parte del nombre del cliente, como en la búsqueda del Hub', () => {
    const conApellido: PedidoBuscable = { nombreCli: 'Máximo', apellidoCli: 'Rojas', telefonoCli: '3101110001', numero: 9 }
    expect(coincidePedidoBusqueda(conApellido, 'rojas')).toBe(true)
    expect(coincidePedidoBusqueda(conApellido, 'rojas maximo')).toBe(true)
    expect(coincidePedidoBusqueda(conApellido, 'rojas   maximo')).toBe(true)
    expect(coincidePedidoBusqueda(conApellido, 'rojas duarte')).toBe(false)
  })

  it('exige TODAS las palabras, no solo una', () => {
    expect(coincidePedidoBusqueda(carlos, 'punti duarte')).toBe(true)
    expect(coincidePedidoBusqueda(carlos, 'punti rojas')).toBe(false)
  })

  it('los dígitos no se aproximan ni se buscan dentro de nombres', () => {
    expect(coincidePedidoBusqueda(maximo, '3101110009')).toBe(false)
    expect(coincidePedidoBusqueda(maximo, '1043')).toBe(false)
  })

  it('tolera campos vacíos o ausentes', () => {
    expect(coincidePedidoBusqueda({ numero: 7 }, 'maximo')).toBe(false)
    expect(coincidePedidoBusqueda({ nombreCli: null, nombreNegocioCli: null, telefonoCli: null, numero: 7 }, 'a')).toBe(false)
  })

  it('una búsqueda vacía o solo espacios no coincide con todo por accidente en el contacto', () => {
    expect(coincideContactoPedido(maximo, '   ')).toBe(false)
  })
})

describe('#788 coincideContactoPedido (filas pendientes: sin número)', () => {
  it('usa nombre, negocio y teléfono, pero no el número de pedido', () => {
    expect(coincideContactoPedido({ nombreCli: 'Máximo', numero: 55 }, 'maximo')).toBe(true)
    expect(coincideContactoPedido({ nombreCli: 'Otro', numero: 55 }, '55')).toBe(false)
  })
})
