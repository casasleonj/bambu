import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
export interface UploadStepProps {
  uploading: boolean
  onUpload: (file: File, nombre: string) => void
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_EXTENSIONS = ['xlsx', 'xls', 'csv']

export function UploadStep({ uploading, onUpload }: UploadStepProps) {
  const [file, setFile] = useState<File | null>(null)
  const [nombre, setNombre] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((selected: File | null) => {
    setError(null)
    if (!selected) return
    const ext = selected.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext ?? '')) {
      setError('Formato no soportado. Usá .xlsx, .xls o .csv')
      return
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError(`El archivo supera los 10 MB (${(selected.size / 1024 / 1024).toFixed(1)} MB)`)
      return
    }
    setFile(selected)
    if (!nombre) setNombre(selected.name.replace(/\.[^/.]+$/, ''))
  }, [nombre])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files?.[0] ?? null)
  }, [handleFile])

  const canSubmit = file !== null && !uploading && !error

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subir archivo</CardTitle>
        <p className="text-sm text-muted-foreground">
          Seleccioná un archivo Excel (.xlsx, .xls) o CSV con los datos históricos (máx. 10 MB).
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}
            ${file ? 'bg-muted/50' : ''}
          `}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div className="space-y-1">
              <p className="font-medium">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-medium">Arrastrá un archivo o hacé clic para seleccionar</p>
              <p className="text-sm text-muted-foreground">.xlsx, .xls, .csv</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="batch-name">Nombre del lote (opcional)</Label>
          <Input
            id="batch-name"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Importación marzo 2024"
          />
        </div>

        <Button
          onClick={() => file && onUpload(file, nombre || file.name)}
          disabled={!canSubmit}
          className="w-full"
        >
          {uploading ? 'Subiendo...' : 'Analizar archivo'}
        </Button>

        <a
          href="/api/admin/import/template"
          className="block text-center text-sm text-primary hover:underline"
          download
        >
          Descargar plantilla Excel
        </a>
      </CardContent>
    </Card>
  )
}
