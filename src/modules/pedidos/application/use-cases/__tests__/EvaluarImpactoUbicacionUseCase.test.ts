// @tests EvaluarImpactoUbicacionUseCase (F3) — comportamiento con mocks +
// guard fuente-level de scope (criterio (4) del equipo: "cambio de
// dirección → planificación confirmada → no se modifica automáticamente").
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { EvaluarImpactoUbicacionUseCase } from '../EvaluarImpactoUbicacionUseCase'

vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))

function makeTx(pedidos: Array<{ id: string }>) {
  const createMany = vi.fn().mockResolvedValue({ count: pedidos.length })
  return {
    tx: {
      pedido: { findMany: vi.fn().mockResolvedValue(pedidos) },
      pedidoImpactoUbicacion: { createMany },
    },
    createMany,
  }
}

describe('EvaluarImpactoUbicacionUseCase', () => {
  it('sin cambio real de dirección/barrio → no consulta Pedidos ni crea señales', async () => {
    const { tx, createMany } = makeTx([])
    const useCase = new EvaluarImpactoUbicacionUseCase()

    const result = await useCase.execute({
      origenTipo: 'CLIENTE',
      origenId: 'cli_1',
      direccionAnterior: 'Calle 1',
      barrioAnterior: 'Barrio A',
      direccionNueva: 'Calle 1',
      barrioNueva: 'Barrio A',
      tx: tx as never,
    })

    expect(result.pedidosAfectados).toBe(0)
    expect(tx.pedido.findMany).not.toHaveBeenCalled()
    expect(createMany).not.toHaveBeenCalled()
  })

  it('con cambio real y Pedidos afectados → crea una fila por Pedido y filtra por estadoEntrega PENDIENTE/EN_RUTA + sin snapshot propio', async () => {
    const { tx, createMany } = makeTx([{ id: 'ped_1' }, { id: 'ped_2' }])
    const useCase = new EvaluarImpactoUbicacionUseCase()

    const result = await useCase.execute({
      origenTipo: 'CLIENTE',
      origenId: 'cli_1',
      direccionAnterior: 'Calle 1',
      barrioAnterior: 'Barrio A',
      direccionNueva: 'Calle 2',
      barrioNueva: 'Barrio B',
      tx: tx as never,
    })

    expect(result.pedidosAfectados).toBe(2)
    const whereArg = (tx.pedido.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where
    expect(whereArg.estadoEntrega).toEqual({ in: ['PENDIENTE', 'EN_RUTA'] })
    expect(whereArg.direccionEntrega).toBeNull()
    expect(whereArg.barrioEntrega).toBeNull()
    expect(whereArg.clienteId).toBe('cli_1')
    expect(whereArg.negocioId).toBeNull()

    expect(createMany).toHaveBeenCalledTimes(1)
    const dataArg = (createMany.mock.calls[0][0] as { data: Array<{ pedidoId: string }> }).data
    expect(dataArg).toHaveLength(2)
    expect(dataArg.map(d => d.pedidoId).sort()).toEqual(['ped_1', 'ped_2'])
  })

  it('cambio real pero SIN Pedidos afectados → no crea filas (no genera ruido)', async () => {
    const { tx, createMany } = makeTx([])
    const useCase = new EvaluarImpactoUbicacionUseCase()

    const result = await useCase.execute({
      origenTipo: 'NEGOCIO',
      origenId: 'neg_1',
      direccionAnterior: 'Calle 1',
      barrioAnterior: null,
      direccionNueva: 'Calle 2',
      barrioNueva: null,
      tx: tx as never,
    })

    expect(result.pedidosAfectados).toBe(0)
    expect(createMany).not.toHaveBeenCalled()
  })

  // Criterio (4) del equipo: "cambio de dirección → planificación confirmada
  // → no se modifica automáticamente". Verificado por AUSENCIA de código real
  // — sin imports del planificador, sin tocar PlanDia/Grupo/Parada, sin
  // publicar el evento realtime route_plan.updated. Se descartan los
  // comentarios explicativos (que sí nombran "planificador" al aclarar que
  // NO se toca) para no dar un falso positivo contra la propia intención.
  it('(4) no importa ni referencia código real del planificador — la señal nunca toca PlanDia', () => {
    const sourcePath = join(process.cwd(), 'src/modules/pedidos/application/use-cases/EvaluarImpactoUbicacionUseCase.ts')
    const codeOnly = readFileSync(sourcePath, 'utf-8')
      .split('\n')
      .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n')
    expect(codeOnly).not.toMatch(/from ['"].*planificador/i)
    expect(codeOnly).not.toMatch(/PlanDia|\.grupo\.|\.parada\./)
    expect(codeOnly).not.toContain('route_plan')
  })
})
