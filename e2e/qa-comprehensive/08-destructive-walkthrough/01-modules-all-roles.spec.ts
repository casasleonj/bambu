/**
 * Destructive Walkthrough — Tier 8 / 01
 *
 * Matriz módulo × rol × viewport.
 * Para cada combinación, navega a cada módulo accesible, enumera los elementos
 * interactivos, verifica overflow horizontal (mobile), touch targets (mobile),
 * garbage text, errores de Next.js, y registra findings.
 *
 * Tests generados: ALL_COMBOS (8) × ALL_MODULES (~30) = ~240 tests
 *
 * Ejecución:
 *   npx playwright test e2e/qa-comprehensive/08-destructive-walkthrough/01-modules-all-roles.spec.ts
 *   # ~10-15 min con workers=4 y 2 projects (chromium + chromium-mobile)
 */
import {
  test,
  ALL_COMBOS,
  ALL_MODULES,
  loginAsRole,
  setViewportFor,
  enumerateInteractiveElements,
  assertNoHorizontalOverflow,
  assertNoGarbageText,
  assertNoNextErrors,
  assertTouchTargets,
  addFinding,
  shoot,
  BASE,
} from './00-fixtures'

/** Un test por combinación (rol × viewport × módulo) */
for (const combo of ALL_COMBOS) {
  for (const mod of ALL_MODULES) {
    test(`[${combo.label}] ${mod.name} (${mod.path}) — smoke + inventario UI`, async ({ page }) => {
      // 1. Setear viewport (programático, ignora project default)
      await setViewportFor(page, combo.viewport)

      // 2. Login con el rol
      await loginAsRole(page, combo.role)

      // 3. Navegar al módulo
      const response = await page.goto(`${BASE}${mod.path}`, { waitUntil: 'domcontentloaded' }).catch(() => null)
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(500)

      // 4. Si la página devolvió >= 500, registrar finding crítico
      if (response && response.status() >= 500) {
        addFinding({
          severity: 'P0',
          module: mod.name.toLowerCase(),
          title: `${mod.name} devuelve HTTP ${response.status()} para ${combo.role}`,
          description: `URL ${BASE}${mod.path} devolvió ${response.status()}. Probable error de Next.js o ruta rota.`,
          expected: 'HTTP 200',
          observed: `HTTP ${response.status()}`,
        })
        await shoot(page, `${combo.role}-${combo.viewport}-${mod.name}-HTTP-${response.status()}`)
        return
      }

      // 5. Si la página devolvió 403/404, ese rol no tiene acceso (no es bug)
      if (response && (response.status() === 403 || response.status() === 404)) {
        // No registramos finding, es comportamiento esperado
        return
      }

      // 6. Verificar que la página no esté vacía
      const bodyText = (await page.locator('body').textContent().catch(() => '')) ?? ''
      if (bodyText.length < 100) {
        addFinding({
          severity: 'P1',
          module: mod.name.toLowerCase(),
          title: `${mod.name} renderiza casi vacío para ${combo.label}`,
          description: `Body length: ${bodyText.length} chars (esperado > 100).`,
          expected: 'Página renderiza con contenido',
          observed: 'Body casi vacío',
        })
        await shoot(page, `${combo.role}-${combo.viewport}-${mod.name}-vacio`)
        return
      }

      // 7. Verificar ausencia de errores de Next.js
      const nextErrors = await assertNoNextErrors(page)
      if (nextErrors.hasError) {
        addFinding({
          severity: 'P0',
          module: mod.name.toLowerCase(),
          title: `Error visible en ${mod.name} para ${combo.label}`,
          description: `Body contiene error de Next.js: ${nextErrors.snippet.slice(0, 200)}`,
          expected: 'Sin errores visibles',
          observed: nextErrors.snippet.slice(0, 200),
        })
      }

      // 8. Verificar ausencia de garbage text
      const garbageCheck = await assertNoGarbageText(page)
      if (garbageCheck.garbage) {
        addFinding({
          severity: 'P1',
          module: mod.name.toLowerCase(),
          title: `Texto "basura" en ${mod.name} (${combo.label})`,
          description: `Encontrado: ${garbageCheck.garbage.join(', ')}`,
          expected: 'Sin texto basura (undefined, null, NaN, [object Object])',
          observed: garbageCheck.garbage.join(', '),
        })
      }

      // 9. Verificar overflow horizontal (mobile crítico)
      if (combo.viewport === 'mobile') {
        const overflow = await assertNoHorizontalOverflow(page)
        if (overflow.overflow) {
          addFinding({
            severity: 'P2',
            module: mod.name.toLowerCase(),
            title: `Overflow horizontal en ${mod.name} (${combo.label})`,
            description: `scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}`,
            expected: 'Sin overflow horizontal',
            observed: `scrollWidth > clientWidth en mobile (390x844)`,
          })
        }

        // 10. Verificar touch targets
        const touchCheck = await assertTouchTargets(page, 44)
        if (touchCheck.violations.length > 0) {
          addFinding({
            severity: 'P2',
            module: mod.name.toLowerCase(),
            title: `Touch targets pequeños en ${mod.name} (${combo.label})`,
            description: `${touchCheck.violations.length} elementos < 44x44: ${touchCheck.violations.slice(0, 5).join('; ')}`,
            expected: 'Todos los touch targets >= 44x44',
            observed: touchCheck.violations.join('; '),
          })
        }
      }

      // 11. Enumerar elementos interactivos (informe de inventario)
      const elements = await enumerateInteractiveElements(page)
      const inventory = {
        buttons: elements.buttons.length,
        links: elements.links.length,
        inputs: elements.inputs.length,
        selects: elements.selects.length,
        textareas: elements.textareas.length,
        checkboxes: elements.checkboxes.length,
      }
      const totalInteractive = Object.values(inventory).reduce((a, b) => a + b, 0)

      if (totalInteractive === 0 && mod.expectedCTAs.length > 0) {
        addFinding({
          severity: 'P2',
          module: mod.name.toLowerCase(),
          title: `${mod.name} (${combo.label}) no tiene elementos interactivos`,
          description: `Esperado CTAs: ${mod.expectedCTAs.join(', ')}. Inventario: ${JSON.stringify(inventory)}.`,
          expected: `Al menos 1 botón/link/input`,
          observed: 'Página sin elementos interactivos',
        })
      }

      // 12. Verificar CTAs esperados
      for (const cta of mod.expectedCTAs) {
        const ctaFound = elements.buttons.some((b) =>
          b.text.toLowerCase().includes(cta.toLowerCase())
        ) || elements.links.some((l) =>
          l.text.toLowerCase().includes(cta.toLowerCase())
        )
        if (!ctaFound) {
          addFinding({
            severity: 'P3',
            module: mod.name.toLowerCase(),
            title: `CTA esperado "${cta}" no visible en ${mod.name} (${combo.label})`,
            description: `Buscado en buttons y links. Inventario: ${elements.buttons.length} buttons, ${elements.links.length} links.`,
            expected: `CTA "${cta}" visible`,
            observed: 'No encontrado',
          })
        }
      }

      // 13. Screenshot solo si es desktop (mobile satura el repo)
      if (combo.viewport === 'desktop') {
        await shoot(page, `01-${combo.role}-${mod.name}`)
      }
    })
  }
}

test.afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`\n[01-modules-all-roles] Matriz completa ejecutada.`)
  console.log(`Ver: reports/walkthrough-*.jsonl para findings.`)
})
