/** Límite Int de PostgreSQL; captura comercial + regalo deben caber como unidades físicas. */
export function cantidadesRegaloValidas(conPrecio: number, regalo = 0): boolean {
  return Number.isSafeInteger(conPrecio) && conPrecio >= 0 &&
    Number.isSafeInteger(regalo) && regalo >= 0 &&
    conPrecio + regalo <= 2_147_483_647 &&
    (regalo === 0 || conPrecio > 0)
}
