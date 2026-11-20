import { describe, it, expect } from 'vitest'
import {
  construirCatalogoBarrios, resolverGrupoBarrio, ordenarGrupos, CLAVE_SIN_BARRIO,
} from '../grupo-barrio'

const catalogo = construirCatalogoBarrios([
  { id: 'b-centro', nombre: 'Centro', nombreNormalizado: 'centro', aliases: [{ textoNormalizado: 'el centro' }] },
  { id: 'b-vn', nombre: 'Villa Nueva', nombreNormalizado: 'villa nueva', aliases: [] },
])

describe('resolverGrupoBarrio (#836 F3, A13/A14)', () => {
  it('barrio canónico de la fuente elegida', () => {
    const g = resolverGrupoBarrio({ negocio: { barrio: 'texto viejo', barrioCanonico: { id: 'b-vn', nombre: 'Villa Nueva' } } }, catalogo)
    expect(g).toEqual({ clave: 'b:b-vn', etiqueta: 'Villa Nueva' })
  })

  it('A13: el override del pedido gana sobre negocio y cliente, y no mezcla destinos', () => {
    const g = resolverGrupoBarrio({
      overrideBarrio: 'Villa Nueva',
      negocio: { barrio: 'Centro', barrioCanonico: { id: 'b-centro', nombre: 'Centro' } },
      cliente: { barrio: 'Otro' },
    }, catalogo)
    expect(g.clave).toBe('b:b-vn')
  })

  it('un texto con otra tilde, mayúsculas o espacios cuenta en el mismo barrio canónico', () => {
    for (const t of ['CENTRO', '  centro ', 'Céntro']) {
      expect(resolverGrupoBarrio({ overrideBarrio: t, overrideDireccion: 'Cl 1' }, catalogo).clave).toBe('b:b-centro')
    }
  })

  it('un alias del catálogo cuenta en su barrio', () => {
    expect(resolverGrupoBarrio({ overrideBarrio: 'El Centro' }, catalogo)).toEqual({ clave: 'b:b-centro', etiqueta: 'Centro' })
  })

  it('A14: texto libre sin coincidencia forma su propio grupo y no se mezcla con otro', () => {
    const a = resolverGrupoBarrio({ cliente: { barrio: 'La Esperanza' } }, catalogo)
    const b = resolverGrupoBarrio({ cliente: { barrio: 'la  esperanza' } }, catalogo)
    const c = resolverGrupoBarrio({ cliente: { barrio: 'La Esperanza 2' } }, catalogo)
    expect(a.clave).toBe('t:la esperanza')
    expect(b.clave).toBe(a.clave)
    expect(c.clave).not.toBe(a.clave)
  })

  it('sin barrio en ninguna fuente → «Sin barrio» (no se pierde el pedido)', () => {
    expect(resolverGrupoBarrio({}, catalogo).clave).toBe(CLAVE_SIN_BARRIO)
    expect(resolverGrupoBarrio({ cliente: { barrio: '   ' } }, catalogo).clave).toBe(CLAVE_SIN_BARRIO)
  })

  it('override con solo dirección (sin barrio) no hereda el barrio del negocio: misma regla que la fila', () => {
    const g = resolverGrupoBarrio({ overrideDireccion: 'Cr 5 #1', negocio: { barrio: 'Centro', barrioCanonico: { id: 'b-centro', nombre: 'Centro' } } }, catalogo)
    expect(g.clave).toBe(CLAVE_SIN_BARRIO)
  })
})

describe('barrio canónico sin texto antiguo', () => {
  it('un destino con solo barrio canónico no cae en «Sin barrio»', () => {
    const g = resolverGrupoBarrio({ cliente: { barrioCanonico: { id: 'b-centro', nombre: 'Centro' } } }, catalogo)
    expect(g).toEqual({ clave: 'b:b-centro', etiqueta: 'Centro' })
  })
  it('el negocio gana sobre el cliente aunque solo tenga barrio canónico', () => {
    const g = resolverGrupoBarrio({
      negocio: { barrioCanonico: { id: 'b-vn', nombre: 'Villa Nueva' } },
      cliente: { barrio: 'Centro', barrioCanonico: { id: 'b-centro', nombre: 'Centro' } },
    }, catalogo)
    expect(g.clave).toBe('b:b-vn')
  })
})

describe('ordenarGrupos', () => {
  it('más pedidos primero y «Sin barrio» al final', () => {
    const o = ordenarGrupos([
      { clave: CLAVE_SIN_BARRIO, etiqueta: 'Sin barrio', total: 99 },
      { clave: 'b:2', etiqueta: 'Villa Nueva', total: 11 },
      { clave: 'b:1', etiqueta: 'Centro', total: 18 },
    ])
    expect(o.map((g) => g.etiqueta)).toEqual(['Centro', 'Villa Nueva', 'Sin barrio'])
  })
})

describe("#913 — identidad de venta anónima y orden de grupos no territoriales", () => {
  it("solo Consumidor Final canónico con origen de venta en punto/libre es anónima", async () => {
    const { esVentaAnonima } = await import("../grupo-barrio");
    expect(esVentaAnonima({ clienteId: "CONSUMIDOR_FINAL", origen: "VENTA_RAPIDA" })).toBe(true);
    expect(esVentaAnonima({ clienteId: "CONSUMIDOR_FINAL", origen: "VENTA_LIBRE" })).toBe(true);
    // un pedido a domicilio del Consumidor Final necesita entrega: no se excluye
    expect(esVentaAnonima({ clienteId: "CONSUMIDOR_FINAL", origen: "PEDIDO" })).toBe(false);
    // venta en punto con cliente registrado: territorial, sin importar el nombre ni el canal
    expect(esVentaAnonima({ clienteId: "cli-1", origen: "VENTA_RAPIDA" })).toBe(false);
    expect(esVentaAnonima({ clienteId: null, origen: "VENTA_RAPIDA" })).toBe(false);
    expect(esVentaAnonima({ clienteId: "CONSUMIDOR_FINAL" })).toBe(false);
  });
  it("las ventas anónimas van después de «Sin barrio», que va después de los barrios", async () => {
    const { ordenarGrupos } = await import("../grupo-barrio");
    const g = (clave: string, total: number) => ({ clave, etiqueta: clave, total });
    expect(ordenarGrupos([g("venta-anonima", 50), g("sin-barrio", 30), g("b:a", 1), g("b:b", 9)]).map((x) => x.clave))
      .toEqual(["b:b", "b:a", "sin-barrio", "venta-anonima"]);
  });
});
