import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkspaceEntrega } from '../workspace-entrega'
import type { EntregaResuelta } from '@/modules/pedidos/application/dto'

const base = (over: Partial<EntregaResuelta> = {}): EntregaResuelta => ({
  estado: 'SUFICIENTE', via: 'TEXTO',
  direccion: 'Cra 1 # 2-3', barrio: 'Centro', referencia: null,
  coords: null, linkUbicacion: null, linkResoluble: null, cobertura: 'no_evaluada',
  faltaComplementario: [], faltaBloqueante: [],
  ...over,
})

const common = {
  canal: 'DOMICILIO' as const,
  direccionEntrega: '', barrioEntrega: '',
  onDireccionChange: vi.fn(), onBarrioChange: vi.fn(), previewPending: false,
}

describe('WorkspaceEntrega — zona adaptativa (F-ENTREGA-i)', () => {
  it('PUNTO → no renderiza (no hay domicilio)', () => {
    const { container } = render(<WorkspaceEntrega {...common} canal="PUNTO" entrega={base()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sin `entrega` aún → placeholder, no inputs', () => {
    render(<WorkspaceEntrega {...common} entrega={null} previewPending />)
    expect(screen.getByTestId('workspace-entrega-resolviendo')).toBeInTheDocument()
    expect(screen.queryByTestId('workspace-entrega-direccion')).not.toBeInTheDocument()
  })

  it('SUFICIENTE → resumen compacto, sin pedir datos, sin inputs visibles', () => {
    render(<WorkspaceEntrega {...common} entrega={base({ estado: 'SUFICIENTE', coords: { lat: 4.65, lng: -74.05, origen: 'MANUAL' } })} />)
    expect(screen.getByTestId('workspace-entrega-suficiente')).toHaveTextContent('Cra 1 # 2-3 · Centro')
    expect(screen.getByTestId('workspace-entrega-ver-ubicacion')).toHaveAttribute('href', 'https://www.google.com/maps?q=4.65,-74.05')
    // sin inputs (no falta nada)
    expect(screen.queryByTestId('workspace-entrega-direccion')).not.toBeInTheDocument()
  })

  it('COMPLEMENTARIA → "puede continuar" + qué falta (no error) + inputs colapsados', () => {
    render(<WorkspaceEntrega {...common} entrega={base({
      estado: 'SUFICIENTE_COMPLEMENTARIA_FALTANTE', via: 'GEO', direccion: null, barrio: 'Centro',
      coords: { lat: 4.65, lng: -74.05, origen: 'MANUAL' }, faltaComplementario: ['direccion'],
    })} />)
    const box = screen.getByTestId('workspace-entrega-complementaria')
    expect(box).toHaveTextContent(/Puedes continuar/i)
    expect(box).toHaveTextContent(/la dirección escrita/i)
    // los inputs existen pero dentro de un <details> colapsado (no visibles hasta abrir)
    const det = box.querySelector('details')
    expect(det).not.toHaveAttribute('open')
    fireEvent.click(screen.getByText('Agregar información'))
    expect(screen.getByTestId('workspace-entrega-direccion')).toBeInTheDocument()
  })

  it('INSUFICIENTE → aviso obligatorio, faltaBloqueante, inputs visibles, tono ámbar', () => {
    render(<WorkspaceEntrega {...common} entrega={base({
      estado: 'INSUFICIENTE', via: null, direccion: null, barrio: 'Kennedy',
      faltaBloqueante: ['direccion', 'ubicacion'],
    })} />)
    const box = screen.getByTestId('workspace-entrega-insuficiente')
    expect(box).toHaveTextContent(/Necesitamos información para localizar/i)
    expect(box).toHaveTextContent(/la dirección escrita o una ubicación/i)
    expect(screen.getByTestId('workspace-entrega-direccion')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-entrega').className).toContain('amber')
  })

  it('editar la dirección dispara onDireccionChange (el snapshot del pedido)', () => {
    const onDireccionChange = vi.fn()
    render(<WorkspaceEntrega {...common} onDireccionChange={onDireccionChange} entrega={base({ estado: 'INSUFICIENTE', faltaBloqueante: ['direccion', 'ubicacion'] })} />)
    fireEvent.change(screen.getByTestId('workspace-entrega-direccion'), { target: { value: 'Nueva dir 123' } })
    expect(onDireccionChange).toHaveBeenCalledWith('Nueva dir 123')
  })

  it('no recalcula suficiencia: sólo lee `entrega.estado` (guardrail de fuente)', () => {
    // El componente no importa resolverEntrega ni deriva el estado.
    // (verificación estática simple)
    const raw = readFileSync(join(process.cwd(), 'src/components/pedido-workspace/workspace-entrega.tsx'), 'utf-8')
    const src = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    expect(src).not.toMatch(/resolverEntrega\s*\(|pickCoords\s*\(|Number\.isFinite/)
    expect(src).toMatch(/entrega\.estado|const \{ estado/)
  })
})
