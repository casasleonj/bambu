import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import type { Recurrente, PreviewItem } from '../types'
import type { EnvioHabituales } from '@/lib/habituales-contrato'
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'u', role: 'ADMIN' } },
    status: 'authenticated',
  }),
}))
import RecurrentesClient from '..'
import { GeneracionHabituales } from '../generacion-habituales'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status })
const tienda: Recurrente = {
  id: 't1',
  clienteId: null,
  negocioId: 'n1',
  cliente: null,
  negocio: {
    id: 'n1',
    nombre: 'La Esquina',
    cliente: { id: 'c1', nombre: 'Ana' },
  },
  activo: true,
  cadaNDias: 7,
  canal: 'DOMICILIO',
  tipo: 'ENVIO',
  productos: { PACA_AGUA: 3, PACA_HIELO: 2 },
  ultimaGeneracion: null,
  proxGeneracion: '2026-11-01T05:00:00.000Z',
  horaPreferida: null,
  saltos: [],
  pausaHasta: null,
  notas: null,
}
const persona: Recurrente = {
  ...tienda,
  id: 't2',
  activo: false,
  negocioId: null,
  negocio: null,
  clienteId: 'c2',
  cliente: { id: 'c2', nombre: 'Pedro', telefono: '3000000000' },
  cadaNDias: 3,
}
const item: PreviewItem = {
  recurrenteId: 't1',
  version: '2026-10-29T05:00:00.000Z',
  negocioId: 'n1',
  negocioNombre: 'La Esquina',
  clienteNombre: 'Ana',
  cadaNDias: 7,
  proximaFecha: '2026-10-30T05:00:00.000Z',
  horaPreferida: null,
  clienteBloqueado: false,
  esDomingo: false,
  cumpleMinimo: true,
  entregaInsuficiente: false,
  pedidosPendientes: [],
  pedidosConDeuda: [],
  pedidosPagados: [],
  cantidadBase: { cPacaAgua: 3, cPacaHielo: 2 },
  saltos: [],
  sugerencias: [
    'NORMAL',
    'CON_PENDIENTES',
    'SOLO_PENDIENTES',
    'APLICAR_CREDITO',
    'SALTAR',
  ].map((tipo, i) => ({
    tipo: tipo as PreviewItem['sugerencias'][number]['tipo'],
    label: [
      'Generar habitual',
      'Incluir pendientes',
      'Solo pendientes',
      'Aplicar crédito',
      'Saltar esta vez',
    ][i],
    descripcion: [
      'Preparar lo habitual',
      'Añadir los pendientes',
      'Preparar solo los pendientes',
      'Usar el prepago registrado',
      'No generar esta fecha',
    ][i],
    totalPacas: tipo === 'SALTAR' ? 0 : 5,
    totalValor: 10000,
  })),
}
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  window.history.replaceState({}, '', '/recurrentes')
  localStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('Catálogo independiente de la revisión', () => {
  it('no acepta filtros en el HTML previo a hidratar y conserva búsqueda más estado al habilitarlos', async () => {
    fetchMock.mockImplementation(async () =>
      json({ success: true, hoy: '2026-10-30', preview: [] }),
    )
    const server = document.createElement('div')
    server.innerHTML = renderToString(
      <RecurrentesClient initialRecurrentes={[tienda, persona]} />,
    )
    expect(
      within(server).getByRole('searchbox', {
        name: 'Buscar cliente o negocio',
      }),
    ).toBeDisabled()
    expect(
      within(server).getByRole('button', { name: 'Activos' }),
    ).toBeDisabled()
    render(<RecurrentesClient initialRecurrentes={[tienda, persona]} />)
    const input = screen.getByRole('searchbox', {
      name: 'Buscar cliente o negocio',
    })
    expect(input).toBeEnabled()
    fireEvent.change(input, { target: { value: 'Ana' } })
    fireEvent.click(screen.getByRole('button', { name: 'Activos' }))
    const href = within(screen.getByTestId('habitual-t1'))
      .getByRole('link', { name: 'Ver y ajustar →' })
      .getAttribute('href')!
    const back = new URL(href, 'https://bambu.invalid').searchParams.get(
      'volverHabituales',
    )!
    const query = new URL(back, 'https://bambu.invalid').searchParams
    expect(query.get('q')).toBe('Ana')
    expect(query.get('estado')).toBe('activos')
  })
  it('muestra negocio-only, productos y cantidades aunque falle la revisión del día', async () => {
    fetchMock.mockImplementation(async () =>
      json(
        { success: false, error: { message: 'Consulta no disponible' } },
        503,
      ),
    )
    render(<RecurrentesClient initialRecurrentes={[tienda, persona]} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Consulta no disponible',
    )
    const catalogo = within(screen.getByTestId('habituales-catalogo'))
    expect(catalogo.getByText('La Esquina')).toBeVisible()
    expect(catalogo.getByText('Negocio de Ana')).toBeVisible()
    expect(
      catalogo.getAllByText('Paca de agua', { exact: false }).length,
    ).toBeGreaterThan(0)
    expect(catalogo.getByTestId('habitual-t1')).toHaveTextContent('3')
    expect(catalogo.getByTestId('habitual-t1')).toHaveTextContent('2')
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(
      false,
    )
  })
  it('filtra inactivos sin perderlos y conserva la consulta en Ver y ajustar', async () => {
    fetchMock.mockImplementation(async () =>
      json({ success: true, hoy: '2026-10-30', preview: [] }),
    )
    render(<RecurrentesClient initialRecurrentes={[tienda, persona]} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Pausados / inactivos' }),
    )
    expect(screen.queryByTestId('habitual-t1')).not.toBeInTheDocument()
    expect(screen.getByTestId('habitual-t2')).toHaveTextContent(
      'Sin generación',
    )
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Buscar cliente o negocio' }),
      { target: { value: 'Pedro' } },
    )
    const link = within(screen.getByTestId('habitual-t2')).getByRole('link', {
      name: 'Ver y ajustar →',
    })
    const back = new URL(
      link.getAttribute('href')!,
      'https://bambu.invalid',
    ).searchParams.get('volverHabituales')!
    expect(back).toContain('q=Pedro')
    expect(back).toContain('estado=inactivos')
    expect(
      await screen.findByText('No hay pedidos habituales listos para hoy'),
    ).toBeVisible()
  })
  it('un error al actualizar conserva la lista conocida; un 403 retira sus datos', async () => {
    let status = 503
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith('/api/recurrentes?')
        ? json({ success: false, error: { message: 'No disponible' } }, status)
        : json({ success: true, hoy: '2026-10-30', preview: [] }),
    )
    render(<RecurrentesClient initialRecurrentes={[tienda]} />)
    fireEvent.click(screen.getByRole('button', { name: /Actualizar lista/ }))
    await waitFor(() =>
      expect(screen.getByTestId('habituales-catalogo')).toHaveTextContent(
        'Se conserva la última lista',
      ),
    )
    expect(screen.getByText('La Esquina')).toBeVisible()
    status = 403
    fireEvent.click(screen.getByRole('button', { name: /Actualizar lista/ }))
    await waitFor(() =>
      expect(screen.queryByText('La Esquina')).not.toBeInTheDocument(),
    )
  })
})

describe('Revisión manual aprobada', () => {
  it('conserva las cinco opciones, muestra cantidades y exige revisión y confirmación antes del POST', async () => {
    let enviado: EnvioHabituales
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        enviado = JSON.parse(options.body as string)
        return json({ success: true }, 201)
      }
      if (url.includes('offlineId='))
        return json({
          success: true,
          ...enviado,
          estado: 'COMPLETO',
          pendientes: 0,
          items: [
            {
              recurrenteId: 't1',
              decision: 'SALTAR',
              estado: 'SALTADO',
              motivo: 'DECISION_SALTAR',
            },
          ],
        })
      return json({ success: true, hoy: '2026-10-30', preview: [item] })
    })
    render(<GeneracionHabituales actor="u" puedeGenerar onGenerado={vi.fn()} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Revisar antes de crear' }),
    )
    const dialog = screen.getByTestId('habituales-dialog')
    expect(dialog).toHaveTextContent('Paca de agua')
    expect(dialog).toHaveTextContent('Paca de hielo')
    expect(within(dialog).getAllByRole('option')).toHaveLength(5)
    fireEvent.change(
      within(dialog).getByRole('combobox', {
        name: 'Qué hacer con La Esquina',
      }),
      { target: { value: 'SALTAR' } },
    )
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(
      false,
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Revisar selección' }),
    )
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(
      false,
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Confirmar selección' }),
    )
    expect(await screen.findByText('Saltado según tu selección')).toBeVisible()
    expect(enviado!.decisiones).toEqual([
      {
        recurrenteId: 't1',
        decision: 'SALTAR',
        proximaFecha: item.proximaFecha,
        version: item.version,
      },
    ])
    expect(enviado!.offlineId).toBeTruthy()
    expect(
      fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST'),
    ).toHaveLength(1)
  })
  it('un perfil de consulta no puede confirmar', async () => {
    fetchMock.mockImplementation(async () =>
      json({ success: true, hoy: '2026-10-30', preview: [item] }),
    )
    render(
      <GeneracionHabituales
        actor="u"
        puedeGenerar={false}
        onGenerado={vi.fn()}
      />,
    )
    expect(
      await screen.findByRole('button', { name: 'Revisar antes de crear' }),
    ).toBeDisabled()
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(
      false,
    )
  })
})
