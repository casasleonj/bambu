'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { matchCliente } from '@/lib/cliente-search'
import type { Cliente } from './types'

interface ClienteSectionProps {
  clienteSeleccionado: Cliente | null
  setClienteSeleccionado: (c: Cliente | null) => void
  searchTerm: string
  setSearchTerm: (s: string) => void
  mostrarNuevo: boolean
  setMostrarNuevo: (v: boolean) => void
  nuevoCliente: { nombre: string; telefono: string; direccion: string; barrio: string }
  setNuevoCliente: React.Dispatch<React.SetStateAction<{ nombre: string; telefono: string; direccion: string; barrio: string }>>
  clientes: Cliente[]
  onClienteSelected: (cliente: Cliente) => void
}

export function ClienteSection({
  clienteSeleccionado,
  setClienteSeleccionado,
  searchTerm,
  setSearchTerm,
  mostrarNuevo,
  setMostrarNuevo,
  nuevoCliente,
  setNuevoCliente,
  clientes,
  onClienteSelected,
}: ClienteSectionProps) {
  const filteredClientes = searchTerm
    ? clientes.filter((c) => matchCliente(c, searchTerm))
    : clientes.slice(0, 5)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Cliente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!clienteSeleccionado && !mostrarNuevo ? (
          <>
            <div>
              <Label>Buscar Cliente</Label>
              <Input
                placeholder="Buscar por nombre o telefono..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {searchTerm && (
              <div className="border rounded-md max-h-40 overflow-y-auto">
                {filteredClientes.length > 0 ? (
                  filteredClientes.map((cliente) => (
                    <button
                      key={cliente.id}
                      type="button"
                      onClick={() => {
                        setClienteSeleccionado(cliente)
                        setSearchTerm('')
                        onClienteSelected(cliente)
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-accent flex justify-between items-center border-b last:border-b-0"
                    >
                      <span>{cliente.nombre}{cliente.apellido ? ` ${cliente.apellido}` : ''}</span>
                      <span className="text-sm text-muted-foreground">
                        {cliente.telefono}
                      </span>
                    </button>
                  ))
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMostrarNuevo(true)
                      setNuevoCliente(prev => ({ ...prev, nombre: searchTerm }))
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-accent text-primary font-medium"
                  >
                    + Crear nuevo cliente: &quot;{searchTerm}&quot;
                  </button>
                )}
              </div>
            )}
          </>
        ) : mostrarNuevo ? (
          <div className="space-y-2 border rounded-lg p-3 bg-muted">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Nuevo cliente</span>
              <button type="button" onClick={() => { setMostrarNuevo(false); setSearchTerm('') }} className="text-xs text-muted-foreground hover:text-foreground">
                Cancelar
              </button>
            </div>
            <Input placeholder="Nombre *" value={nuevoCliente.nombre} onChange={e => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })} />
            <Input placeholder="Celular *" value={nuevoCliente.telefono} onChange={e => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })} />
            <Input placeholder="Dirección" value={nuevoCliente.direccion} onChange={e => setNuevoCliente({ ...nuevoCliente, direccion: e.target.value })} />
            <Input placeholder="Barrio" value={nuevoCliente.barrio} onChange={e => setNuevoCliente({ ...nuevoCliente, barrio: e.target.value })} />
          </div>
        ) : (
          <div className="flex items-center justify-between p-3 bg-muted rounded-md">
            <div>
              <p className="font-medium">{clienteSeleccionado?.nombre}{clienteSeleccionado?.apellido ? ` ${clienteSeleccionado.apellido}` : ''}</p>
              <p className="text-sm text-muted-foreground">
                {clienteSeleccionado?.telefono}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setClienteSeleccionado(null)}
            >
              X
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
