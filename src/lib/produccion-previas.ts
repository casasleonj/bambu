// #645 — varias producciones el mismo día (otro sellador u otro turno). El stock del día es uno solo: lo que ya produjeron las
// producciones anteriores (menos sus pérdidas) pasa a ser parte del stock inicial de la siguiente, para que el cuadre del día
// no cuente nada dos veces ni se olvide de nada.

export interface ProduccionPrevia {
  items: { producto: string; producido: number; rotas: number; filtradas: number; consumoInterno: number }[]
}

/** Producido menos pérdidas de `producto` en las producciones anteriores del mismo día. */
export function netoPrevioDelDia(previas: ProduccionPrevia[], producto: string): number {
  return previas.reduce((total, p) => total + p.items
    .filter((i) => i.producto === producto)
    .reduce((s, i) => s + i.producido - i.rotas - i.filtradas - i.consumoInterno, 0), 0)
}
