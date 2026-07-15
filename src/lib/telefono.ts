const INDICATIVO_COLOMBIA = '57'
const DIGITOS_MOVIL_FIJO_COLOMBIA = 10
const DIGITOS_INTERNACIONAL_COLOMBIA = 12
const MIN_DIGITOS_TELEFONO = 7

export function extraerDigitos(raw: string | number | null | undefined): string {
  const input = typeof raw === 'number' ? String(raw) : (raw ?? '')
  return input.replace(/\D/g, '')
}

export function normalizarTelefono(raw: string | number | null | undefined): string {
  const input = typeof raw === 'number' ? String(raw) : (raw ?? '')
  const digitos = extraerDigitos(input)

  if (!digitos) return ''

  const inputSinEspacios = input.replace(/\s/g, '')
  const tieneIndicativo = inputSinEspacios.startsWith('+57') || digitos.startsWith(INDICATIVO_COLOMBIA)

  if (digitos.length === DIGITOS_INTERNACIONAL_COLOMBIA && digitos.startsWith(INDICATIVO_COLOMBIA)) {
    return digitos
  }

  if (tieneIndicativo) {
    return digitos
  }

  if (digitos.length === DIGITOS_MOVIL_FIJO_COLOMBIA) {
    return `${INDICATIVO_COLOMBIA}${digitos}`
  }

  if (digitos.length >= MIN_DIGITOS_TELEFONO && digitos.length < DIGITOS_MOVIL_FIJO_COLOMBIA) {
    return `${INDICATIVO_COLOMBIA}${digitos}`
  }

  return digitos
}

function formatearConEspacios(digitos: string): string {
  if (digitos.length <= 3) return digitos
  if (digitos.length <= 6) return `${digitos.slice(0, 3)} ${digitos.slice(3)}`
  if (digitos.length === 7) return `${digitos.slice(0, 3)} ${digitos.slice(3)}`
  if (digitos.length <= 9) return `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}`
  return `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6, 10)}`
}

export function formatearTelefonoParaInput(raw: string | number | null | undefined): string {
  const digitos = extraerDigitos(raw)
  if (!digitos) return ''

  const sinIndicativo = digitos.startsWith(INDICATIVO_COLOMBIA) && digitos.length === DIGITOS_INTERNACIONAL_COLOMBIA
    ? digitos.slice(INDICATIVO_COLOMBIA.length)
    : digitos

  return formatearConEspacios(sinIndicativo)
}

export function extraerDigitosLocales(raw: string | number | null | undefined): string {
  const digitos = extraerDigitos(raw)
  if (!digitos) return ''

  const esInternacional = digitos.startsWith(INDICATIVO_COLOMBIA) && digitos.length === DIGITOS_INTERNACIONAL_COLOMBIA
  if (esInternacional) {
    return digitos.slice(INDICATIVO_COLOMBIA.length)
  }

  return digitos
}

export function formatearDigitosLocales(raw: string | number | null | undefined): string {
  const digitos = extraerDigitosLocales(raw)
  if (!digitos) return ''
  return formatearConEspacios(digitos)
}

export function formatearTelefonoParaCopiar(raw: string | number | null | undefined): string {
  const digitos = extraerDigitos(raw)
  if (!digitos) return ''

  const conIndicativo = digitos.startsWith(INDICATIVO_COLOMBIA) ? digitos : `${INDICATIVO_COLOMBIA}${digitos}`

  if (conIndicativo.length <= 2) return `+${conIndicativo}`
  if (conIndicativo.length <= 5) return `+${conIndicativo.slice(0, 2)} ${conIndicativo.slice(2)}`
  if (conIndicativo.length <= 8) return `+${conIndicativo.slice(0, 2)} ${conIndicativo.slice(2, 5)} ${conIndicativo.slice(5)}`
  return `+${conIndicativo.slice(0, 2)} ${conIndicativo.slice(2, 5)} ${conIndicativo.slice(5, 8)} ${conIndicativo.slice(8)}`
}

export function formatearTelefonoParaLlamar(raw: string | number | null | undefined): string {
  const copia = formatearTelefonoParaCopiar(raw)
  return copia.replace(/\s/g, '')
}

export function esTelefonoValido(raw: string | number | null | undefined): boolean {
  const normalizado = normalizarTelefono(raw)
  return normalizado.length >= MIN_DIGITOS_TELEFONO
}
