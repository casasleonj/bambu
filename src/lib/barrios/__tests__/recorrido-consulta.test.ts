import { describe, expect, it } from 'vitest'
import { FiltroPedidosError, leerFiltrosConsulta, parametrosConsulta } from '@/lib/pedidos-consulta'

describe('#859 Recorrido: URL conserva prioridades sin truncar', () => {
  it('acepta 62 claves de barrios y las devuelve en el mismo orden', () => {
    const p = new URLSearchParams()
    const claves = Array.from({length:62},(_,i) => 'b:identidad'+i)
    for (const clave of claves) p.append('recorrido',clave)
    const filtros = leerFiltrosConsulta(p,'2026-11-27')
    expect(filtros.recorrido).toEqual(claves)
    expect(parametrosConsulta(filtros).getAll('recorrido')).toEqual(claves)
  })

  it('conserva orden sin duplicar claves repetidas', () => {
    const p = new URLSearchParams()
    p.append('recorrido','b:uno')
    p.append('recorrido','b:dos')
    p.append('recorrido','b:uno')
    expect(leerFiltrosConsulta(p,'2026-11-27').recorrido).toEqual(['b:uno','b:dos'])
  })

  it('rechaza más de 80 barrios o demasiados bytes', () => {
    const demasiados = new URLSearchParams()
    for (let i=0;i<81;i++) demasiados.append('recorrido','b:'+i)
    expect(() => leerFiltrosConsulta(demasiados,'2026-11-27')).toThrow(FiltroPedidosError)
    const largo = new URLSearchParams()
    for (let i=0;i<80;i++) largo.append('recorrido','t:'+i+'x'.repeat(78))
    expect(() => leerFiltrosConsulta(largo,'2026-11-27')).toThrow(FiltroPedidosError)
  })

  it('no permite que las ventas anónimas ni claves con control entren a la ruta', () => {
    const p = new URLSearchParams('recorrido=venta-anonima')
    expect(() => leerFiltrosConsulta(p,'2026-11-27')).toThrow(FiltroPedidosError)
    const q = new URLSearchParams()
    q.append('recorrido','t:x\nabc')
    expect(() => leerFiltrosConsulta(q,'2026-11-27')).toThrow(FiltroPedidosError)
  })
})
