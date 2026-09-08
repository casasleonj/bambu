import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePeek } from '../use-peek'
import { __resetPeekCache } from '../peek-cache'
import type { Pedido } from '../types'

const p = (id: string): Pedido => ({
  id, numero: Number(id.replace(/\D/g, '')) || 1, clienteId: 'c1', nombreCli: 'X', telefonoCli: '',
  zonaCli: '', barrioCli: '', tipo: 'DOMICILIO', canal: 'DOMICILIO', estado: 'PENDIENTE',
  origen: 'PEDIDO', estadoEntrega: 'PENDIENTE', estadoPago: 'PENDIENTE', items: [],
  cPacaAguaPed: 0, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0, cBolsaAguaPed: 0, cBolsaHieloPed: 0,
  cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
  precioPacaAgua: 0, precioPacaHielo: 0, precioBotellonFab: 0, precioBotellonDom: 0, precioBolsaAgua: 0, precioBolsaHielo: 0,
  totalPagado: 0, total: 100, saldo: 100, fecha: '2026-09-07T08:00:00.000Z',
})

const list = [p('p1'), p('p2'), p('p3')]

beforeEach(() => {
  __resetPeekCache()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const id = String(url).split('/').pop()
    return { ok: true, json: async () => ({ success: true, pedido: { id, pendienteN2: null, embarqueResumen: null, pedidosVinculados: [], casosAbiertos: [], marker: `layer2-${id}` } }) }
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('usePeek', () => {
  it('capa 1 sale de la lista sin fetch; capa 2 dispara un fetch', async () => {
    const { result } = renderHook(() => usePeek(list))
    act(() => result.current.open(list[0]))
    expect(result.current.activeId).toBe('p1')
    expect(result.current.layer1?.id).toBe('p1')       // instantáneo
    await waitFor(() => expect(result.current.layer2).toBeTruthy())
    expect((result.current.layer2 as unknown as { marker: string }).marker).toBe('layer2-p1')
    expect((fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
  })

  it('re-open del mismo id dentro del TTL no re-fetchea (caché)', async () => {
    const { result } = renderHook(() => usePeek(list))
    act(() => result.current.open(list[0]))
    await waitFor(() => expect(result.current.layer2).toBeTruthy())
    act(() => result.current.close())
    act(() => result.current.open(list[0]))
    await waitFor(() => expect(result.current.layer2).toBeTruthy())
    expect((fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
  })

  it('nav("next")/nav("prev") recorre la lista y trae la capa 2 de cada uno', async () => {
    const { result } = renderHook(() => usePeek(list))
    act(() => result.current.open(list[0]))
    await waitFor(() => expect(result.current.layer2).toBeTruthy())
    act(() => result.current.nav('next'))
    expect(result.current.activeId).toBe('p2')
    await waitFor(() => expect((result.current.layer2 as unknown as { marker: string })?.marker).toBe('layer2-p2'))
    act(() => result.current.nav('prev'))
    expect(result.current.activeId).toBe('p1')
  })

  it('nav no se sale de los límites de la lista', () => {
    const { result } = renderHook(() => usePeek(list))
    act(() => result.current.open(list[0]))
    act(() => result.current.nav('prev'))
    expect(result.current.activeId).toBe('p1')
  })

  it('si la operación abierta desaparece de la lista, el peek se cierra', () => {
    const { result, rerender } = renderHook(({ l }) => usePeek(l), { initialProps: { l: list } })
    act(() => result.current.open(list[1]))
    expect(result.current.activeId).toBe('p2')
    rerender({ l: [list[0], list[2]] })
    expect(result.current.activeId).toBeNull()
  })
})
