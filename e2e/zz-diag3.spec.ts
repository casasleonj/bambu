import { test, login } from '/home/cristof/Documents/bambu_demo_multimodelo/e2e/fixtures'

test('diag login repartidor aislado', async ({ browser }) => {
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  try {
    await login(p, 'rep', 'rep123')
    console.log('LOGIN REP OK, url:', p.url())
  } catch (e) {
    console.log('LOGIN REP FAIL:', String(e).slice(0, 300))
    console.log('URL at fail:', p.url())
    const errText = await p.locator('body').innerText().catch(() => 'no-body')
    console.log('BODY:', errText.replace(/\n+/g, ' | ').slice(0, 400))
  } finally {
    await ctx.close()
  }
})
