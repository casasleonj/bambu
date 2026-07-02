/**
 * Tests para PedidoDTOMapper.
 *
 * Cubre:
 *  - Issue 4: el DTO debe incluir `tipo` derivado de `canal` (PUNTO→'PUNTO', otro→'ENVIO'),
 *    sin depender de un campo raw.
 *  - Issue 3: el DTO debe incluir `factura` (con id, numero, estado, total, saldo, abonos)
 *    cuando el repo la devuelve, o `null` cuando no hay factura asociada.
 */

import { describe, it, expect } from 'vitest'
import { Pedido } from '../../../domain/entities/Pedido'
import { PedidoDTOMapper } from '../PedidoDTOMapper'
import { CanalVO } from '../../../domain/value-objects/Canal'
import { OrigenPedidoVO } from '../../../domain/value-objects/OrigenPedido'
import { EstadoEntregaVO } from '../../../domain/value-objects/EstadoEntrega'
import { EstadoPagoVO } from '../../../domain/value-objects/EstadoPago'
import { PedidoId } from '../../../domain/value-objects/PedidoId'
import { PedidoItem } from '../../../domain/entities/PedidoItem'
import { Money } from '@/shared/domain'
import type { ProductCode } from '@/shared/domain'

function makePedidoFixture(canal: 'PUNTO' | 'DOMICILIO' = 'DOMICILIO'): Pedido {
  return Pedido.create({
    id: PedidoId.from('ped_test_1'),
    numero: 42,
    clienteId: 'cli_test',
    canal: CanalVO.from(canal),
    origen: OrigenPedidoVO.from('PEDIDO'),
    estadoEntrega: EstadoEntregaVO.from('PENDIENTE'),
    estadoPago: EstadoPagoVO.from('PENDIENTE'),
    items: [
      new PedidoItem('PACA_AGUA' as ProductCode, 1, Money.fromDecimal(10000), 'base', 0),
    ],
    total: Money.fromDecimal(10000),
    totalPagado: Money.fromDecimal(0),
    pagos: [],
    fecha: new Date('2026-06-30T10:00:00Z'),
  })
}

describe('PedidoDTOMapper.toResumen — issue 4: campo tipo', () => {
  it('incluye tipo="ENVIO" cuando canal=DOMICILIO', () => {
    const pedido = makePedidoFixture('DOMICILIO')
    const dto = PedidoDTOMapper.toResumen(pedido)
    expect(dto.tipo).toBe('ENVIO')
  })

  it('incluye tipo="PUNTO" cuando canal=PUNTO', () => {
    const pedido = makePedidoFixture('PUNTO')
    const dto = PedidoDTOMapper.toResumen(pedido)
    expect(dto.tipo).toBe('PUNTO')
  })
})

describe('PedidoDTOMapper.toResumen — issue 3: campo factura', () => {
  it('incluye factura=null cuando no se pasa raw', () => {
    const pedido = makePedidoFixture('DOMICILIO')
    const dto = PedidoDTOMapper.toResumen(pedido)
    expect(dto.factura).toBeNull()
  })

  it('incluye factura con shape completa cuando raw.factura existe', () => {
    const pedido = makePedidoFixture('DOMICILIO')
    const raw = {
      factura: {
        id: 'fac_1',
        numero: 'FAC-00001',
        estado: 'EMITIDA',
        total: 10000,
        saldo: 5000,
        abonos: [
          {
            id: 'ab_1',
            numero: 'AB-00001',
            monto: 5000,
            metodoPago: 'EFECTIVO',
            fecha: new Date('2026-06-30T11:00:00Z'),
          },
        ],
      },
    }
    const dto = PedidoDTOMapper.toResumen(pedido, raw)
    expect(dto.factura).not.toBeNull()
    expect(dto.factura).toMatchObject({
      id: 'fac_1',
      numero: 'FAC-00001',
      estado: 'EMITIDA',
      total: 10000,
      saldo: 5000,
    })
    expect(dto.factura!.abonos).toHaveLength(1)
    expect(dto.factura!.abonos[0]).toMatchObject({
      id: 'ab_1',
      numero: 'AB-00001',
      monto: 5000,
      metodoPago: 'EFECTIVO',
    })
  })

  it('incluye factura con abonos=[] cuando raw.factura no tiene abonos', () => {
    const pedido = makePedidoFixture('DOMICILIO')
    const raw = {
      factura: {
        id: 'fac_2',
        numero: 'FAC-00002',
        estado: 'PAGADA',
        total: 5000,
        saldo: 0,
        abonos: [],
      },
    }
    const dto = PedidoDTOMapper.toResumen(pedido, raw)
    expect(dto.factura).not.toBeNull()
    expect(dto.factura!.estado).toBe('PAGADA')
    expect(dto.factura!.abonos).toEqual([])
  })

  it('acepta monto/total/saldo como Prisma Decimal (toNumber)', () => {
    const pedido = makePedidoFixture('DOMICILIO')
    const raw = {
      factura: {
        id: 'fac_3',
        numero: 'FAC-00003',
        estado: 'PARCIAL',
        total: { toNumber: () => 12000 },
        saldo: { toNumber: () => 3000 },
        abonos: [
          {
            id: 'ab_2',
            numero: 'AB-00002',
            monto: { toNumber: () => 9000 },
            metodoPago: 'TRANSFERENCIA',
            fecha: new Date('2026-06-30T12:00:00Z'),
          },
        ],
      },
    }
    const dto = PedidoDTOMapper.toResumen(pedido, raw)
    expect(dto.factura!.total).toBe(12000)
    expect(dto.factura!.saldo).toBe(3000)
    expect(dto.factura!.abonos[0].monto).toBe(9000)
  })

  it('incluye factura=null cuando raw no tiene factura', () => {
    const pedido = makePedidoFixture('DOMICILIO')
    const dto = PedidoDTOMapper.toResumen(pedido, { factura: null })
    expect(dto.factura).toBeNull()
  })
})
