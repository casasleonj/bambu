/** #688 — «la base de caja cambió»: quien la guarda (modal o «Caja base») avisa; el cierre la vuelve a leer al instante. */
export const EVENTO_BASE_CAJA = 'base-caja-actualizada'
export function avisarBaseCajaActualizada(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_BASE_CAJA))
}
