// PostgreSQL real; únicamente la base sintética de integración.
import { afterAll,beforeAll,describe,expect,it } from 'vitest'
import { testPrisma as db,resetAndSeed,disconnect } from './setup'
import { diaVigenciaNormal,resolverVersionTarifa } from '../../comision-tarifa-version'

describe('#1010 F2B.1 diario prospectivo',()=>{
  beforeAll(async()=>{await resetAndSeed()})
  afterAll(disconnect)
  async function crearTrabajador() {
    return db.trabajador.create({data:{nombre:'QA tarifa '+crypto.randomUUID(),rol:'SELLADOR',tipoPago:'COMISION',comPacaAgua:300}})
  }
  it('alta y cambios del mismo día preservan todas las versiones; contacto no crea versión',async()=>{
    const t=await crearTrabajador()
    const original=await db.comisionTarifaVersion.findMany({where:{trabajadorId:t.id},orderBy:{id:'asc'}})
    expect(original).toHaveLength(1)
    expect(original[0].origen).toBe('ALTA')
    const hoy=original[0].registradoAt.toLocaleDateString('en-CA',{timeZone:'America/Bogota'})
    expect(original[0].fechaVigencia.toISOString().slice(0,10)).toBe(hoy)
    await db.trabajador.update({where:{id:t.id},data:{telefono:'3000000000'}})
    expect(await db.comisionTarifaVersion.count({where:{trabajadorId:t.id}})).toBe(1)
    await db.trabajador.update({where:{id:t.id},data:{comPacaAgua:330}})
    await db.trabajador.update({where:{id:t.id},data:{comPacaAgua:350}})
    const versiones=await db.comisionTarifaVersion.findMany({where:{trabajadorId:t.id},orderBy:{id:'asc'}})
    expect(versiones).toHaveLength(3)
    expect(versiones.map(v=>(v.datos as {comPacaAgua:string}).comPacaAgua).map(Number)).toEqual([300,330,350])
    for(const v of versiones.slice(1)) expect(v.fechaVigencia.toISOString().slice(0,10)).toBe(diaVigenciaNormal(v.registradoAt))
    const fecha=versiones[2].fechaVigencia.toISOString().slice(0,10)
    expect(resolverVersionTarifa(versiones,'TRABAJADOR',t.id,fecha)).toMatchObject({versionId:versiones[2].id.toString(),estado:'REGISTRADA'})
    expect(resolverVersionTarifa(versiones,'TRABAJADOR',t.id,hoy)).toMatchObject({versionId:original[0].id.toString()})
  })
  it('dos actualizaciones concurrentes conservan ambos cambios y no pierden campos',async()=>{
    const t=await crearTrabajador()
    await Promise.all([
      db.trabajador.update({where:{id:t.id},data:{comPacaAgua:330}}),
      db.trabajador.update({where:{id:t.id},data:{comPacaHielo:450}}),
    ])
    const versiones=await db.comisionTarifaVersion.findMany({where:{trabajadorId:t.id},orderBy:{id:'asc'}})
    expect(versiones).toHaveLength(3)
    expect(versiones[2].datos).toMatchObject({comPacaAgua:'330.00',comPacaHielo:'450.00'})
    expect(versiones[1].id<versiones[2].id).toBe(true)
  })
  it('captura configuración general, ausencia y cambios, sin capturar otras claves',async()=>{
    const where={ambito:'COM_REPARTIDOR'}
    const antes=await db.comisionTarifaVersion.count({where})
    await db.config.upsert({where:{clave:'QA_TARIFA_OTRA'},update:{valor:'abc'},create:{clave:'QA_TARIFA_OTRA',valor:'abc'}})
    expect(await db.comisionTarifaVersion.count({where})).toBe(antes)
    await db.config.upsert({where:{clave:'COM_REPARTIDOR'},update:{valor:'701'},create:{clave:'COM_REPARTIDOR',valor:'701'}})
    await db.config.upsert({where:{clave:'COM_REPARTIDOR'},update:{valor:'702'},create:{clave:'COM_REPARTIDOR',valor:'702'}})
    await db.config.update({where:{clave:'COM_REPARTIDOR'},data:{valor:'702'}})
    await db.config.delete({where:{clave:'COM_REPARTIDOR'}})
    const versiones=await db.comisionTarifaVersion.findMany({where,orderBy:{id:'asc'}})
    expect(versiones).toHaveLength(antes+3)
    expect(versiones.slice(-3).map(v=>v.datos)).toEqual([{version:1,valor:'701'},{version:1,valor:'702'},{version:1,valor:null}])
  })
  it('rollback de la edición revierte también la versión; modificación y borrado directos se rechazan',async()=>{
    const t=await crearTrabajador()
    await expect(db.$transaction(async tx=>{
      await tx.trabajador.update({where:{id:t.id},data:{comPacaAgua:990}})
      throw new Error('rollback sintético')
    })).rejects.toThrow('rollback sintético')
    const filas=await db.comisionTarifaVersion.findMany({where:{trabajadorId:t.id}})
    expect(filas).toHaveLength(1)
    expect(Number((await db.trabajador.findUniqueOrThrow({where:{id:t.id}})).comPacaAgua)).toBe(300)
    await expect(db.comisionTarifaVersion.update({where:{id:filas[0].id},data:{datos:{version:2}}})).rejects.toThrow()
    await expect(db.comisionTarifaVersion.delete({where:{id:filas[0].id}})).rejects.toThrow()
    await expect(db.trabajador.delete({where:{id:t.id}})).rejects.toThrow()
  })
  it('app_write puede editar la configuración por el camino autorizado, no insertar una versión directamente',async()=>{
    const t=await crearTrabajador()
    // El GRANT a Trabajador solo se usa dentro de esta transacción de fixtures.
    // Se revierte deliberadamente para no contaminar los demás tests.
    await expect(db.$transaction(async tx=>{
      await tx.$executeRaw`GRANT USAGE ON SCHEMA public TO app_write`
      await tx.$executeRaw`GRANT SELECT, UPDATE ON public."Trabajador" TO app_write`
      await tx.$executeRaw`CREATE POLICY tarifa_qa_trabajador ON public."Trabajador" FOR ALL TO app_write USING (true) WITH CHECK (true)`
      await tx.$executeRaw`SET LOCAL ROLE app_write`
      const filas=await tx.$executeRaw`UPDATE public."Trabajador" SET "comPacaAgua"=370 WHERE id=${t.id}`
      expect(filas).toBe(1)
      const versiones=await tx.comisionTarifaVersion.findMany({where:{trabajadorId:t.id},orderBy:{id:'asc'}})
      expect(versiones).toHaveLength(2)
      expect(versiones[1].datos).toMatchObject({comPacaAgua:'370.00'})
      throw new Error('fin prueba rol aislada')
    })).rejects.toThrow('fin prueba rol aislada')
    expect(await db.comisionTarifaVersion.count({where:{trabajadorId:t.id}})).toBe(1)
    await expect(db.$transaction(async tx=>{
      await tx.$executeRaw`SET LOCAL ROLE app_write`
      await tx.comisionTarifaVersion.create({data:{ambito:'TRABAJADOR',trabajadorId:t.id,fechaVigencia:new Date('2026-01-01T00:00:00Z'),origen:'CAMBIO',rolDb:'app_write',datos:{version:1}}})
    })).rejects.toThrow()
    expect(await db.comisionTarifaVersion.count({where:{trabajadorId:t.id}})).toBe(1)
  })
  it('RLS y roles de Data API quedan sin acceso; backend no puede editar o truncar',async()=>{
    const [tabla]=await db.$queryRaw<Array<{rls:boolean}>>`SELECT relrowsecurity AS rls FROM pg_class WHERE oid='public."ComisionTarifaVersion"'::regclass`
    expect(tabla.rls).toBe(true)
    const roles=await db.$queryRaw<Array<{rolname:string; lectura:boolean; insercion:boolean; edicion:boolean; borrado:boolean; truncado:boolean}>>`
      SELECT rolname,has_table_privilege(oid,'public."ComisionTarifaVersion"','SELECT') AS lectura,
      has_table_privilege(oid,'public."ComisionTarifaVersion"','INSERT') AS insercion,
      has_table_privilege(oid,'public."ComisionTarifaVersion"','UPDATE') AS edicion,
      has_table_privilege(oid,'public."ComisionTarifaVersion"','DELETE') AS borrado,
      has_table_privilege(oid,'public."ComisionTarifaVersion"','TRUNCATE') AS truncado
      FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','app_write')
    `
    for(const r of roles) {
      expect(r).toMatchObject({edicion:false,borrado:false,truncado:false})
      if(r.rolname!=='app_write') expect(r).toMatchObject({lectura:false,insercion:false})
    }
    expect(roles.some(r=>r.rolname==='app_write')).toBe(true)
  })
})
