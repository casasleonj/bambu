// @tests P0-3 PR 3 (#357): reglas del permiso de autorizar excepciones de crédito
import { describe, it, expect } from 'vitest'
import { resolverCambioAutorizador, rolPuedeAutorizar, type EstadoAutorizador } from '@/lib/autorizador-credito'

const asistenteConPermiso: EstadoAutorizador = { rol: 'ASISTENTE', activo: true, puedeAutorizarExcepcionCredito: true }
const adminSinPermiso: EstadoAutorizador = { rol: 'ADMIN', activo: true, puedeAutorizarExcepcionCredito: false }

describe('rolPuedeAutorizar', () => {
  it('solo ADMIN y ASISTENTE', () => {
    expect(['ADMIN', 'ASISTENTE'].every(rolPuedeAutorizar)).toBe(true)
    expect(['CONTADOR', 'REPARTIDOR', 'SELLADOR'].some(rolPuedeAutorizar)).toBe(false)
  })
})

describe('resolverCambioAutorizador', () => {
  it('dar el permiso a un ADMIN o ASISTENTE está permitido', () => {
    const r = resolverCambioAutorizador(adminSinPermiso, { puedeAutorizarExcepcionCredito: true }, 0)
    expect(r.error).toBeNull()
    expect(r.siguiente.puedeAutorizarExcepcionCredito).toBe(true)
  })

  it('dar el permiso a un rol sin derecho se rechaza', () => {
    const repartidor = { rol: 'REPARTIDOR', activo: true, puedeAutorizarExcepcionCredito: false }
    expect(resolverCambioAutorizador(repartidor, { puedeAutorizarExcepcionCredito: true }, 3).error).toBe('ROL_NO_PUEDE_AUTORIZAR')
    // también si el rol cambia en la misma operación
    expect(
      resolverCambioAutorizador(adminSinPermiso, { rol: 'CONTADOR', puedeAutorizarExcepcionCredito: true }, 3).error,
    ).toBe('ROL_NO_PUEDE_AUTORIZAR')
  })

  it('cambiar a un rol sin derecho quita el permiso', () => {
    const r = resolverCambioAutorizador(asistenteConPermiso, { rol: 'REPARTIDOR' }, 1)
    expect(r.error).toBeNull()
    expect(r.siguiente.puedeAutorizarExcepcionCredito).toBe(false)
  })

  it('no deja quitar el permiso a la última persona autorizadora', () => {
    expect(resolverCambioAutorizador(asistenteConPermiso, { puedeAutorizarExcepcionCredito: false }, 0).error).toBe('ULTIMO_AUTORIZADOR')
  })

  it('no deja desactivar ni cambiar de rol a la última persona autorizadora', () => {
    expect(resolverCambioAutorizador(asistenteConPermiso, { activo: false }, 0).error).toBe('ULTIMO_AUTORIZADOR')
    expect(resolverCambioAutorizador(asistenteConPermiso, { rol: 'CONTADOR' }, 0).error).toBe('ULTIMO_AUTORIZADOR')
  })

  it('con otra persona autorizadora activa sí se puede quitar', () => {
    expect(resolverCambioAutorizador(asistenteConPermiso, { puedeAutorizarExcepcionCredito: false }, 1).error).toBeNull()
    expect(resolverCambioAutorizador(asistenteConPermiso, { activo: false }, 1).error).toBeNull()
  })

  it('quien ya no cuenta como autorizador (inactivo) no bloquea nada', () => {
    const inactivo = { ...asistenteConPermiso, activo: false }
    expect(resolverCambioAutorizador(inactivo, { puedeAutorizarExcepcionCredito: false }, 0).error).toBeNull()
  })

  it('un cambio que no toca el permiso no se bloquea', () => {
    expect(resolverCambioAutorizador(asistenteConPermiso, { rol: 'ADMIN' }, 0).error).toBeNull()
  })
})
