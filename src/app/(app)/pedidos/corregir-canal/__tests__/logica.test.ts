import { describe, it, expect } from 'vitest'
import { canalOpuesto, nombreCanal, resumenCambio, validarCorreccion, type CambioCanal } from '../logica'

const base: CambioCanal = {
  canalAntes: 'PUNTO', canalDespues: 'DOMICILIO', precios: 'CONSERVAR',
  totalAntes: 60000, totalDespues: 60000, totalPagado: 0, saldoDespues: 60000, estadoPagoDespues: 'PENDIENTE',
}

describe('#472 — corregir canal (lógica pura)', () => {
  it('el canal nuevo es siempre el opuesto, con nombres sencillos', () => {
    expect(canalOpuesto('PUNTO')).toBe('DOMICILIO')
    expect(canalOpuesto('DOMICILIO')).toBe('PUNTO')
    expect(nombreCanal('PUNTO')).toBe('Punto de venta')
    expect(nombreCanal('DOMICILIO')).toBe('Domicilio')
  })

  it('exige un motivo de al menos 3 letras', () => {
    expect(validarCorreccion({ motivo: '   ' }).motivo).toMatch(/motivo/)
    expect(validarCorreccion({ motivo: 'ab' }).motivo).toBeDefined()
    expect(validarCorreccion({ motivo: 'Error de registro' })).toEqual({})
  })

  it('conservar precios: dice que no cambian y explica el efecto en la comisión', () => {
    const f = resumenCambio(base)
    expect(f[0]).toBe('El pedido pasa de Punto de venta a Domicilio.')
    expect(f.some((x) => x.startsWith('Los precios no cambian'))).toBe(true)
    expect(f.at(-1)).toMatch(/suma comisión al repartidor/)
  })

  it('recalcular: muestra de cuánto a cuánto y si sube o baja', () => {
    const sube = resumenCambio({ ...base, precios: 'RECALCULAR', totalDespues: 65000, saldoDespues: 65000 })
    expect(sube.join(' ')).toMatch(/pasa de \$60\.000 a \$65\.000 \(sube \$5\.000\)/)
    const baja = resumenCambio({ ...base, canalAntes: 'DOMICILIO', canalDespues: 'PUNTO', precios: 'RECALCULAR', totalDespues: 55000, saldoDespues: 55000 })
    expect(baja.join(' ')).toMatch(/\(baja \$5\.000\)/)
    expect(baja.at(-1)).toMatch(/Deja de ser un pedido a domicilio/)
  })

  it('recalcular sin diferencia lo dice, y cuenta lo ya pagado', () => {
    const f = resumenCambio({ ...base, precios: 'RECALCULAR', totalPagado: 20000, saldoDespues: 40000 })
    expect(f.join(' ')).toMatch(/quedan igual/)
    expect(f.join(' ')).toMatch(/Ya se pagó \$20\.000\. Queda por pagar \$40\.000/)
  })
})
