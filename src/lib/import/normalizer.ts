import { Prisma } from '@prisma/client'

/**
 * Normalización de datos crudos del papel/Excel hacia valores canónicos.
 *
 * Toda la lógica es pura (sin side-effects) para ser fácil de testear.
 */

const DEFAULT_COUNTRY_CODE = '57'

export interface NormalizedPhone {
  raw: string
  normalized: string
  isValid: boolean
  countryCode?: string
}

export function normalizeString(str: unknown): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function normalizeName(str: unknown): string {
  return normalizeString(str)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function collapseWhitespace(str: unknown): string {
  return normalizeString(str).replace(/\s+/g, ' ')
}

/**
 * Normaliza un teléfono colombiano hacia E.164 (sin +).
 *
 * Reglas:
 *  - Se eliminan espacios, guiones, paréntesis, puntos.
 *  - Si empieza con '+', se conserva el country code.
 *  - Si empieza con '57' y tiene 12 dígitos, se conserva.
 *  - Si tiene 10 dígitos y empieza con 3, se asume móvil colombiano → 573XXXXXXXXX.
 *  - Si tiene 7-9 dígitos, se asume fijo local → se le agrega 5760 (Bogotá) o 57.
 *  - Otros casos se marcan como inválidos.
 */
export function normalizePhone(raw: unknown): NormalizedPhone {
  const input = normalizeString(raw)
  const digitsOnly = input.replace(/\D/g, '')

  if (!digitsOnly) {
    return { raw: input, normalized: '', isValid: false }
  }

  let normalized = digitsOnly
  let countryCode = DEFAULT_COUNTRY_CODE

  if (input.startsWith('+')) {
    if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
      normalized = digitsOnly
      countryCode = digitsOnly.slice(0, digitsOnly.length - 10)
      return { raw: input, normalized, isValid: true, countryCode }
    }
    return { raw: input, normalized: digitsOnly, isValid: false }
  }

  if (digitsOnly.length === 12 && digitsOnly.startsWith('57') && digitsOnly[2] === '3') {
    normalized = digitsOnly
    return { raw: input, normalized, isValid: true, countryCode: '57' }
  }

  if (digitsOnly.length === 10 && digitsOnly.startsWith('3')) {
    normalized = `57${digitsOnly}`
    return { raw: input, normalized, isValid: true, countryCode: '57' }
  }

  if (digitsOnly.length >= 7 && digitsOnly.length <= 9) {
    normalized = `57${digitsOnly}`
    return { raw: input, normalized, isValid: true, countryCode: '57' }
  }

  return { raw: input, normalized: digitsOnly, isValid: false }
}

/**
 * Convierte un monto en string a Decimal canónico.
 *
 * Soporta:
 *  - "$ 1.500,00" → 1500.00
 *  - "1,500.00" → 1500.00
 *  - "1500" → 1500.00
 *  - "1.500" (sin decimales) → 1500 (formato colombiano con punto miles)
 */
export function parseMoney(raw: unknown): Prisma.Decimal | null {
  const input = normalizeString(raw)
  if (!input) return null

  const hasComma = input.includes(',')
  const hasDot = input.includes('.')
  let normalized = input.replace(/[$\s]/g, '')

  if (hasComma && hasDot) {
    const lastComma = normalized.lastIndexOf(',')
    const lastDot = normalized.lastIndexOf('.')
    if (lastComma > lastDot) {
      // 1.234,56 -> 1234.56
      normalized = normalized.replace(/\./g, '').replace(',', '.')
    } else {
      // 1,234.56 -> 1234.56
      normalized = normalized.replace(/,/g, '')
    }
  } else if (hasComma) {
    const parts = normalized.split(',')
    if (parts.length === 2 && parts[1].length === 2) {
      // 1500,00 -> 1500.00
      normalized = normalized.replace(',', '.')
    } else {
      // 1,500 -> 1500 (thousands)
      normalized = normalized.replace(/,/g, '')
    }
  } else if (hasDot) {
    const parts = normalized.split('.')
    // If there are multiple dots, or the last part has 3 digits, treat as thousands separator
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      normalized = normalized.replace(/\./g, '')
    }
    // Otherwise keep single dot as decimal (e.g. 1500.50)
  }

  const value = Number(normalized)
  if (Number.isNaN(value)) return null
  return new Prisma.Decimal(value)
}

export function parseInteger(raw: unknown): number | null {
  const input = normalizeString(raw)
  if (!input) return null
  const digits = input.replace(/[^\d-]/g, '')
  if (!digits || digits === '-') return null
  const value = Number(digits)
  if (Number.isNaN(value)) return null
  return value
}

export function parseBoolean(raw: unknown): boolean | null {
  const input = normalizeString(raw).toLowerCase()
  if (input === '' || input === 'null' || input === 'undefined') return null
  if (['si', 'sí', 's', 'yes', 'y', 'true', '1', 'verdadero'].includes(input)) return true
  if (['no', 'n', 'false', '0', 'falso'].includes(input)) return false
  return null
}

/**
 * Parsea una fecha/hora desde string.
 *
 * El formato por defecto es DD/MM/AAAA. Si el string incluye hora, se asume
 * la zona horaria de Bogotá.
 *
 * Heurística DD/MM vs MM/DD:
 *  - Si día > 12 → DD/MM
 *  - Si mes > 12 → MM/DD (pero se invierte internamente)
 *  - Si ambos ≤ 12 → se asume DD/MM (colombiano) salvo que el caller indique lo contrario
 */
export function parseDate(raw: unknown, format: 'DD/MM/AAAA' | 'MM/DD/AAAA' | 'YYYY-MM-DD' = 'DD/MM/AAAA'): Date | null {
  const input = normalizeString(raw)
  if (!input) return null

  const isoMatch = input.match(/^\d{4}-\d{2}-\d{2}(T.*)?$/)
  if (isoMatch) {
    const date = new Date(input)
    if (!Number.isNaN(date.getTime())) return date
  }

  const { datePart, timePart } = splitDateTime(input)
  const separators = datePart.match(/[\/\-.]/g)
  if (!separators || separators.length < 2) {
    const textDate = parseSpanishTextDate(datePart)
    if (textDate) {
      return combineDateTime(textDate, timePart)
    }
    return null
  }

  const parts = datePart.split(/[\/\-.]/)
  if (parts.length < 3) return null

  const [first, second, thirdRaw] = parts
  const third = thirdRaw.length === 2 ? `20${thirdRaw}` : thirdRaw

  let day: number
  let month: number
  let year: number

  if (format === 'YYYY-MM-DD') {
    year = Number(first)
    month = Number(second)
    day = Number(third)
  } else if (format === 'MM/DD/AAAA') {
    month = Number(first)
    day = Number(second)
    year = Number(third)
  } else {
    const d = Number(first)
    const m = Number(second)
    const y = Number(third)

    if (d > 12 || m > 12) {
      day = d > 12 ? d : m
      month = d > 12 ? m : d
    } else {
      day = d
      month = m
    }
    year = y
  }

  if (!isValidDate(day, month, year)) return null

  const date = new Date(Date.UTC(year, month - 1, day))
  return combineDateTime(date, timePart)
}

function splitDateTime(input: string): { datePart: string; timePart: string | null } {
  const timeMatch = input.match(/(\d{1,2}:\d{2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?)$/i)
  if (timeMatch) {
    return {
      datePart: input.slice(0, input.length - timeMatch[0].length).trim(),
      timePart: timeMatch[0].trim(),
    }
  }
  return { datePart: input, timePart: null }
}

function parseSpanishTextDate(input: string): Date | null {
  const months: Record<string, number> = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
    ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
    jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
  }

  const lower = input.toLowerCase().replace(/[,.]/g, '')
  for (const [name, month] of Object.entries(months)) {
    const regex = new RegExp(`(\\d{1,2})\\s+(?:de\\s+)?${name}\\s+(?:de\\s+)?(\\d{2,4})`, 'i')
    const match = lower.match(regex)
    if (match) {
      const day = Number(match[1])
      const year = match[2].length === 2 ? Number(`20${match[2]}`) : Number(match[2])
      if (isValidDate(day, month, year)) {
        return new Date(Date.UTC(year, month - 1, day))
      }
    }
  }
  return null
}

function combineDateTime(date: Date, timePart: string | null): Date {
  if (!timePart) return date

  const normalized = timePart
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/a\.m\./, 'am')
    .replace(/p\.m\./, 'pm')

  const match = normalized.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?(am|pm)?/)
  if (!match) return date

  let hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = match[3] ? Number(match[3]) : 0
  const meridian = match[4]

  if (meridian === 'pm' && hours < 12) hours += 12
  if (meridian === 'am' && hours === 12) hours = 0

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hours,
      minutes,
      seconds
    )
  )
}

function isValidDate(day: number, month: number, year: number): boolean {
  if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCDate() === day && date.getUTCMonth() === month - 1
}

export function normalizeTime(raw: unknown): string | null {
  const input = normalizeString(raw)
  if (!input) return null

  const match = input.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i)
  if (!match) return null

  let hours = Number(match[1])
  const minutes = Number(match[2])
  const meridian = match[4]?.toLowerCase()

  if (meridian?.startsWith('p') && hours < 12) hours += 12
  if (meridian?.startsWith('a') && hours === 12) hours = 0

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function slugifyColumnName(raw: unknown): string {
  return normalizeString(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
