/**
 * #906 / #779. Observador puro de un endpoint HTTP, sin red ni dependencias de UI.
 * Permite separar hidratación pendiente de consultas sostenidas (bucle real).
 * La traza contiene únicamente tipo de evento y tiempo, nunca URL/PII.
 */
export class ContadorConsultas<T extends object> {
  private readonly enCurso = new Set<T>()
  private readonly eventos: Array<{ tipo: 'inicio' | 'fin' | 'fallo'; en: number }> = []
  private ultimoEvento: number
  private cantidad = 0

  constructor(private readonly ahora: () => number = Date.now) {
    this.ultimoEvento = ahora()
  }

  iniciar(request: T): void {
    this.cantidad++
    this.enCurso.add(request)
    this.registrar('inicio')
  }

  finalizar(request: T, fallo = false): void {
    if (this.enCurso.delete(request)) this.registrar(fallo ? 'fallo' : 'fin')
  }

  private registrar(tipo: 'inicio' | 'fin' | 'fallo'): void {
    this.ultimoEvento = this.ahora()
    this.eventos.push({ tipo, en: this.ultimoEvento })
    if (this.eventos.length > 100) this.eventos.shift()
  }

  get solicitudes(): number {
    return this.cantidad
  }

  get pendientes(): number {
    return this.enCurso.size
  }

  estable(quietMs = 350): boolean {
    return this.pendientes === 0 && this.ahora() - this.ultimoEvento >= quietMs
  }

  nuevasDesde(antes: number): number {
    return this.cantidad - antes
  }

  trazaReciente(): string {
    return this.eventos.slice(-25).map(e => e.tipo + '@' + e.en).join(', ')
  }
}
