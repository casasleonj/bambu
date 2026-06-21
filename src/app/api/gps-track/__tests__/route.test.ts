// @tests POST /api/gps-track — Fase 2 GPS track endpoint

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routePath = join(process.cwd(), 'src/app/api/gps-track/route.ts')
const validatorsPath = join(process.cwd(), 'src/lib/validators.ts')
const routeSource = readFileSync(routePath, 'utf-8')
const validatorsSource = readFileSync(validatorsPath, 'utf-8')

describe('POST /api/gps-track — estructura', () => {
  it('exporta una función POST', () => {
    expect(routeSource).toMatch(/export\s+async\s+function\s+POST\s*\(/)
  })

  it('requiere autenticación', () => {
    expect(routeSource).toMatch(/requireAuth\s*\(\s*\)/)
  })

  it('restringe por rol REPARTIDOR o ADMIN', () => {
    expect(routeSource).toMatch(/requireRole\s*\(\s*\[\s*ROLES\.REPARTIDOR\s*,\s*ROLES\.ADMIN\s*\]\s*,/)
  })

  it('usa GpsTrackCreateSchema para validar el body', () => {
    expect(routeSource).toMatch(/GpsTrackCreateSchema\.safeParse\s*\(/)
  })

  it('el schema incluye los campos requeridos', () => {
    expect(validatorsSource).toMatch(/GpsTrackCreateSchema/)
    expect(validatorsSource).toMatch(/embarqueId:/)
    expect(validatorsSource).toMatch(/lat:/)
    expect(validatorsSource).toMatch(/lng:/)
    expect(validatorsSource).toMatch(/accuracy:/)
    expect(validatorsSource).toMatch(/timestamp:/)
    expect(validatorsSource).toMatch(/offlineId:/)
  })

  it('valida rango de latitud y longitud', () => {
    expect(validatorsSource).toMatch(/lat:\s*z\.number\(\)\.min\(-90\)\.max\(90\)/)
    expect(validatorsSource).toMatch(/lng:\s*z\.number\(\)\.min\(-180\)\.max\(180\)/)
  })

  it('verifica que el embarque existe', () => {
    expect(routeSource).toMatch(/prisma\.embarque\.findUnique\s*\(\s*\{[\s\S]*?where:\s*\{\s*id:\s*embarqueId\s*\}/)
  })

  it('restringe a REPARTIDOR a sus propios embarques', () => {
    expect(routeSource).toMatch(/user\?\.role\s*===\s*ROLES\.REPARTIDOR/)
    expect(routeSource).toMatch(/embarque\.trabajador\.userId\s*!==\s*user\.id/)
    expect(routeSource).toMatch(/apiError\s*\(\s*['"]No tiene permisos para registrar GPS en este embarque['"]\s*,\s*403\s*\)/)
  })

  it('crea el track con prisma.gpsTrack.create', () => {
    expect(routeSource).toMatch(/prisma\.gpsTrack\.create\s*\(\s*\{/)
  })

  it('persiste accuracy opcional', () => {
    expect(routeSource).toMatch(/accuracy:\s*accuracy\s*\?\?\s*null/)
  })

  it('usa timestamp del cliente o fecha actual por defecto', () => {
    expect(routeSource).toMatch(/timestamp:\s*timestamp\s*\?\s*new Date\(timestamp\)\s*:\s*new Date\(\)/)
  })

  it('asocia trabajadorId del embarque', () => {
    expect(routeSource).toMatch(/trabajadorId:\s*embarque\.trabajadorId/)
  })

  it('marca synced:true al crear', () => {
    expect(routeSource).toMatch(/synced:\s*true/)
  })

  it('devuelve 201 con el track creado', () => {
    expect(routeSource).toMatch(/apiSuccess\s*\(\s*\{\s*track\s*\}\s*,\s*201\s*\)/)
  })

  it('loggea la creación via logAudit', () => {
    expect(routeSource).toMatch(/logAudit\s*\(\s*\{[\s\S]*?entidad:\s*['"]GpsTrack['"]/)
  })

  it('maneja error de JSON inválido', () => {
    expect(routeSource).toMatch(/SyntaxError/)
    expect(routeSource).toMatch(/Body JSON inválido/)
  })
})
