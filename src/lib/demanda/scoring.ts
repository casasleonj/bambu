/**
 * Scoring de outbound: priorizar clientes a llamar.
 *
 * Score = diasAtraso * peso_dias + valorTipico * peso_valor
 * Solo clientes con diasAtraso > umbralMin aparecen en la lista.
 *
 * Decisión de diseño: heurística simple y transparente, debuggeable.
 * NO usamos ML porque (a) hay pocos datos, (b) la heurística es mejor
 * que un modelo en este dominio, (c) un humano necesita entender POR
 * QUÉ el score es alto (auditoría).
 */

export interface ScoringInput {
  diasAtraso: number
  /** Valor típico del pedido en pesos. Default 0. */
  valorTipico?: number
  /** Score mínimo para aparecer en la lista de llamadas. Default 0. */
  umbralMin?: number
  /** Peso del atraso (1.0 default). */
  pesoAtraso?: number
  /** Peso del valor monetario, normalizado por VALOR_REFERENCIA. Default 0.5. */
  pesoValor?: number
}

const VALOR_REFERENCIA = 50000 // 50K pesos ≈ un pedido "promedio"

export function calcularScoreLlamada(input: ScoringInput): number {
  const { diasAtraso, valorTipico = 0, pesoAtraso = 1.0, pesoValor = 0.5 } = input
  if (diasAtraso <= 0) return 0
  const valorNormalizado = valorTipico / VALOR_REFERENCIA
  const score = diasAtraso * pesoAtraso + valorNormalizado * pesoValor
  return Math.round(score * 100) / 100
}

export function debeMostrarEnLlamadas(
  input: ScoringInput & { score: number },
): boolean {
  const umbral = input.umbralMin ?? 0
  return input.diasAtraso > 0 && input.score >= umbral
}
