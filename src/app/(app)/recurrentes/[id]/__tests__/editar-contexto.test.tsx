import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  EditarRecurrenteClient,
  type PlantillaSerialized,
} from '../editar-client'
import { vueltaAHabituales } from '@/lib/pedidos-contexto'
const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const plantilla: PlantillaSerialized = {
  id: 't1',
  clienteId: null,
  negocioId: 'n1',
  activo: true,
  cadaNDias: 7,
  canal: 'DOMICILIO',
  horaPreferida: null,
  productos: { PACA_AGUA: 3 },
  ultimaGeneracion: null,
  proxGeneracion: '2026-11-01T05:00:00.000Z',
  saltos: [],
  notas: null,
  cliente: null,
  negocio: {
    id: 'n1',
    nombre: 'La Esquina',
    direccion: 'Calle del Negocio 12',
    barrio: 'Centro',
    linkUbicacion: 'https://maps.google.com/?q=4.6,-74.08',
    cliente: {
      id: 'c1',
      nombre: 'Ana',
      telefono: '3000000000',
      barrio: 'Norte',
      direccion: 'Casa del Propietario',
      linkUbicacion: null,
    },
  },
}
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  push.mockClear()
  fetchMock = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes('configs')
            ? {
                success: true,
                productos: [
                  {
                    codigo: 'PACA_AGUA',
                    nombre: 'Paca Agua',
                    aplicaDomicilio: true,
                    sobreCostoDomicilio: 0,
                  },
                ],
              }
            : url.includes('resolver')
              ? { precios: { PACA_AGUA: { precio: 2800 } } }
              : { success: true },
        ),
        { status: 200 },
      ),
  )
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())
it('edita el negocio sin exigir cliente directo y resuelve sus precios y dirección en el contexto correcto', async () => {
  const { container } = render(<EditarRecurrenteClient plantilla={plantilla} />)
  expect(
    screen.getByRole('heading', { name: 'Ajustar pedido habitual' }),
  ).toBeVisible()
  expect(screen.getByText('La Esquina')).toBeVisible()
  expect(container).toHaveTextContent('Calle del Negocio 12')
  expect(container).not.toHaveTextContent('Casa del Propietario')
  await waitFor(
    () =>
      expect(
        fetchMock.mock.calls.some((c) =>
          c[0].includes('/api/precios/resolver'),
        ),
      ).toBe(true),
    { timeout: 5000 },
  )
  const llamada = fetchMock.mock.calls.find((c) =>
    c[0].includes('/api/precios/resolver'),
  )!
  expect(JSON.parse((llamada[1] as RequestInit).body as string)).toMatchObject({
    clienteId: 'c1',
    negocioId: 'n1',
  })
})
it('guardar conserva la relación original y vuelve a la búsqueda del catálogo', async () => {
  const volver = '/recurrentes?q=Ana&estado=inactivos'
  render(<EditarRecurrenteClient plantilla={plantilla} volverHref={volver} />)
  await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith(volver))
  const llamada = fetchMock.mock.calls.find((c) =>
    c[0].startsWith('/api/recurrentes?id='),
  )!
  const body = JSON.parse((llamada[1] as RequestInit).body as string)
  expect(body).not.toHaveProperty('clienteId')
  expect(body).not.toHaveProperty('negocioId')
  expect(plantilla.clienteId).toBeNull()
})
it('el regreso acepta solo el catálogo interno y rechaza URLs externas, otras rutas y valores repetidos', () => {
  expect(vueltaAHabituales('/recurrentes?q=Ana&estado=inactivos')).toBe(
    '/recurrentes?q=Ana&estado=inactivos',
  )
  for (const value of [
    'https://evil.invalid/recurrentes',
    '//evil.invalid/recurrentes',
    '/pedidos',
    '/recurrentes/t1',
    ['/recurrentes'],
  ])
    expect(vueltaAHabituales(value)).toBeNull()
})
