// @tests #384 — la búsqueda del servidor (fetchClientesList) equivale a la local
// (scoreCliente): varias palabras (AND), sin acentos, celular por dígitos, relación
// del contacto, tipo de negocio, y orden por relevancia ANTES de paginar.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect } from './setup'
import { fetchClientesList } from '@/lib/clientes-repo'
import { matchCliente } from '@/lib/cliente-search'

type Fila = { id: string; nombre: string; apellido?: string | null }

async function buscar(search: string, extra: { pageSize?: number; page?: number } = {}) {
  const r = await fetchClientesList({ search, pageSize: 50, ...extra } as never)
  return { ...r, filas: r.clientes as Fila[] }
}

const ids = (filas: Fila[]) => filas.map((f) => f.id)

let juan: string
let juanB: string
let zulma: string

beforeAll(async () => {
  await resetAndSeed()
  // relleno creado PRIMERO: con orden por id taparía al objetivo en la primera página
  for (let i = 0; i < 12; i++) {
    await testPrisma.cliente.create({
      data: { nombre: `Relleno${i}`, apellido: 'Gómez', telefono: `3200${100000 + i}`, notas: 'amigo de zulma', barrio: 'Centro' },
    })
  }
  const j = await testPrisma.cliente.create({
    data: { nombre: 'Juan', apellido: 'Pérez', telefono: '3001234567', direccion: 'Cra 5 # 6-7', barrio: 'Norte' },
  })
  juan = j.id
  await testPrisma.contactoCliente.create({ data: { clienteId: juan, nombre: 'Ángela Quiñones', telefono: '3119876543', relacion: 'esposa' } })
  await testPrisma.negocio.create({ data: { clienteId: juan, nombre: 'Panadería La Esperanza', tipoNegocio: 'Panadería', direccion: 'Cll 9 # 1-2', barrio: 'Sur' } })
  const jb = await testPrisma.cliente.create({ data: { nombre: 'Juan', apellido: 'Pérez Otero', telefono: '3015550001', direccion: 'Cll 80', barrio: 'Occidente' } })
  juanB = jb.id
  const z = await testPrisma.cliente.create({ data: { nombre: 'Zulma', apellido: 'Pérez', telefono: '3105550000', direccion: 'Cra 1', barrio: 'Oeste' } })
  zulma = z.id
})

afterAll(async () => {
  await disconnect()
})

describe('búsqueda del servidor = búsqueda local (#384)', () => {
  it('celular con espacios, con +57 y con guiones encuentran al titular', async () => {
    for (const q of ['3001234567', '300 123 4567', '+57 300 123 4567', '300-123-4567', '(300) 123 4567']) {
      expect(ids((await buscar(q)).filas), q).toEqual([juan])
    }
  })

  it('celular y nombre del contacto', async () => {
    expect(ids((await buscar('3119876543')).filas)).toEqual([juan])
    expect(ids((await buscar('311 987 6543')).filas)).toEqual([juan])
    expect(ids((await buscar('angela')).filas)).toEqual([juan]) // sin acento
    expect(ids((await buscar('ÁNGELA')).filas)).toEqual([juan]) // con acento y mayúsculas
    expect(ids((await buscar('quinones')).filas)).toEqual([juan]) // ñ → n
  })

  it('relación del contacto', async () => {
    expect(ids((await buscar('esposa')).filas)).toEqual([juan])
  })

  it('negocio y tipo de negocio, sin acento', async () => {
    expect(ids((await buscar('esperanza')).filas)).toEqual([juan])
    expect(ids((await buscar('panaderia')).filas)).toEqual([juan])
    expect(ids((await buscar('panadería la esperanza')).filas)).toEqual([juan])
  })

  it('varias palabras: TODAS deben coincidir, cada una en algún campo', async () => {
    // negocio + dueño: solo el dueño de la panadería, no su homónimo
    expect(ids((await buscar('panaderia juan')).filas)).toEqual([juan])
    // nombre + apellido repartidos en columnas distintas
    expect(ids((await buscar('zulma perez')).filas)).toEqual([zulma])
    expect(ids((await buscar('perez juan')).filas).sort()).toEqual([juan, juanB].sort())
  })

  it('para cada consulta, los ids del servidor son los que acepta la búsqueda local', async () => {
    const todos = await fetchClientesList({ all: true } as never)
    for (const q of ['juan', 'perez', 'esposa', 'panaderia juan', '300 123', 'norte', 'occidente', 'zulma', 'relleno1']) {
      const locales = (todos.clientes as Array<never>).filter((c) => matchCliente(c, q)).map((c: Fila) => c.id).sort()
      const servidor = ids((await buscar(q)).filas).sort()
      expect(servidor, q).toEqual(locales)
    }
  })
})

describe('orden por relevancia antes de paginar (#384)', () => {
  it('"zulma": el cliente con ese NOMBRE sale primero aunque 12 rellenos la tengan solo en notas y se creen antes', async () => {
    const r = await buscar('zulma', { pageSize: 8 })
    expect(r.filas[0].id).toBe(zulma)
    expect(r.total).toBe(13)
    expect(r.filas).toHaveLength(8)
  })

  it('segunda página: no repite y completa el total', async () => {
    const p1 = await buscar('zulma', { pageSize: 8, page: 1 })
    const p2 = await buscar('zulma', { pageSize: 8, page: 2 })
    expect(p2.filas).toHaveLength(5)
    expect(new Set([...ids(p1.filas), ...ids(p2.filas)]).size).toBe(13)
  })
})

describe('tolerancia a erratas (#384)', () => {
  it('sin coincidencia exacta, un nombre mal escrito aún encuentra al cliente (difuso)', async () => {
    const r = await buscar('zulmaa')
    expect(ids(r.filas)).toContain(zulma)
  })

  it('con coincidencia exacta no se agregan difusos de ruido', async () => {
    const r = await buscar('panaderia juan')
    expect(ids(r.filas)).toEqual([juan])
  })
})

describe('forma del resultado', () => {
  it('trae lo que la lista y el hook necesitan (contactos, negocios, saldo, clienteId)', async () => {
    const r = await buscar('esposa')
    const c = r.clientes[0] as unknown as { contactos: Array<{ relacion: string }>; negocios: Array<{ nombre: string }>; saldoPendiente: number; clienteId: string }
    expect(c.contactos[0].relacion).toBe('esposa')
    expect(c.negocios[0].nombre).toBe('Panadería La Esperanza')
    expect(c.saldoPendiente).toBe(0)
    expect(c.clienteId).toBe(juan)
  })
})
