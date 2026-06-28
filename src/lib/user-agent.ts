import { UAParser } from 'ua-parser-js'

/**
 * Convert a raw User-Agent string into a human-readable device label.
 * Uses ua-parser-js v2 API.
 */
export function parseDeviceName(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Dispositivo desconocido'

  const parser = new UAParser(userAgent)
  const result = parser.getResult()
  const browser = result.browser.name ?? 'Navegador'
  const os = result.os.name ?? 'SO'
  const type = result.device.type ?? 'desktop'

  const deviceTypeLabel =
    type === 'mobile' ? 'Móvil' : type === 'tablet' ? 'Tablet' : 'Escritorio'

  return `${browser} en ${os} (${deviceTypeLabel})`
}
