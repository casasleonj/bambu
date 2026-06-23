import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { ImportBatch } from '@prisma/client'
import {
  uploadImportFile,
  analyzeImportBatch,
  recordImportDecision,
  commitImportBatch,
  getImportBatch,
  type BatchDetailResponse,
  type UploadImportResponse,
  type AnalyzeImportResponse,
  type CommitImportResponse,
} from '@/lib/import/client-api'

export type WizardStep = 'upload' | 'analyze' | 'review' | 'commit'

export interface UseImportBatchState {
  batch: BatchDetailResponse['batch'] | null
  step: WizardStep
  loading: boolean
  uploading: boolean
  analyzing: boolean
  committing: boolean
  error: string | null
}

export interface UseImportBatchActions {
  upload: (file: File, nombre?: string) => Promise<UploadImportResponse | null>
  analyze: () => Promise<AnalyzeImportResponse | null>
  decide: (stagingRowId: string, decision: 'MANUAL_MERGE' | 'CREATE_NEW' | 'SKIP', targetId?: string) => Promise<void>
  commit: () => Promise<CommitImportResponse | null>
  refresh: () => Promise<void>
  cancel: () => void
}

export function useImportBatch(initialBatchId?: string): UseImportBatchState & UseImportBatchActions {
  const [batch, setBatch] = useState<BatchDetailResponse['batch'] | null>(null)
  const [step, setStep] = useState<WizardStep>('upload')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const deriveStep = useCallback((b: ImportBatch): WizardStep => {
    switch (b.estado) {
      case 'DRAFT':
        return 'upload'
      case 'ANALYZED':
        return 'review'
      case 'COMMITTING':
      case 'COMPLETED':
      case 'FAILED':
        return 'commit'
      default:
        return 'upload'
    }
  }, [])

  const refresh = useCallback(async () => {
    const batchId = batch?.id ?? initialBatchId
    if (!batchId) return
    setLoading(true)
    try {
      const detail = await getImportBatch(batchId)
      setBatch(detail.batch)
      setStep(deriveStep(detail.batch))
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error cargando el batch'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [batch?.id, initialBatchId, deriveStep])

  useEffect(() => {
    if (initialBatchId) {
      void refresh()
    }
  }, [initialBatchId, refresh])

  const upload = useCallback(async (file: File, nombre?: string): Promise<UploadImportResponse | null> => {
    setUploading(true)
    setError(null)
    try {
      const result = await uploadImportFile(file, nombre)
      await getImportBatch(result.batchId).then((detail) => {
        setBatch(detail.batch)
        setStep('analyze')
      })
      toast.success('Archivo subido correctamente')
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error subiendo el archivo'
      setError(message)
      toast.error(message)
      return null
    } finally {
      setUploading(false)
    }
  }, [])

  const analyze = useCallback(async (): Promise<AnalyzeImportResponse | null> => {
    if (!batch) return null
    setAnalyzing(true)
    setError(null)
    try {
      const result = await analyzeImportBatch(batch.id)
      await refresh()
      toast.success('Análisis completado')
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error analizando el batch'
      setError(message)
      toast.error(message)
      return null
    } finally {
      setAnalyzing(false)
    }
  }, [batch, refresh])

  const decide = useCallback(
    async (stagingRowId: string, decision: 'MANUAL_MERGE' | 'CREATE_NEW' | 'SKIP', targetId?: string): Promise<void> => {
      if (!batch) return
      try {
        await recordImportDecision(batch.id, stagingRowId, decision, targetId)
        await refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error guardando la decisión'
        toast.error(message)
        throw err
      }
    },
    [batch, refresh]
  )

  const commit = useCallback(async (): Promise<CommitImportResponse | null> => {
    if (!batch) return null
    setCommitting(true)
    setError(null)
    try {
      const result = await commitImportBatch(batch.id)
      await refresh()
      if (result.failed === 0) {
        toast.success('Importación completada')
      } else {
        toast.error(`Importación completada con ${result.failed} filas fallidas`)
      }
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error confirmando la importación'
      setError(message)
      toast.error(message)
      return null
    } finally {
      setCommitting(false)
    }
  }, [batch, refresh])

  const cancel = useCallback(() => {
    setBatch(null)
    setStep('upload')
    setError(null)
  }, [])

  return {
    batch,
    step,
    loading,
    uploading,
    analyzing,
    committing,
    error,
    upload,
    analyze,
    decide,
    commit,
    refresh,
    cancel,
  }
}
