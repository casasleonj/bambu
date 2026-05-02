import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { ZodError } from "zod"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
  }).format(amount)
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
  }).format(new Date(date))
}

export function formatZodError(error: ZodError): string {
  const flat = error.flatten()
  const fieldErrors = Object.values(flat.fieldErrors).flat().filter(Boolean)
  const formErrors = flat.formErrors.filter(Boolean)
  return [...formErrors, ...fieldErrors].join(', ') || 'Error de validación'
}