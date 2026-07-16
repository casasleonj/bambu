export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type BugCategory = 'Funcional' | 'Seguridad' | 'Performance' | 'UX' | 'Permisos'

export interface BugFinding {
  severity: Severity
  category: BugCategory
  vista: string
  rol?: string
  pasos: string
  esperado: string
  real: string
  evidencia: string
  conocidoEnAgentsMd: 'si' | 'no'
}

const _findings: BugFinding[] = []

/**
 * Reporta un bug en el formato v2.0 del QA Paranoico.
 * Pure function: no depende de @playwright/test, testeable con Vitest.
 */
export function reportBug(finding: BugFinding): void {
  _findings.push(finding)
}

export function getAllFindings(): BugFinding[] {
  return [..._findings]
}

export function clearFindings(): void {
  _findings.length = 0
}

export function formatBug(finding: BugFinding): string {
  return `[${finding.severity}][${finding.category}] ${finding.vista}${finding.rol ? ` (${finding.rol})` : ''} -> ${finding.pasos} -> Esperado: ${finding.esperado} -> Real: ${finding.real} -> Evidencia: ${finding.evidencia} -> Bug conocido en AGENTS.md: ${finding.conocidoEnAgentsMd}`
}
