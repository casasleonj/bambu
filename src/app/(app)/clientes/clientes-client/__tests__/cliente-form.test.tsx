import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ClienteForm } from '@/app/(app)/clientes/clientes-client/cliente-form'

const fetchMock = vi.fn()

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: 'ADMIN' } }, status: 'authenticated' }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const baseProps = {
  isEdit: false,
  formData: {
    nombre: '',
    apellido: '',
    telefono: '',
    fuente: '',
    barrio: '',
    direccion: '',
    linkUbicacion: '',
    contactos: [],
    preciosEspeciales: '',
    notas: '',
    limitePedidosFiados: undefined,
  },
  onFormDataChange: vi.fn(),
  formError: '',
  saving: false,
  onSubmit: vi.fn(),
  canalActivo: 'DOMICILIO' as const,
  onCanalActivoChange: vi.fn(),
  preciosEspecialesMap: { DOMICILIO: {}, PUNTO: {} },
  onPrecioEspecialChange: vi.fn(),
  preciosBase: { DOMICILIO: {}, PUNTO: {} },
}

describe('ClienteForm — placeholder límite fiados', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, productos: [] }) } as Response)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra el placeholder con el límite global cuando se proporciona', async () => {
    render(<ClienteForm {...baseProps} inline limiteGlobalFiados={5} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('5')).toBeInTheDocument()
    })
  })

  it('muestra el placeholder 2 cuando no hay límite global', async () => {
    render(<ClienteForm {...baseProps} inline />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('2')).toBeInTheDocument()
    })
  })
})

describe('ClienteForm — F4: chips de referencias territoriales insertan en Dirección', () => {
  const onFormDataChange = vi.fn()
  const fetchMock = vi.fn()

  beforeEach(() => {
    onFormDataChange.mockReset()
    fetchMock.mockReset()
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/barrios/b1') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            barrio: { id: 'b1', aliases: [], referencias: [{ id: 'r2', texto: 'Antillana 2' }] },
          }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true, productos: [] }) })
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pulsar una referencia en la pestaña Ubicación llama a onFormDataChange con la Dirección actualizada', async () => {
    render(
      <ClienteForm
        {...baseProps}
        inline
        formData={{ ...baseProps.formData, barrioId: 'b1', barrio: 'La Antillana', direccion: 'Cra 15 # 8-20' }}
        onFormDataChange={onFormDataChange}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Barrio y dirección' }))

    const chip = await screen.findByText('Antillana 2')
    fireEvent.click(chip)

    expect(onFormDataChange).toHaveBeenCalledWith(
      expect.objectContaining({ direccion: 'Antillana 2, Cra 15 # 8-20' }),
    )
  })
})
