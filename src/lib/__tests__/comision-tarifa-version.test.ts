import { describe,it,expect } from 'vitest'
import { diaVigenciaNormal,resolverVersionTarifa,type VersionTarifa } from '../comision-tarifa-version'
const v=(id:bigint,dia:string,valor:unknown,trabajadorId:string|null=null):VersionTarifa=>({
  id,ambito:trabajadorId?'TRABAJADOR':'COM_REPARTIDOR',trabajadorId,fechaVigencia:new Date(dia+'T00:00:00Z'),registradoAt:new Date(),datos:valor
})
describe('#1010 F2B.1 contrato temporal',()=>{
  it('usa calendario Bogotá incluso alrededor de medianoche, domingo y fin de año',()=>{
    expect(diaVigenciaNormal(new Date('2026-11-29T04:59:59Z'))).toBe('2026-11-29')
    expect(diaVigenciaNormal(new Date('2026-11-29T05:00:00Z'))).toBe('2026-11-30')
    expect(diaVigenciaNormal(new Date('2026-12-31T23:59:00Z'))).toBe('2027-01-01')
  })
  it('no extrapola antes de la primera vigencia y elige última edición del mismo día',()=>{
    const versiones=[v(3n,'2026-11-27',{version:1,valor:'330'}),v(1n,'2026-11-26',{version:1,valor:'300'}),v(2n,'2026-11-27',{version:1,valor:'310'})]
    expect(resolverVersionTarifa(versiones,'COM_REPARTIDOR',null,'2026-11-25')).toEqual({estado:'SIN_EVIDENCIA'})
    expect(resolverVersionTarifa(versiones,'COM_REPARTIDOR',null,'2026-11-26')).toMatchObject({versionId:'1',datos:{valor:'300'}})
    expect(resolverVersionTarifa(versiones,'COM_REPARTIDOR',null,'2026-11-27')).toMatchObject({versionId:'3',datos:{valor:'330'}})
  })
  it('no oculta versiones inválidas ni mezcla trabajadores o ámbito',()=>{
    const versiones=[v(1n,'2026-11-26',{version:1,valor:null}),v(2n,'2026-11-26',{version:2,valor:'330'}),v(3n,'2026-11-26',{version:1,valor:'300'},'otro')]
    expect(resolverVersionTarifa(versiones,'COM_REPARTIDOR',null,'2026-11-26')).toEqual({estado:'NO_INTERPRETABLE',versionId:'2'})
    expect(resolverVersionTarifa(versiones,'TRABAJADOR','x','2026-11-26')).toEqual({estado:'SIN_EVIDENCIA'})
    expect(()=>resolverVersionTarifa(versiones,'COM_REPARTIDOR',null,'2026-02-30')).toThrow()
  })
})
