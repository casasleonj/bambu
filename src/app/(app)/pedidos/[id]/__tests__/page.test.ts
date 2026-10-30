// @tests P1-1 PR A (#377): /pedidos/[id] redirige a la lista con ?openPedido=
import { describe, it, expect, vi, beforeEach } from 'vitest'

const redirect = vi.fn()
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))

import PedidoDetallePage from '../page'

beforeEach(() => redirect.mockClear())

describe('/pedidos/[id]', () => {
  it('redirige a /pedidos?openPedido=<id>', async () => {
    await PedidoDetallePage({ params: Promise.resolve({ id: 'cmx9abc' }) })
    expect(redirect).toHaveBeenCalledWith('/pedidos?openPedido=cmx9abc')
  })

  it('codifica el id para que no rompa la URL', async () => {
    await PedidoDetallePage({ params: Promise.resolve({ id: 'a b&c=d' }) })
    expect(redirect).toHaveBeenCalledWith('/pedidos?openPedido=a%20b%26c%3Dd')
  })

  it('conserva la consulta interna de origen al abrir en otra pestaña', async () => {
    await PedidoDetallePage({params:Promise.resolve({id:'p1'}),searchParams:Promise.resolve({volver:'/pedidos?canal=PUNTO&desdeHora=10%3A00&openPedido=otro'})})
    expect(redirect).toHaveBeenCalledWith('/pedidos?canal=PUNTO&desdeHora=10%3A00&openPedido=p1')
  })

  it.each(['https://externo.invalid/','//externo.invalid/pedidos','/facturas',['/pedidos','/facturas']])('no sigue retornos externos o de otra ruta: %s',async volver=>{
    await PedidoDetallePage({params:Promise.resolve({id:'p1'}),searchParams:Promise.resolve({volver})})
    expect(redirect).toHaveBeenCalledWith('/pedidos?openPedido=p1')
  })
})
