// Bloqueo de scroll del <body> con contador global (#594).
// Guardar/restaurar el valor previo por cada overlay falla cuando se cierran
// fuera de orden (o en el mismo render): el de abajo restaura '' y el de arriba
// restaura 'hidden', dejando la pantalla sin scroll. Con contador, solo el
// último bloqueo liberado restaura el valor original.

let locks = 0
let originalOverflow = ''

/** Bloquea el scroll del body. Devuelve la función que libera ESTE bloqueo (idempotente). */
export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (locks === 0) {
    originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  locks += 1
  let released = false
  return () => {
    if (released) return
    released = true
    locks -= 1
    if (locks === 0) document.body.style.overflow = originalOverflow
  }
}
