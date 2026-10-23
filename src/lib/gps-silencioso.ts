/**
 * Captura de GPS sin intervención del usuario (PR-1B, decisión del PO 2026-10-22):
 * al marcar una entrega la app toma la posición del dispositivo por su cuenta;
 * nadie la llena ni la justifica. Es "mejor esfuerzo": con permiso denegado, sin
 * soporte o tras `timeoutMs` devuelve `null` y la entrega sigue su curso (la
 * obligatoriedad por rol la decide el servidor, no esta función).
 *
 * `maximumAge` acepta una lectura reciente para no bloquear el clic en redes/GPS lentos.
 */
import type { GPSCoordinates } from '@/lib/gps'

export function capturarGpsSilencioso(timeoutMs = 3000, maximumAgeMs = 30_000): Promise<GPSCoordinates | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    // Red de seguridad: algunos navegadores no respetan `timeout` si el permiso queda pendiente.
    const limite = setTimeout(() => resolve(null), timeoutMs + 500)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(limite)
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
      },
      () => {
        clearTimeout(limite)
        resolve(null)
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: maximumAgeMs },
    )
  })
}
