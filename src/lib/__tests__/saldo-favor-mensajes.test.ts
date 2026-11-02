import { describe, it, expect } from 'vitest'
import { mensajeSaldoFavor, hayParteYaUsada } from '../saldo-favor-mensajes'

const d = (n: number) => `$${n}`

describe('mensajeSaldoFavor (#577)', () => {
  it('sin movimiento de saldo a favor no hay mensaje', () => {
    expect(mensajeSaldoFavor(undefined, d)).toBeNull()
    expect(mensajeSaldoFavor({}, d)).toBeNull()
    expect(mensajeSaldoFavor({ saldoFavorRevertido: 0, saldoFavorYaUsado: 0, saldoFavorCliente: 500 }, d)).toBeNull()
  })

  it('todo revertido: dice cuánto se restó y cuánto queda', () => {
    expect(mensajeSaldoFavor({ saldoFavorRevertido: 20000, saldoFavorCliente: 15000 }, d))
      .toBe('Se restaron $20000 del saldo a favor del cliente. El saldo a favor del cliente ahora es $15000.')
  })

  it('si no llega el saldo final, no lo inventa', () => {
    expect(mensajeSaldoFavor({ saldoFavorRevertido: 20000 }, d)).toBe('Se restaron $20000 del saldo a favor del cliente.')
  })

  it('parte ya usada: separa lo restado de lo que no se pudo deshacer', () => {
    const m = mensajeSaldoFavor({ saldoFavorRevertido: 8000, saldoFavorYaUsado: 12000, saldoFavorCliente: 0 }, d)
    expect(m).toContain('Se restaron $8000')
    expect(m).toContain('Los otros $12000 ya se habían usado en otros pedidos')
    expect(hayParteYaUsada({ saldoFavorYaUsado: 12000 })).toBe(true)
  })

  it('todo ya usado: no dice que se restó nada', () => {
    const m = mensajeSaldoFavor({ saldoFavorYaUsado: 5000, saldoFavorCliente: 0 }, d) ?? ''
    expect(m).not.toContain('Se restaron')
    expect(m).toContain('$5000')
    expect(m).toContain('ya se habían usado')
  })
})
