// @tests #641 — el aviso suave del formulario de gastos detecta textos que parecen pago al personal.
import { describe, it, expect } from 'vitest'
import { PARECE_PAGO_PERSONAL, categorias } from '../types'

describe('#641 — aviso de pago al personal en gastos', () => {
  it.each(['Pago a Carlos', 'pagué a Pedro', 'Sueldo del sellador', 'Comisión repartidor', 'Nómina semana', 'quincena'])(
    'avisa con «%s»', (texto) => expect(PARECE_PAGO_PERSONAL.test(texto)).toBe(true),
  )
  it.each(['Arriendo del local', 'Compra de bolsas', 'Gasolina camión', 'Pago de la luz'])(
    'no avisa con «%s»', (texto) => expect(PARECE_PAGO_PERSONAL.test(texto)).toBe(false),
  )
  it('NOMINA ya no se ofrece al registrar un gasto', () => {
    expect(categorias).not.toContain('NOMINA')
  })
})
