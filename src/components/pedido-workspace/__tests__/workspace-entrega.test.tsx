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
  entregaLat: null as number | null, entregaLng: null as number | null, onUbicacionChange: vi.fn(),
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

  it('COMPLEMENTARIA → "puede continuar" + qué falta (no error) + inputs tras «Agregar información»', () => {
    render(<WorkspaceEntrega {...common} entrega={base({
      estado: 'SUFICIENTE_COMPLEMENTARIA_FALTANTE', via: 'GEO', direccion: null, barrio: 'Centro',
      coords: { lat: 4.65, lng: -74.05, origen: 'MANUAL' }, faltaComplementario: ['direccion'],
    })} />)
    const box = screen.getByTestId('workspace-entrega-complementaria')
    expect(box).toHaveTextContent(/Puedes continuar/i)
    expect(box).toHaveTextContent(/la dirección escrita/i)
    // los inputs no se ven hasta pedirlos
    expect(screen.queryByTestId('workspace-entrega-direccion')).not.toBeInTheDocument()
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

  it('pegar un link de Maps con coordenadas fija la ubicación propia del pedido', () => {
    const onUbicacionChange = vi.fn()
    render(<WorkspaceEntrega {...common} onUbicacionChange={onUbicacionChange} entrega={base({ estado: 'INSUFICIENTE', faltaBloqueante: ['direccion', 'ubicacion'] })} />)
    fireEvent.change(screen.getByTestId('workspace-entrega-link'), { target: { value: 'https://www.google.com/maps?q=4.6520,-74.0540' } })
    expect(onUbicacionChange).toHaveBeenCalledWith(4.652, -74.054)
  })

  it('un link inválido NO fija nada y avisa', () => {
    const onUbicacionChange = vi.fn()
    render(<WorkspaceEntrega {...common} onUbicacionChange={onUbicacionChange} entrega={base({ estado: 'INSUFICIENTE', faltaBloqueante: ['direccion', 'ubicacion'] })} />)
    fireEvent.change(screen.getByTestId('workspace-entrega-link'), { target: { value: 'hola' } })
    expect(onUbicacionChange).not.toHaveBeenCalled()
    expect(screen.getByTestId('workspace-entrega-ubicacion-error')).toBeInTheDocument()
  })

  it('con ubicación fijada se muestra y se puede quitar', () => {
    const onUbicacionChange = vi.fn()
    render(<WorkspaceEntrega {...common} entregaLat={4.65} entregaLng={-74.05} onUbicacionChange={onUbicacionChange} entrega={base({ estado: 'INSUFICIENTE', faltaBloqueante: ['direccion', 'ubicacion'] })} />)
    expect(screen.getByTestId('workspace-entrega-ubicacion-fijada')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('workspace-entrega-ubicacion-quitar'))
    expect(onUbicacionChange).toHaveBeenCalledWith(null, null)
  })

  it('no recalcula suficiencia: sólo lee `entrega.estado` (guardrail de fuente)', () => {
    // El componente no importa resolverEntrega ni deriva el estado.
    // (verificación estática simple)
    const raw = readFileSync(join(process.cwd(), 'src/components/pedido-workspace/workspace-entrega.tsx'), 'utf-8')
    const src = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    expect(src).not.toMatch(/resolverEntrega\s*\(|pickCoords\s*\(|Number\.isFinite/)
    expect(src).toMatch(/entrega\.estado|const \{ estado/)
  })

  describe('P1-4 (#419): cambiar el destino de ESTE pedido', () => {
    const suficiente = () => base({ estado: 'SUFICIENTE', coords: null })
    const guardada = { texto: 'Calle 5 # 3-2 · Centro', origen: 'cliente' as const }

    it('SUFICIENTE ofrece «Cambiar el destino de este pedido» y al abrirlo muestra los campos y que lo guardado no cambia', () => {
      render(<WorkspaceEntrega {...common} direccionEntrega="Calle 5 # 3-2" barrioEntrega="Centro" entrega={suficiente()} guardada={guardada} />)
      expect(screen.queryByTestId('workspace-entrega-direccion')).not.toBeInTheDocument()
      fireEvent.click(screen.getByTestId('workspace-entrega-cambiar'))
      expect(screen.getByTestId('workspace-entrega-direccion')).toBeInTheDocument()
      expect(screen.getByTestId('workspace-entrega-ubicacion')).toBeInTheDocument()
      expect(screen.getByTestId('workspace-entrega-guardada')).toHaveTextContent(/solo de este pedido/i)
      expect(screen.getByTestId('workspace-entrega-guardada')).toHaveTextContent('Calle 5 # 3-2 · Centro')
    })

    it('con un destino propio marca «Solo este pedido», muestra lo guardado y permite volver', () => {
      const onVolver = vi.fn()
      render(<WorkspaceEntrega {...common} direccionEntrega="Cra 9 # 10-20" barrioEntrega="La Paz" entrega={suficiente()} guardada={guardada} destinoPropio onVolverAGuardada={onVolver} />)
      expect(screen.getByTestId('workspace-entrega-solo-pedido')).toHaveTextContent(/Solo este pedido/)
      expect(screen.getByTestId('workspace-entrega-solo-pedido')).toHaveTextContent('Calle 5 # 3-2 · Centro')
      fireEvent.click(screen.getByTestId('workspace-entrega-cambiar'))
      fireEvent.click(screen.getByTestId('workspace-entrega-volver-guardada'))
      expect(onVolver).toHaveBeenCalledTimes(1)
    })

    it('sin cambio de destino no hay «Solo este pedido» ni «Volver»', () => {
      render(<WorkspaceEntrega {...common} direccionEntrega="Calle 5 # 3-2" barrioEntrega="Centro" entrega={suficiente()} guardada={guardada} />)
      expect(screen.queryByTestId('workspace-entrega-solo-pedido')).not.toBeInTheDocument()
      fireEvent.click(screen.getByTestId('workspace-entrega-cambiar'))
      expect(screen.queryByTestId('workspace-entrega-volver-guardada')).not.toBeInTheDocument()
    })

    it('la casilla «Guardar también como dirección del cliente» solo aparece si se ofrece y está apagada por defecto', () => {
      const onGuardar = vi.fn()
      const { rerender } = render(<WorkspaceEntrega {...common} entrega={suficiente()} guardada={guardada} />)
      fireEvent.click(screen.getByTestId('workspace-entrega-cambiar'))
      expect(screen.queryByTestId('workspace-entrega-guardar-en-cliente')).not.toBeInTheDocument()
      rerender(<WorkspaceEntrega {...common} entrega={suficiente()} guardada={guardada} puedeGuardarEnCliente onGuardarEnClienteChange={onGuardar} />)
      const casilla = screen.getByTestId('workspace-entrega-guardar-en-cliente') as HTMLInputElement
      expect(casilla.checked).toBe(false)
      fireEvent.click(casilla)
      expect(onGuardar).toHaveBeenCalledWith(true)
    })

    it('con la dirección de una tienda se dice que la de la tienda no cambia', () => {
      render(<WorkspaceEntrega {...common} entrega={suficiente()} guardada={{ texto: 'Av 1 # 2', origen: 'negocio' }} />)
      fireEvent.click(screen.getByTestId('workspace-entrega-cambiar'))
      expect(screen.getByTestId('workspace-entrega-guardada')).toHaveTextContent(/dirección de la tienda no cambia/i)
    })

    it('con una ubicación fijada, dirección y barrio se piden como opcionales', () => {
      render(<WorkspaceEntrega {...common} entregaLat={4.65} entregaLng={-74.05} entrega={base({ estado: 'INSUFICIENTE', faltaBloqueante: ['direccion', 'ubicacion'] })} />)
      expect(screen.getByTestId('workspace-entrega-direccion')).toHaveAttribute('placeholder', 'Dirección (opcional con ubicación)')
      expect(screen.getByTestId('workspace-entrega-barrio')).toHaveAttribute('placeholder', 'Barrio (opcional)')
    })

    it('sin ubicación, la dirección se pide normal', () => {
      render(<WorkspaceEntrega {...common} entrega={base({ estado: 'INSUFICIENTE', faltaBloqueante: ['direccion', 'ubicacion'] })} />)
      expect(screen.getByTestId('workspace-entrega-direccion')).toHaveAttribute('placeholder', 'Dirección de entrega')
    })
  })
})
