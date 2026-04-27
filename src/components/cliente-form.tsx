'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ClienteFormProps {
  onSubmit?: (data: any) => void
  initialData?: {
    nombre?: string
    telefono?: string
    direccion?: string
    barrio?: string
  }
}

export function ClienteForm({ onSubmit, initialData }: ClienteFormProps) {
  const [formData, setFormData] = useState(initialData || {
    nombre: '',
    telefono: '',
    direccion: '',
    barrio: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit?.(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Nombre</Label>
        <Input
          value={formData.nombre}
          onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
        />
      </div>
      <div>
        <Label>Teléfono</Label>
        <Input
          type="tel"
          value={formData.telefono}
          onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
        />
      </div>
      <div>
        <Label>Dirección</Label>
        <Input
          value={formData.direccion}
          onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
        />
      </div>
      <div>
        <Label>Barrio</Label>
        <Input
          value={formData.barrio}
          onChange={(e) => setFormData({ ...formData, barrio: e.target.value })}
        />
      </div>
      <Button type="submit">Guardar</Button>
    </form>
  )
}