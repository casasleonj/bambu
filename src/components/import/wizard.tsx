import { UploadStep } from './upload-step'
import { AnalyzeStep } from './analyze-step'
import { ReviewStep } from './review-step'
import { CommitStep } from './commit-step'
import type { UseImportBatchState, UseImportBatchActions, WizardStep } from '@/hooks/use-import-batch'

export interface ImportWizardProps extends UseImportBatchState, UseImportBatchActions {}

const stepLabels: Record<WizardStep, { label: string; index: number }> = {
  upload: { label: 'Subir', index: 1 },
  analyze: { label: 'Analizar', index: 2 },
  review: { label: 'Revisar', index: 3 },
  commit: { label: 'Confirmar', index: 4 },
}

export function ImportWizard({
  batch,
  step,
  uploading,
  analyzing,
  committing,
  upload,
  analyze,
  decide,
  commit,
}: ImportWizardProps) {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        {(['upload', 'analyze', 'review', 'commit'] as WizardStep[]).map((s) => {
          const active = s === step
          const completed = stepLabels[s].index < stepLabels[step].index
          return (
            <div key={s} className="flex flex-1 flex-col items-center">
              <div
                className={`
                  flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold
                  ${active ? 'bg-primary text-primary-foreground' : ''}
                  ${completed ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}
                `}
              >
                {stepLabels[s].index}
              </div>
              <span className={`mt-1 text-xs ${active ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                {stepLabels[s].label}
              </span>
            </div>
          )
        })}
      </div>

      {step === 'upload' && (
        <UploadStep uploading={uploading} onUpload={upload} />
      )}

      {step === 'analyze' && batch && (
        <AnalyzeStep rows={batch.rows} analyzing={analyzing} onAnalyze={analyze} />
      )}

      {step === 'review' && batch && (
        <ReviewStep rows={batch.rows} onDecide={decide} onCommit={commit} />
      )}

      {step === 'commit' && batch && (
        <CommitStep
          batch={batch}
          rows={batch.rows}
          committing={committing}
          onRetry={() => { /* caller can refresh or reset */ }}
        />
      )}
    </div>
  )
}
