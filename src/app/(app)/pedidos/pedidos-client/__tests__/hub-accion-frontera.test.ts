// @tests Contrato de cierre VENTA_LIBRE §4/§15: el Pedido Hub NO crea una
// Venta Libre. La opción "Venta durante la ruta →" de la frontera N2 SOLO
// navega al contexto de Embarques (donde se registra). Sin segunda
// implementación de creación de Venta Libre dentro de Pedidos.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const clientSource = readFileSync(
  join(process.cwd(), 'src/app/(app)/pedidos/pedidos-client/index.tsx'),
  'utf-8',
)
const hubDir = join(process.cwd(), 'src/app/(app)/pedidos/pedido-hub')

describe('frontera N2 ↔ Venta Libre — Pedidos NO crea Venta Libre', () => {
  it('handleHubAccion: "venta-libre" NAVEGA a Embarques, no crea nada', () => {
    const caso = clientSource.slice(
      clientSource.indexOf("case 'venta-libre':"),
      clientSource.indexOf('break', clientSource.indexOf("case 'venta-libre':")),
    )
    // navega
    expect(caso).toMatch(/router\.push\((?:pedido\.embarqueId\s*\?\s*)?`?\/embarques/)
    // NO abre el modal de creación de pedido/venta ni llama a un endpoint
    expect(caso).not.toMatch(/setShowModal\(true\)|crearPedido|\/api\/pedidos\/venta-libre|fetch\(/)
  })

  it('handleHubAccion: "nueva-demanda" arma el workspace con pedidoOrigenId del pedido origen (G11.B), no en blanco', () => {
    const caso = clientSource.slice(
      clientSource.indexOf("case 'nueva-demanda':"),
      clientSource.indexOf('break', clientSource.indexOf("case 'nueva-demanda':")),
    )
    expect(caso).toMatch(/setNuevaDemanda\(\{/)
    expect(caso).toMatch(/pedidoOrigenId:\s*pedido\.id/)
    expect(caso).toMatch(/clienteId:\s*pedido\.clienteId/)
    expect(caso).toMatch(/setShowModal\(true\)/)
    expect(caso).not.toMatch(/venta-libre|VENTA_LIBRE/)
  })

  it('el workspace de nueva demanda recibe pedidoOrigenId en initialDraft y modo="nueva-demanda"', () => {
    const nd = clientSource.slice(
      clientSource.indexOf('hubMode && nuevaDemanda ?'),
      clientSource.indexOf('hubMode && !pedidoInicial ?'),
    )
    expect(nd).toMatch(/modo="nueva-demanda"/)
    expect(nd).toMatch(/pedidoOrigenId:\s*nuevaDemanda\.pedidoOrigenId/)
  })

  it('ningún componente del pedido-hub llama al endpoint de creación de Venta Libre', () => {
    for (const f of ['pedido-exception-panel.tsx', 'completar-pendiente-form.tsx', 'actividad-acciones.tsx', 'use-gestion-pendiente.ts', 'peek-relaciones.tsx']) {
      const src = readFileSync(join(hubDir, f), 'utf-8')
      expect(src, f).not.toMatch(/\/api\/pedidos\/venta-libre|CrearVentasLibres|origen:\s*['"]VENTA_LIBRE['"]/)
    }
  })
})
