'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Cliente } from './types'

interface ClienteSelectProps {
  requiereCliente: boolean
  quiereEnvio: boolean
  saldoPendiente: number
  searchTerm: string
  setSearchTerm: (v: string) => void
  filteredClientes: Cliente[]
  clienteSeleccionado: Cliente | null
  setClienteSeleccionado: (c: Cliente | null) => void
  mostrarNuevo: boolean
  setMostrarNuevo: (v: boolean) => void
  nuevoCliente: { nombre: string; apellido: string; telefono: string; direccion: string; barrio: string }
  setNuevoCliente: React.Dispatch<React.SetStateAction<{ nombre: string; apellido: string; telefono: string; direccion: string; barrio: string }>>
  onSelectCliente: (cliente: Cliente) => void
  onCreateNuevo: () => void
}

export function ClienteSelect({
  requiereCliente,
  quiereEnvio,
  saldoPendiente,
  searchTerm,
  setSearchTerm,
  filteredClientes,
  clienteSeleccionado,
  setClienteSeleccionado,
  mostrarNuevo,
  setMostrarNuevo,
  nuevoCliente,
  setNuevoCliente,
  onSelectCliente,
  onCreateNuevo,
}: ClienteSelectProps) {
  return (
    <>
      {/* Cliente search - if envío or saldo pendiente */}
      {requiereCliente && (
      <div className={`space-y-2 ${saldoPendiente > 0 && !quiereEnvio ? 'bg-yellow-50 border border-yellow-200 rounded-lg p-3' : ''}`}>
        <label className="text-sm font-medium flex items-center gap-1">
          {saldoPendiente > 0 && !quiereEnvio && <span className="text-yellow-600">⚠️</span>}
          {quiereEnvio ? 'Cliente para envío' : 'Cliente (obligatorio por saldo pendiente)'}
        </label>
        {!clienteSeleccionado && !mostrarNuevo && (
          <>
            <Input
              placeholder="Buscar por nombre o celular..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setMostrarNuevo(false)
              }}
            />
            {searchTerm && (
              <div className="border rounded-md max-h-40 overflow-y-auto bg-white shadow-sm">
                {filteredClientes.length > 0 ? (
                  filteredClientes.map((cliente) => (
                    <button
                      key={cliente.id}
                      type="button"
                      onClick={() => onSelectCliente(cliente)}
                      className="w-full text-left px-3 py-2.5 hover:bg-green-50 flex justify-between items-center border-b last:border-b-0"
                    >
                      <span className="font-medium text-sm">{cliente.nombre}{cliente.apellido ? ` ${cliente.apellido}` : ''}</span>
                      <span className="text-xs text-gray-400">{cliente.telefono}</span>
                    </button>
                  ))
                ) : (
                  <button
                    type="button"
                    onClick={onCreateNuevo}
                    className="w-full text-left px-3 py-2.5 hover:bg-green-50 text-green-700 text-sm font-medium"
                  >
                    + Crear nuevo cliente: &ldquo;{searchTerm}&rdquo;
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {clienteSeleccionado && (
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-100">
            <div>
              <p className="font-medium text-sm">{clienteSeleccionado.nombre}{clienteSeleccionado.apellido ? ` ${clienteSeleccionado.apellido}` : ''}</p>
              <p className="text-xs text-gray-500">{clienteSeleccionado.telefono}</p>
              {quiereEnvio && clienteSeleccionado.direccion && (
                <p className="text-xs text-gray-400">{clienteSeleccionado.direccion}</p>
              )}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setClienteSeleccionado(null); setSearchTerm('') }}>
              Cambiar
            </Button>
          </div>
        )}

        {mostrarNuevo && (
          <div className="space-y-2 border rounded-lg p-3 bg-gray-50">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Nuevo cliente</span>
              <button type="button" onClick={() => { setMostrarNuevo(false); setSearchTerm('') }} className="text-xs text-gray-400 hover:text-gray-600">
                Cancelar
              </button>
            </div>
            <Input placeholder="Nombre *" value={nuevoCliente.nombre} onChange={e => setNuevoCliente(p => ({ ...p, nombre: e.target.value }))} />
            <Input placeholder="Apellido" value={nuevoCliente.apellido} onChange={e => setNuevoCliente(p => ({ ...p, apellido: e.target.value }))} />
            <Input placeholder="Celular *" value={nuevoCliente.telefono} onChange={e => setNuevoCliente(p => ({ ...p, telefono: e.target.value }))} />
            <Input placeholder="Dirección *" value={nuevoCliente.direccion} onChange={e => setNuevoCliente(p => ({ ...p, direccion: e.target.value }))} />
            <Input placeholder="Barrio" value={nuevoCliente.barrio} onChange={e => setNuevoCliente(p => ({ ...p, barrio: e.target.value }))} />
          </div>
        )}
      </div>
      )}

      {/* Banners: falta cliente para fiado o envío */}
      {saldoPendiente > 0 && !clienteSeleccionado && !mostrarNuevo && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <span className="text-yellow-600 text-lg">⚠️</span>
            <div>
              <p className="text-sm font-medium text-yellow-800">
                Saldo pendiente: ${saldoPendiente.toLocaleString()}
              </p>
              <p className="text-xs text-yellow-700">
                Selecciona un cliente para registrar el fiado
              </p>
            </div>
          </div>
        </div>
      )}
      {quiereEnvio && !clienteSeleccionado && !mostrarNuevo && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <span className="text-yellow-600 text-lg">⚠️</span>
            <div>
              <p className="text-sm font-medium text-yellow-800">
                Envío a domicilio requiere cliente
              </p>
              <p className="text-xs text-yellow-700">
                Busca o crea un cliente para registrar el envío
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
