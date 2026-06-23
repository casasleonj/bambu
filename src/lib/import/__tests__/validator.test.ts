import { describe, it, expect } from 'vitest'
import {
  validateCliente,
  validatePedido,
  validatePago,
  validateGasto,
  validateEmbarque,
  validateProduccion,
  validateCierre,
  detectWorkerPayment,
} from '../validator'
import type { RawRow } from '../types'

describe('validator', () => {
  describe('validateCliente', () => {
    it('validates a complete client', () => {
      const row: RawRow = {
        nombre: 'María Pérez',
        telefono: '3001234567',
        barrio: 'Centro',
        contacto1_nombre: 'Juan',
        contacto1_telefono: '3119876543',
        contacto1_relacion: 'Esposo',
      }
      const result = validateCliente(row)

      expect(result.errors).toHaveLength(0)
      expect(result.normalized).toBeDefined()
      expect(result.normalized?.nombre).toBe('maria perez')
      expect(result.normalized?.telefono).toBe('573001234567')
      expect(result.normalized?.contactos).toHaveLength(1)
    })

    it('requires nombre and telefono', () => {
      const result = validateCliente({})

      expect(result.errors).toHaveLength(2)
      expect(result.errors.map((e) => e.field)).toContain('nombre')
      expect(result.errors.map((e) => e.field)).toContain('telefono')
      expect(result.normalized).toBeUndefined()
    })
  })

  describe('validatePedido', () => {
    it('validates a pedido with products', () => {
      const row: RawRow = {
        fecha: '15/03/2024',
        cliente_telefono: '3001234567',
        paca_agua_ped: 2,
        paca_agua_precio: 12000,
      }
      const result = validatePedido(row)

      expect(result.errors).toHaveLength(0)
      expect(result.normalized?.items).toHaveLength(1)
      expect(result.normalized?.items[0].producto).toBe('PACA_AGUA')
      expect(result.normalized?.items[0].cantPedido).toBe(2)
    })

    it('warns when pedido has no products', () => {
      const row: RawRow = {
        fecha: '15/03/2024',
        cliente_telefono: '3001234567',
      }
      const result = validatePedido(row)

      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0].field).toBe('items')
    })
  })

  describe('validatePago', () => {
    it('validates a pago and defaults metodo to EFECTIVO', () => {
      const row: RawRow = {
        fecha: '20/03/2024',
        monto: 50000,
        cliente_telefono: '3001234567',
      }
      const result = validatePago(row)

      expect(result.errors).toHaveLength(0)
      expect(result.normalized?.metodo).toBe('EFECTIVO')
      expect(result.normalized?.monto).toBe(50000)
    })

    it('requires positive monto', () => {
      const row: RawRow = {
        fecha: '20/03/2024',
        monto: 0,
      }
      const result = validatePago(row)

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].field).toBe('monto')
    })
  })

  describe('validateGasto', () => {
    it('validates a gasto', () => {
      const row: RawRow = {
        fecha: '20/03/2024',
        descripcion: 'Gasolina',
        monto: 35000,
      }
      const result = validateGasto(row)

      expect(result.errors).toHaveLength(0)
      expect(result.normalized?.descripcion).toBe('Gasolina')
    })
  })

  describe('validateEmbarque', () => {
    it('validates an embarque', () => {
      const row: RawRow = {
        fecha: '20/03/2024',
        repartidor_nombre: 'Carlos',
        pacas_agua: 30,
      }
      const result = validateEmbarque(row)

      expect(result.errors).toHaveLength(0)
      expect(result.normalized?.pacasAgua).toBe(30)
    })
  })

  describe('validateProduccion', () => {
    it('validates a produccion', () => {
      const row: RawRow = {
        fecha: '20/03/2024',
        turno: 'MAÑANA',
        trabajador_nombre: 'Pedro',
        producto: 'PACA_AGUA',
        conteo_a: 28,
        conteo_b: 30,
      }
      const result = validateProduccion(row)

      expect(result.errors).toHaveLength(0)
      expect(result.normalized?.turno).toBe('MANANA')
      expect(result.normalized?.items).toHaveLength(1)
    })
  })

  describe('validateCierre', () => {
    it('validates a cierre', () => {
      const row: RawRow = {
        fecha: '20/03/2024',
        num_pedidos: 12,
        total_ventas: 285000,
        efectivo: 180000,
      }
      const result = validateCierre(row)

      expect(result.errors).toHaveLength(0)
      expect(result.normalized?.numPedidos).toBe(12)
      expect(result.normalized?.totalVentas).toBe(285000)
      expect(result.normalized?.efectivo).toBe(180000)
    })
  })

  describe('detectWorkerPayment', () => {
    it('detects nómina keyword', () => {
      const result = detectWorkerPayment('Nómina repartidor Carlos')
      expect(result.isPayment).toBe(true)
      expect(result.matchedKeywords.length).toBeGreaterThan(0)
      expect(result.suggestedCategory).toBe('PAGO_PERSONAL')
    })

    it('detects comisión keyword', () => {
      const result = detectWorkerPayment('Pago comisión Pedro sellador')
      expect(result.isPayment).toBe(true)
      expect(result.matchedKeywords.length).toBeGreaterThan(0)
    })

    it('does not flag normal gasto', () => {
      const result = detectWorkerPayment('Compra gasolina')
      expect(result.isPayment).toBe(false)
      expect(result.suggestedCategory).toBe('OTRO')
    })
  })
})
