import { fetchResilient } from '@/lib/fetch-resilient'
import type { ImportBatch, ImportBatchEstado, ImportStagingRow } from '@prisma/client'

export interface UploadImportResponse {
  batchId: string
  totalRows: number
  parseErrors: Array<{ sheet: string; row: number; message: string }>
  sheets: Array<{ name: string; rows: number; errors: number }>
}

export interface AnalyzeImportResponse {
  batchId: string
  autoMergeCount: number
  needsReviewCount: number
  noMatchCount: number
  totalRows: number
}

export interface CommitImportResponse {
  batchId: string
  created: number
  merged: number
  skipped: number
  failed: number
}

export interface BatchListResponse {
  items: ImportBatch[]
  total: number
  page: number
  pageSize: number
}

export interface BatchDetailResponse {
  batch: ImportBatch & {
    createdBy: { id: string; nombre: string | null; apellido: string | null; username: string }
    rows: Array<ImportStagingRow & { contactos: Array<{ id: string; nombre: string; telefono: string; relacion: string | null }> }>
  }
}

export async function uploadImportFile(file: File, nombre?: string): Promise<UploadImportResponse> {
  const formData = new FormData()
  formData.append('file', file)
  if (nombre) formData.append('nombre', nombre)

  const res = await fetch('/api/admin/import/upload', {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })

  const data = (await res.json()) as { success: boolean; error?: { message: string } } & Partial<UploadImportResponse>
  if (!res.ok || !data.success) {
    throw new Error(data.error?.message || 'Error subiendo el archivo')
  }
  return {
    batchId: data.batchId!,
    totalRows: data.totalRows!,
    parseErrors: data.parseErrors!,
    sheets: data.sheets!,
  }
}

export async function analyzeImportBatch(batchId: string): Promise<AnalyzeImportResponse> {
  const result = await fetchResilient<AnalyzeImportResponse>(
    `/api/admin/import/${batchId}/analyze`,
    { method: 'POST', localEndpoint: 'import-analyze' }
  )
  if (result.status !== 'ok') {
    throw new Error(result.status === 'error' ? result.error : 'Sin conexión')
  }
  return result.data
}

export async function recordImportDecision(
  batchId: string,
  stagingRowId: string,
  decision: 'MANUAL_MERGE' | 'CREATE_NEW' | 'SKIP',
  targetId?: string
): Promise<void> {
  const result = await fetchResilient<{ ok: boolean; error?: { message: string } }>(
    `/api/admin/import/${batchId}/decide`,
    {
      method: 'POST',
      body: { stagingRowId, decision, targetId },
      localEndpoint: 'import-decide',
    }
  )
  if (result.status !== 'ok') {
    throw new Error(result.status === 'error' ? result.error : 'Sin conexión')
  }
}

export async function commitImportBatch(batchId: string): Promise<CommitImportResponse> {
  const result = await fetchResilient<CommitImportResponse>(
    `/api/admin/import/${batchId}/commit`,
    { method: 'POST', localEndpoint: 'import-commit' }
  )
  if (result.status !== 'ok') {
    throw new Error(result.status === 'error' ? result.error : 'Sin conexión')
  }
  return result.data
}

export async function getImportBatch(batchId: string): Promise<BatchDetailResponse> {
  const res = await fetch(`/api/admin/import/${batchId}`, { credentials: 'include' })
  const data = (await res.json()) as { success: boolean; batch?: BatchDetailResponse['batch']; error?: { message: string } }
  if (!res.ok || !data.success) {
    throw new Error(data.error?.message || 'Error obteniendo el batch')
  }
  return { batch: data.batch! }
}

export async function listImportBatches(
  options: { estado?: ImportBatchEstado; page?: number; pageSize?: number } = {}
): Promise<BatchListResponse> {
  const params = new URLSearchParams()
  if (options.estado) params.set('estado', options.estado)
  if (options.page) params.set('page', String(options.page))
  if (options.pageSize) params.set('pageSize', String(options.pageSize))

  const res = await fetch(`/api/admin/import?${params.toString()}`, { credentials: 'include' })
  const data = (await res.json()) as { success: boolean; error?: { message: string } } & Partial<BatchListResponse>
  if (!res.ok || !data.success) {
    throw new Error(data.error?.message || 'Error listando batches')
  }
  return {
    items: data.items!,
    total: data.total!,
    page: data.page!,
    pageSize: data.pageSize!,
  }
}
