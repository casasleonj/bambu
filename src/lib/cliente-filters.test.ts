import { describe, it, expect } from 'vitest'
import {
  buildClientesWhere,
  buildClientesRawWhere,
  getClienteNegocioStatus,
} from './cliente-filters'
import { CANONICAL_CONSUMIDOR_FINAL_ID } from './constants'

describe('buildClientesWhere', () => {
  it('siempre excluye clientes inactivos y el canónico CONSUMIDOR_FINAL', () => {
    const where = buildClientesWhere({})
    expect(where).toMatchObject({
      activo: true,
      NOT: { id: CANONICAL_CONSUMIDOR_FINAL_ID },
    })
  })

  it('con "mostrarNegocio=con" matchea negocio formal activo o legacy', () => {
    const where = buildClientesWhere({ mostrarNegocio: 'con' })
    expect(where.OR).toEqual([
      { negocios: { some: { activo: true } } },
      { nombreNegocio: { not: '' } },
    ])
  })

  it('con "mostrarNegocio=sin" exige 0 negocios formales activos y 0 legacy', () => {
    const where = buildClientesWhere({ mostrarNegocio: 'sin' })
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { NOT: { negocios: { some: { activo: true } } } },
        { OR: [{ nombreNegocio: null }, { nombreNegocio: '' }] },
      ])
    )
  })

  it('con "todosNegociosConLink=true" fuerza al menos 1 negocio formal y niega negocios activos sin link', () => {
    const where = buildClientesWhere({ todosNegociosConLink: 'true' })
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { negocios: { some: { activo: true } } },
        {
          NOT: {
            negocios: {
              some: {
                activo: true,
                OR: [{ linkUbicacion: null }, { linkUbicacion: '' }],
              },
            },
          },
        },
      ])
    )
  })

  it('con "clienteConLink=true" filtra Cliente.linkUbicacion no vacío', () => {
    const where = buildClientesWhere({ clienteConLink: 'true' })
    expect(where.linkUbicacion).toEqual({ not: '' })
  })

  it('combina "mostrarNegocio=con" + "clienteConLink=true" con AND/OR', () => {
    const where = buildClientesWhere({
      mostrarNegocio: 'con',
      clienteConLink: 'true',
    })
    expect(where.OR).toBeDefined()
    expect(where.AND).toBeUndefined()
    expect(where.linkUbicacion).toEqual({ not: '' })
  })

  it('combina "mostrarNegocio=sin" + "clienteConLink=true"', () => {
    const where = buildClientesWhere({
      mostrarNegocio: 'sin',
      clienteConLink: 'true',
    })
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { NOT: { negocios: { some: { activo: true } } } },
        { OR: [{ nombreNegocio: null }, { nombreNegocio: '' }] },
      ])
    )
    expect(where.linkUbicacion).toEqual({ not: '' })
  })

  it('responde a filtros de riesgo legacy', () => {
    const where = buildClientesWhere({ bloqueado: 'true' })
    expect(where.bloqueado).toBe(true)

    const where2 = buildClientesWhere({ reclamaciones: 'gte3' })
    expect(where2.reclamaciones).toEqual({ gte: 3 })

    const where3 = buildClientesWhere({ noVerificado: 'true' })
    expect(where3.verificado).toBe(false)
  })
})

describe('buildClientesRawWhere', () => {
  it('devuelve string vacío sin filtros', () => {
    expect(buildClientesRawWhere({})).toBe('')
  })

  it('genera condición SQL para "mostrarNegocio=con"', () => {
    const sql = buildClientesRawWhere({ mostrarNegocio: 'con' })
    expect(sql).toContain('EXISTS (SELECT 1 FROM "Negocio"')
    expect(sql).toContain('NULLIF(c."nombreNegocio", \'\') IS NOT NULL')
  })

  it('genera condición SQL para "mostrarNegocio=sin"', () => {
    const sql = buildClientesRawWhere({ mostrarNegocio: 'sin' })
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM "Negocio"')
    expect(sql).toContain('NULLIF(c."nombreNegocio", \'\') IS NULL')
  })

  it('genera condición SQL para "todosNegociosConLink=true"', () => {
    const sql = buildClientesRawWhere({ todosNegociosConLink: 'true' })
    expect(sql).toContain('EXISTS (SELECT 1 FROM "Negocio"')
    expect(sql).toContain('n."linkUbicacion" IS NULL OR n."linkUbicacion" = \'\'')
  })

  it('genera condición SQL para "clienteConLink=true"', () => {
    const sql = buildClientesRawWhere({ clienteConLink: 'true' })
    expect(sql).toContain('NULLIF(c."linkUbicacion", \'\') IS NOT NULL')
  })

  it('concatena múltiples filtros con AND', () => {
    const sql = buildClientesRawWhere({
      mostrarNegocio: 'con',
      todosNegociosConLink: 'true',
    })
    expect(sql.startsWith('AND ')).toBe(true)
    expect(sql.split('AND').length).toBeGreaterThan(2)
  })
})

describe('getClienteNegocioStatus', () => {
  it('cliente sin negocio ni link', () => {
    const status = getClienteNegocioStatus({})
    expect(status).toEqual({
      tieneNegocioFormal: false,
      tieneNegocioLegacy: false,
      tieneNegocio: false,
      totalNegociosActivos: 0,
      negociosConLink: 0,
      negociosSinLink: 0,
      clienteConLink: false,
    })
  })

  it('cliente con negocio legacy puro', () => {
    const status = getClienteNegocioStatus({
      nombreNegocio: 'Tienda Don Pepe',
      negocios: [],
    })
    expect(status.tieneNegocioLegacy).toBe(true)
    expect(status.tieneNegocioFormal).toBe(false)
    expect(status.tieneNegocio).toBe(true)
  })

  it('cliente con negocio formal activo con link', () => {
    const status = getClienteNegocioStatus({
      negocios: [{ activo: true, linkUbicacion: 'https://maps.google.com/?q=1,2' }],
    })
    expect(status.tieneNegocioFormal).toBe(true)
    expect(status.totalNegociosActivos).toBe(1)
    expect(status.negociosConLink).toBe(1)
    expect(status.negociosSinLink).toBe(0)
  })

  it('cliente con negocio formal activo sin link', () => {
    const status = getClienteNegocioStatus({
      negocios: [{ activo: true, linkUbicacion: null }],
    })
    expect(status.tieneNegocioFormal).toBe(true)
    expect(status.negociosConLink).toBe(0)
    expect(status.negociosSinLink).toBe(1)
  })

  it('cliente con negocio inactivo se ignora', () => {
    const status = getClienteNegocioStatus({
      negocios: [{ activo: false, linkUbicacion: 'https://maps.google.com/?q=1,2' }],
    })
    expect(status.tieneNegocioFormal).toBe(false)
    expect(status.totalNegociosActivos).toBe(0)
  })

  it('cliente con link propio', () => {
    const status = getClienteNegocioStatus({
      linkUbicacion: 'https://maps.google.com/?q=1,2',
    })
    expect(status.clienteConLink).toBe(true)
  })

  it('mezcla: 2 negocios activos, 1 con link', () => {
    const status = getClienteNegocioStatus({
      negocios: [
        { activo: true, linkUbicacion: 'https://maps.google.com/?q=1,2' },
        { activo: true, linkUbicacion: '' },
      ],
    })
    expect(status.totalNegociosActivos).toBe(2)
    expect(status.negociosConLink).toBe(1)
    expect(status.negociosSinLink).toBe(1)
  })
})
