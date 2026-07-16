import { describe, it, expect, beforeEach } from 'vitest'
import { reportBug, getAllFindings, clearFindings, formatBug, type BugFinding } from '@/lib/qa-reportBug'

describe('reportBug helper', () => {
  beforeEach(() => {
    clearFindings()
  })

  it('stores a finding with all required fields', () => {
    const finding: BugFinding = {
      severity: 'CRITICAL',
      category: 'Seguridad',
      vista: '/admin/usuarios',
      rol: 'repartidor',
      pasos: '1. Login repartidor 2. GET /api/users',
      esperado: '403 Forbidden',
      real: '200 OK con lista de usuarios',
      evidencia: 'response body',
      conocidoEnAgentsMd: 'no',
    }
    reportBug(finding)

    const all = getAllFindings()
    expect(all).toHaveLength(1)
    expect(all[0].severity).toBe('CRITICAL')
    expect(all[0].category).toBe('Seguridad')
    expect(all[0].vista).toBe('/admin/usuarios')
  })

  it('stores evidence as-is in pure helper', () => {
    const finding: BugFinding = {
      severity: 'HIGH',
      category: 'Funcional',
      vista: '/pedidos',
      pasos: 'click guardar 2 veces',
      esperado: 'un solo pedido',
      real: 'pedido duplicado',
      evidencia: 'screenshot.png',
      conocidoEnAgentsMd: 'no',
    }
    reportBug(finding)

    const all = getAllFindings()
    expect(all[0].evidencia).toBe('screenshot.png')
  })

  it('clearFindings resets the list', () => {
    reportBug({
      severity: 'LOW',
      category: 'UX',
      vista: '/login',
      pasos: 'ver pagina',
      esperado: 'texto claro',
      real: 'texto confuso',
      evidencia: 'n/a',
      conocidoEnAgentsMd: 'no',
    })
    expect(getAllFindings()).toHaveLength(1)
    clearFindings()
    expect(getAllFindings()).toHaveLength(0)
  })

  it('formatBug outputs v2.0 format', () => {
    const finding: BugFinding = {
      severity: 'MEDIUM',
      category: 'Permisos',
      vista: '/clientes',
      rol: 'contador',
      pasos: 'navegar',
      esperado: 'acceso',
      real: 'redirect',
      evidencia: 'url',
      conocidoEnAgentsMd: 'si',
    }
    const formatted = formatBug(finding)
    expect(formatted).toContain('[MEDIUM][Permisos]')
    expect(formatted).toContain('/clientes (contador)')
    expect(formatted).toContain('Bug conocido en AGENTS.md: si')
  })
})
