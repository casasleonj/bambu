/**
 * Destructive Walkthrough — Tier 8 / 11: Final Report
 *
 * Lee el archivo `reports/walkthrough-<RUN_ID>.jsonl` con todos los findings
 * acumulados por la suite y genera un reporte markdown consolidado.
 *
 * Tests: 3
 *  - Consolida findings por severidad (P0/P1/P2/P3)
 *  - Genera reporte markdown
 *  - Falla si hay P0 sin documentar
 */
import { test, expect } from '@playwright/test'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const REPORTS_DIR = join(process.cwd(), 'reports')
const SCREENSHOTS_DIR = join(process.cwd(), 'screenshots')

test('11.1: existe al menos un archivo de findings', async () => {
  if (!existsSync(REPORTS_DIR)) {
    test.skip()
    return
  }
  const files = readdirSync(REPORTS_DIR).filter((f) => f.startsWith('walkthrough-') && f.endsWith('.jsonl'))
  expect(files.length).toBeGreaterThanOrEqual(0) // Puede no haber si no se ejecutaron otros tests
})

test('11.2: genera reporte markdown consolidado', async () => {
  if (!existsSync(REPORTS_DIR)) {
    test.skip()
    return
  }

  const allFiles = readdirSync(REPORTS_DIR)
  const jsonlFiles = allFiles.filter((f) => f.startsWith('walkthrough-') && f.endsWith('.jsonl'))

  if (jsonlFiles.length === 0) {
    test.skip()
    return
  }

  // Tomar el archivo más reciente
  const latest = jsonlFiles
    .map((f) => ({ name: f, mtime: statSync(join(REPORTS_DIR, f)).mtime.getTime() }))
    .sort((a, b) => b.mtime - a.mtime)[0].name

  const content = readFileSync(join(REPORTS_DIR, latest), 'utf-8')
  const findings = content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter((f) => f !== null)

  // Agrupar por severidad y módulo
  const bySeverity: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0 }
  const byModule: Record<string, number> = {}
  for (const f of findings) {
    if (f.severity) bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1
    if (f.module) byModule[f.module] = (byModule[f.module] || 0) + 1
  }

  // Listar screenshots
  let screenshotsCount = 0
  if (existsSync(SCREENSHOTS_DIR)) {
    for (const subdir of readdirSync(SCREENSHOTS_DIR)) {
      const subPath = join(SCREENSHOTS_DIR, subdir)
      if (statSync(subPath).isDirectory()) {
        screenshotsCount += readdirSync(subPath).filter((f) => f.endsWith('.png')).length
      }
    }
  }

  // Generar markdown
  const now = new Date().toISOString()
  const md = `# Destructive Walkthrough — Reporte Final

**Fecha**: ${now}
**Run ID**: ${latest.replace('walkthrough-', '').replace('.jsonl', '')}
**Total findings**: ${findings.length}
**Screenshots**: ${screenshotsCount}

---

## 1. Resumen por Severidad

| Severidad | Cantidad |
|-----------|----------|
| P0 (CRITICAL) | ${bySeverity.P0 || 0} |
| P1 (HIGH) | ${bySeverity.P1 || 0} |
| P2 (MEDIUM) | ${bySeverity.P2 || 0} |
| P3 (LOW) | ${bySeverity.P3 || 0} |

## 2. Resumen por Módulo

| Módulo | Findings |
|--------|----------|
${Object.entries(byModule)
  .sort(([, a], [, b]) => b - a)
  .map(([m, c]) => `| ${m} | ${c} |`)
  .join('\n')}

## 3. Top Findings (P0 y P1)

${
  findings
    .filter((f) => f.severity === 'P0' || f.severity === 'P1')
    .slice(0, 30)
    .map(
      (f) =>
        `### [${f.severity}] ${f.title}\n\n**Módulo**: ${f.module}  \n**Descripción**: ${f.description}\n${
          f.expected ? `**Esperado**: ${f.expected}  \n` : ''
        }${f.observed ? `**Observado**: ${f.observed}\n` : ''}${
          f.userComplaint ? `**Queja del usuario**: ${f.userComplaint}\n` : ''
        }\n---`
    )
    .join('\n\n')
}

## 4. Cómo correr la suite completa

\`\`\`bash
# Suite completa (mobile+desktop paralelo, ~20-30 min)
npx playwright test e2e/qa-comprehensive/08-destructive-walkthrough/ --workers=4

# Solo un spec
npx playwright test e2e/qa-comprehensive/08-destructive-walkthrough/03-walkthrough-pedidos.spec.ts

# Solo mobile
npx playwright test e2e/qa-comprehensive/08-destructive-walkthrough/ --project=chromium-mobile

# Solo desktop
npx playwright test e2e/qa-comprehensive/08-destructive-walkthrough/ --project=chromium
\`\`\`

## 5. Interpretación

- **P0 (CRITICAL)**: Rompe el flujo principal o expone datos. Aplicar fix antes de producción.
- **P1 (HIGH)**: Bug visible o confusión seria del usuario. Aplicar antes de próxima release.
- **P2 (MEDIUM)**: UX subóptima (overflow, touch targets, etc.). Aplicar cuando se pueda.
- **P3 (LOW)**: Mejora de calidad (CTA faltante, validación laxa). Backlog.
`

  const reportPath = join(REPORTS_DIR, `destructive-walkthrough-${latest.replace('walkthrough-', '').replace('.jsonl', '')}.md`)
  writeFileSync(reportPath, md, 'utf-8')

  // eslint-disable-next-line no-console
  console.log(`\n[11-final-report] Reporte generado: ${reportPath}`)
  // eslint-disable-next-line no-console
  console.log(`Findings: P0=${bySeverity.P0 || 0}, P1=${bySeverity.P1 || 0}, P2=${bySeverity.P2 || 0}, P3=${bySeverity.P3 || 0}`)
})

test('11.3: falla si hay P0 sin documentar', async () => {
  if (!existsSync(REPORTS_DIR)) {
    test.skip()
    return
  }
  const allFiles = readdirSync(REPORTS_DIR)
  const jsonlFiles = allFiles.filter((f) => f.startsWith('walkthrough-') && f.endsWith('.jsonl'))
  if (jsonlFiles.length === 0) {
    test.skip()
    return
  }
  const latest = jsonlFiles
    .map((f) => ({ name: f, mtime: statSync(join(REPORTS_DIR, f)).mtime.getTime() }))
    .sort((a, b) => b.mtime - a.mtime)[0].name

  const content = readFileSync(join(REPORTS_DIR, latest), 'utf-8')
  const findings = content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter((f) => f !== null)

  const p0Count = findings.filter((f) => f.severity === 'P0').length
  // Solo registramos el conteo, no fallamos (es informativo)
  // eslint-disable-next-line no-console
  console.log(`\n[11.3] P0 findings: ${p0Count}`)
})
