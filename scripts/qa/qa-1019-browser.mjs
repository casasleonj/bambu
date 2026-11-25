// QA independiente #1010 F2B.1. Solo base y servidor desechables de CI.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
const url = new URL(process.env.PLAYWRIGHT_TEST_BASE_URL ?? '')
const dbUrl = new URL(process.env.DATABASE_URL ?? '')
if (process.env.CI !== 'true' || url.origin !== 'http://localhost:3001' || dbUrl.hostname !== 'localhost' || dbUrl.port !== '5432' || dbUrl.pathname !== '/bambu') throw Error('QA requiere base desechable CI')
const db = new PrismaClient()
const output = '.qa/artifacts/pr-1019'
await fs.mkdir(output, { recursive: true })
let browser
const resultados = []
async function recorrido(label, viewport) {
  const t = await db.trabajador.create({data:{nombre:'QA tarifa '+label,rol:'SELLADOR',tipoPago:'COMISION',comPacaAgua:300,comPacaHielo:300,comBotellon:300}})
  const ctx = await browser.newContext({ viewport })
  try {
    const page = await ctx.newPage()
    const errores = []
    page.on('pageerror',e=>errores.push(e.message))
    await page.goto(url.origin+'/login')
    await page.getByPlaceholder('Ingrese usuario').fill('admin')
    await page.getByPlaceholder('Ingrese contraseña').fill('admin123')
    await page.locator('button[type=submit]').click()
    await page.waitForURL(/\/(dashboard|repartidor|reportes)/,{timeout:30000})
    await page.goto(url.origin+'/trabajadores')
    const skip = page.getByTestId('base-caja-modal-skip')
    if (await skip.waitFor({state:'visible',timeout:6000}).then(()=>true).catch(()=>false)) await skip.click()
    const tarjeta = page.getByTestId('trabajador-card').filter({hasText:t.nombre})
    const editar = tarjeta.getByRole('button',{name:'Editar',exact:true})
    const campo = page.locator('#trabajador-comPacaAgua')
    await editar.click()
    await expect(campo).toHaveValue('300')
    await campo.fill('330')
    await page.getByRole('button',{name:'Cancelar',exact:true}).click()
    assert.equal(await db.comisionTarifaVersion.count({where:{trabajadorId:t.id}}),1)
    await editar.click()
    await campo.fill('330')
    const respuesta=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/trabajadores/'+t.id&&r.request().method()==='PUT')
    await page.getByRole('button',{name:'Guardar',exact:true}).click()
    assert.equal((await respuesta).status(),200)
    await expect(campo).toHaveCount(0)
    await page.reload()
    await editar.click()
    await expect(campo).toHaveValue('330')
    await page.screenshot({path:output+'/'+label+'-tarifa.png',fullPage:true})
    const filas=await db.comisionTarifaVersion.findMany({where:{trabajadorId:t.id},orderBy:{id:'asc'}})
    assert.equal(filas.length,2)
    assert.equal(Number(filas[0].datos.comPacaAgua),300)
    assert.equal(Number(filas[1].datos.comPacaAgua),330)
    const fecha=new Date(filas[1].registradoAt.toLocaleDateString('en-CA',{timeZone:'America/Bogota'})+'T00:00:00Z')
    fecha.setUTCDate(fecha.getUTCDate()+1)
    assert.equal(filas[1].fechaVigencia.toISOString(),fecha.toISOString())
    assert.equal(await db.pagoComisionRepartidor.count({where:{trabajadorId:t.id}}),0)
    assert.equal(await db.nomina.count({where:{trabajadorId:t.id}}),0)
    assert.equal(errores.length,0,errores.join('; '))
    resultados.push({viewport:label,estado:'PASO',tarifaAnterior:300,tarifaNueva:330,vigencia:fecha.toISOString().slice(0,10)})
    console.log('QA #1019 '+label+': PASO')
  } finally {await ctx.close()}
}
try {
  browser=await chromium.launch({headless:true})
  await recorrido('escritorio',{width:1280,height:850})
  await recorrido('movil',{width:390,height:844})
} catch(e) {
  resultados.push({estado:'FALLO',error:String(e)})
  throw e
} finally {
  await fs.writeFile(output+'/resumen.json',JSON.stringify({pr:1019,sha:process.env.GITHUB_SHA,resultados},null,2))
  if(browser) await browser.close()
  await db.$disconnect()
}
