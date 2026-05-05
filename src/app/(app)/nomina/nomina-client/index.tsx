'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import type { Nomina, Trabajador } from './types'

export default function NominaPage() {
  const [nominas, setNominas] = useState<Nomina[]>([])
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [showCrear, setShowCrear] = useState(false)
  const [trabajadorId, setTrabajadorId] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [detalles, setDetalles] = useState<{
    entregasAgua: number
    entregasHielo: number
    comAgua: number
    comHielo: number
    comisionTotal: number
    salarioFijo: number
  } | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [nRes, tRes] = await Promise.all([
        fetch('/api/nomina'),
        fetch('/api/trabajadores'),
      ])
      const nData = await nRes.json()
      const tData = await tRes.json()
      setNominas(nData.nominas || nData.data || [])
      setTrabajadores(tData.trabajadores || tData.data || [])
    } catch (e) {
      console.error(e)
      toast.error('Error cargando nóminas')
    }
  }

  const crearNomina = async () => {
    if (!trabajadorId || !fechaInicio || !fechaFin) {
      toast.error('Completa todos los campos')
      return
    }
    if (fechaFin < fechaInicio) {
      toast.error('La fecha fin debe ser posterior a la fecha inicio')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/nomina', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trabajadorId,
          fechaInicio,
          fechaFin,
          tipoCalculo: 'AUTO',
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setDetalles(data.detalles)
        setShowCrear(false)
        fetchData()
        toast.success('Nómina calculada')
      } else {
        toast.error(data.error || 'Error calculando nómina')
      }
    } catch (e) {
      console.error(e)
      toast.error('Error calculando nómina')
    }
    setSubmitting(false)
  }

  const estados = {
    PENDIENTE: '🟡 Pendiente',
    PAGADA: '🟢 Pagada',
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">💰 Nómina</h1>

      <Button onClick={() => setShowCrear(!showCrear)}>
        ➕ Nueva Nómina
      </Button>

      {showCrear && (
        <Card>
          <CardHeader>
            <CardTitle>Calcular Nómina</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Trabajador</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2"
                value={trabajadorId}
                onChange={(e) => setTrabajadorId(e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {trabajadores.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre} - {t.rol}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Fecha Inicio</Label>
              <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
            </div>
            <div>
              <Label>Fecha Fin</Label>
              <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
            </div>
            <Button onClick={crearNomina} disabled={submitting}>
              📊 Calcular Automático
            </Button>
          </CardContent>
        </Card>
      )}

      {detalles && (
        <Card className="bg-muted">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Entregas Agua:</div><div className="font-medium">{detalles.entregasAgua}</div>
              <div>Entregas Hielo:</div><div className="font-medium">{detalles.entregasHielo}</div>
              <div>Comisión Agua:</div><div className="font-medium">${detalles.comAgua?.toLocaleString()}</div>
              <div>Comisión Hielo:</div><div className="font-medium">${detalles.comHielo?.toLocaleString()}</div>
              <div>Total Comisiones:</div><div className="font-medium">${detalles.comisionTotal?.toLocaleString()}</div>
              <div>Salario:</div><div className="font-medium">${detalles.salarioFijo?.toLocaleString()}</div>
              <div className="col-span-2 border-t pt-2 text-lg font-bold">
                TOTAL: ${(detalles.comisionTotal + detalles.salarioFijo).toLocaleString()}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {nominas.length === 0 ? (
        <EmptyState
          icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
          title="No hay nóminas registradas"
          description="Registra las nóminas de tu equipo"
        />
      ) : (
        <div className="space-y-2">
          {nominas.map((nom) => (
            <Card key={nom.id}>
              <CardHeader className="py-3">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-lg">{nom.trabajador?.nombre}</CardTitle>
                  <span className="text-sm">{estados[nom.estado as keyof typeof estados] || nom.estado}</span>
                </div>
              </CardHeader>
              <CardContent className="py-2 text-sm">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Período:</span>
                    <span>{new Date(nom.fechaInicio).toLocaleDateString()} - {new Date(nom.fechaFin).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rol:</span>
                    <span>{nom.trabajador?.rol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Comisiones:</span>
                    <span>${nom.totalComisiones.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Salario:</span>
                    <span>${nom.salario.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 font-bold">
                    <span>Total:</span>
                    <span>${nom.total.toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
