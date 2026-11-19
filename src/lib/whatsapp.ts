/**
 * Número listo para `https://wa.me/<número>`: deja solo dígitos y antepone 57
 * (Colombia) si faltan. `null` si no parece un teléfono válido (< 7 dígitos).
 * La comunicación por WhatsApp es opcional y nunca fuente de verdad (ADR-COMUNICACIONES-001).
 */
export function telefonoWhatsapp(telefono: string): string | null {
  const d = telefono.replace(/\D/g, '')
  if (d.length < 7) return null
  return d.length === 10 ? `57${d}` : d
}

/** Enlace de chat con texto precargado (el usuario lo edita y envía; no adjunta archivos). */
export function enlaceWhatsapp(telefono: string, texto?: string): string | null {
  const wa = telefonoWhatsapp(telefono)
  if (!wa) return null
  return texto ? `https://wa.me/${wa}?text=${encodeURIComponent(texto)}` : `https://wa.me/${wa}`
}
