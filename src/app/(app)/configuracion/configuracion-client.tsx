'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ConfigData {
  empresa_nombre: string
  empresa_nit: string
  empresa_direccion: string
  empresa_telefono: string
  empresa_email: string
  BASE_DIA: string
  DIAS_ALERTA_NO_VERIFICADO: string
  DIAS_VENCIMIENTO_PROMESA: string
  MAX_PEDIDOS_DIA_ALERTA: string
}

interface ConfiguracionClientProps {
  initialData: ConfigData
}

type FieldConfig = {
  key: keyof ConfigData
  label: string
  type: string
  placeholder: string
  required?: boolean
  prefix?: string
  suffix?: string
}

type SectionConfig = {
  title: string
  description: string
  icon: React.ReactNode
  fields: FieldConfig[]
}

type SavingState = 'idle' | 'saving' | 'saved' | 'error'

const SECTIONS: SectionConfig[] = [
  {
    title: 'Datos de la Empresa',
    description: 'Información que aparece en facturas y documentos',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    fields: [
      { key: 'empresa_nombre', label: 'Nombre de la Empresa', type: 'text', placeholder: 'Agua Bambu SAS', required: true },
      { key: 'empresa_nit', label: 'NIT', type: 'text', placeholder: '900.123.456-7', required: true },
      { key: 'empresa_direccion', label: 'Dirección', type: 'text', placeholder: 'Calle Principal #123, Bogotá' },
      { key: 'empresa_telefono', label: 'Teléfono', type: 'tel', placeholder: '311 123 4567' },
      { key: 'empresa_email', label: 'Email', type: 'email', placeholder: 'info@aguabambu.com' },
    ],
  },
  {
    title: 'Operación',
    description: 'Parámetros de funcionamiento diario',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    fields: [
      { key: 'BASE_DIA', label: 'Base de Caja Diaria', type: 'number', placeholder: '100000', prefix: '$', required: true },
      { key: 'DIAS_ALERTA_NO_VERIFICADO', label: 'Días para alerta de cliente no verificado', type: 'number', placeholder: '30', suffix: 'días' },
      { key: 'DIAS_VENCIMIENTO_PROMESA', label: 'Días vencimiento promesa de pago', type: 'number', placeholder: '2', suffix: 'días' },
      { key: 'MAX_PEDIDOS_DIA_ALERTA', label: 'Máx. pedidos por día para alerta', type: 'number', placeholder: '2', suffix: 'pedidos' },
    ],
  },
]

export default function ConfiguracionClient({ initialData }: ConfiguracionClientProps) {
  const [data, setData] = useState<ConfigData>(initialData)
  const [savedData, setSavedData] = useState<ConfigData>(initialData)
  const [sectionSaving, setSectionSaving] = useState<Record<string, SavingState>>({})
  const [globalSaving, setGlobalSaving] = useState(false)

  const hasChanges = useCallback(() => {
    return JSON.stringify(data) !== JSON.stringify(savedData)
  }, [data, savedData])

  const sectionHasChanges = useCallback((sectionIndex: number) => {
    const section = SECTIONS[sectionIndex]
    return section.fields.some(field => data[field.key] !== savedData[field.key])
  }, [data, savedData])

  const handleChange = (key: keyof ConfigData, value: string) => {
    setData(prev => ({ ...prev, [key]: value }))
    setSectionSaving(prev => {
      const next = { ...prev }
      SECTIONS.forEach((section) => {
        if (section.fields.some(f => f.key === key)) {
          next[section.title] = 'idle'
        }
      })
      return next
    })
  }

  const saveSection = async (sectionIndex: number) => {
    const section = SECTIONS[sectionIndex]
    setSectionSaving(prev => ({ ...prev, [section.title]: 'saving' }))

    try {
      const promises = section.fields.map(field =>
        fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clave: field.key, valor: data[field.key] }),
        })
      )
      const results = await Promise.all(promises)
      const failed = results.filter(r => !r.ok)

      if (failed.length === 0) {
        setSavedData(prev => {
          const next = { ...prev }
          section.fields.forEach(field => {
            next[field.key] = data[field.key]
          })
          return next
        })
        setSectionSaving(prev => ({ ...prev, [section.title]: 'saved' }))
        toast.success(`${section.title} guardada`)
        setTimeout(() => {
          setSectionSaving(prev => ({ ...prev, [section.title]: 'idle' }))
        }, 2000)
      } else {
        const errors = await Promise.all(failed.map(async (r) => {
          const idx = results.indexOf(r)
          const body = await r.json().catch(() => ({}))
          return `${section.fields[idx]?.label}: ${body.error?.message || r.statusText}`
        }))
        console.error('Config save errors:', errors)
        setSectionSaving(prev => ({ ...prev, [section.title]: 'error' }))
        toast.error(errors[0])
      }
    } catch (e) {
      console.error('Config save exception:', e)
      setSectionSaving(prev => ({ ...prev, [section.title]: 'error' }))
      toast.error('Error guardando configuración')
    }
  }

  const saveAll = async () => {
    setGlobalSaving(true)
    try {
      const promises = SECTIONS.flatMap(section =>
        section.fields.map(field =>
          fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clave: field.key, valor: data[field.key] }),
          })
        )
      )
      const results = await Promise.all(promises)
      const allOk = results.every(r => r.ok)

      if (allOk) {
        setSavedData({ ...data })
        toast.success('Configuración guardada')
      } else {
        toast.error('Error guardando algunos campos')
      }
    } catch {
      toast.error('Error guardando configuración')
    }
    setGlobalSaving(false)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (hasChanges()) {
          saveAll()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasChanges, data])

  return (
    <div className="p-4 space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
          <p className="text-sm text-muted-foreground mt-1">Datos de empresa y parámetros del sistema</p>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges() && (
            <span className="text-xs text-amber-600 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Cambios sin guardar
            </span>
          )}
          <Button onClick={saveAll} disabled={globalSaving || !hasChanges()} size="sm">
            {globalSaving ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Guardando...
              </>
            ) : (
              'Guardar todo'
            )}
          </Button>
        </div>
      </div>

      {SECTIONS.map((section, sectionIdx) => {
        const savingState = sectionSaving[section.title] || 'idle'
        const hasUnsavedChanges = sectionHasChanges(sectionIdx)

        return (
          <Card key={section.title} className={hasUnsavedChanges ? 'border-amber-300 bg-amber-50/30' : ''}>
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-muted rounded-lg text-muted-foreground mt-0.5">
                    {section.icon}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{section.title}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">{section.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {savingState === 'saved' && (
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Guardado
                    </span>
                  )}
                  {savingState === 'error' && (
                    <span className="text-xs text-red-600 font-medium">Error</span>
                  )}
                  <Button
                    onClick={() => saveSection(sectionIdx)}
                    disabled={savingState === 'saving' || !hasUnsavedChanges}
                    variant={hasUnsavedChanges ? 'default' : 'ghost'}
                    size="sm"
                    className="min-w-[80px]"
                  >
                    {savingState === 'saving' ? (
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : savingState === 'saved' ? (
                      'Guardado'
                    ) : (
                      'Guardar'
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {section.fields.map((field) => {
                  const isDirty = data[field.key] !== savedData[field.key]

                  return (
                    <div key={field.key}>
                      <div className="flex items-center justify-between mb-1.5">
                        <Label htmlFor={field.key} className="text-sm font-medium">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </Label>
                        {isDirty && (
                          <span className="text-xs text-amber-600 font-medium">Modificado</span>
                        )}
                      </div>
                      <div className="relative">
                        {field.prefix && (
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                            {field.prefix}
                          </span>
                        )}
                        <Input
                          id={field.key}
                          type={field.type}
                          value={data[field.key]}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className={`${field.prefix ? 'pl-8' : ''} ${field.suffix ? 'pr-16' : ''} ${isDirty ? 'border-amber-400 bg-amber-50/50' : ''}`}
                        />
                        {field.suffix && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                            {field.suffix}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
