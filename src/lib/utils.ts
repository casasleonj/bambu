import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { ZodError } from "zod"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  // minimumFractionDigits/maximumFractionDigits fijos en 0: sin esto,
  // Intl.NumberFormat toma los decimales por defecto de COP desde los
  // datos ICU del runtime, que difieren entre Node (server) y V8 del
  // navegador (client) según la build/version — causa un hydration
  // mismatch de texto ("$ 17.600" en el server vs "$ 17.600,00" en el
  // client) que hace que React regenere el árbol completo en cada página
  // que muestra un monto. COP no tiene decimales en uso real, así que 0
  // es además el formato correcto, no solo el determinístico.
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
  }).format(new Date(date))
}

export function formatLocalDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('T')[0].split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CO')
}

export function formatZodError(error: ZodError): string {
  // Zod 4 cambio: error.flatten() IGNORA los custom messages del
  // schema y devuelve "Invalid input: expected X, received Y" generico.
  // Hay que iterar error.issues y extraer path + message para
  // preservar los custom messages (ej. "alertaTipo requerido").
  //
  // Tambien deduplica: si un solo campo tiene multiples issues
  // (ej. min + max violation), reportamos solo el primero.
  // Filtramos issues con mensaje vacio (caso edge: refine con
  // message: '' devuelve error con mensaje vacio).
  const seen = new Set<string>()
  const messages: string[] = []
  for (const issue of error.issues) {
    if (!issue.message) continue
    const path = issue.path.length > 0 ? issue.path.join('.') : 'body'
    const key = `${path}:${issue.message}`
    if (seen.has(key)) continue
    seen.add(key)
    // Formato: "<path>: <message>" para que el admin sepa que campo
    // fallo. Si no hay path (error de root), usamos "body".
    messages.push(`${path}: ${issue.message}`)
  }
  return messages.length > 0 ? messages.join(', ') : 'Error de validación'
}