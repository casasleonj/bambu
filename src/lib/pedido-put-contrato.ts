/**
 * Contrato de campos de `PUT /api/pedidos/[id]`.
 *
 * Regla: ningún cambio solicitado puede ser descartado en silencio. Cada clave
 * del body cae en exactamente una categoría:
 *
 *  - PROCESADO   → el servidor lo aplica (o informa que ya estaba así).
 *  - METADATA    → acompaña a la petición, no pide ningún cambio.
 *  - RECHAZADO   → 422 `CAMPO_NO_SOPORTADO` con el motivo.
 *  - desconocida → 422 `CAMPO_NO_SOPORTADO` (un typo no puede dar "éxito").
 *
 * Se valida por clave ANTES de `PedidoUpdateSchema` en vez de volver el schema
 * `.strict()`: el schema sigue siendo reutilizable, y el rechazo conserva un
 * mensaje por campo. Clientes actuales verificados: `handlePedidoSubmit` y
 * `cambiarEstado` (pedidos-client/index.tsx) solo envían campos PROCESADOS.
 */

/** Campos que el servidor procesa. `estado`/`estadoEntrega` son alias del mismo cambio. */
export const PUT_CAMPOS_PROCESADOS = [
  'items',
  'obs',
  'actualizarCliente',
  'direccionEntrega',
  'barrioEntrega',
  'estado',
  'estadoEntrega',
] as const

/** Acompañan la petición; no piden un cambio. `offlineId` se acepta pero este PUT es declarativo (idempotente por construcción). */
export const PUT_CAMPOS_METADATA = ['casoId', 'offlineId'] as const

const MOTIVO_CANAL =
  'El canal comercial del pedido no se puede cambiar editando. Si el canal se registró por error, o si cambió la forma de entrega, pida la corrección formal a un administrador.'

/** Campos aceptados por el schema legacy pero NUNCA procesados por este endpoint. */
export const PUT_CAMPOS_RECHAZADOS: Readonly<Record<string, string>> = {
  canal: MOTIVO_CANAL,
  tipo: MOTIVO_CANAL,
  embarqueId: 'La asignación a un embarque se hace desde Planificar/Enviar, no editando el pedido.',
  estadoPago: 'El estado de pago se calcula a partir de los pagos; no se edita.',
  promesaPagoFecha: 'La promesa de pago no se edita desde este endpoint.',
  cPacaAguaEnt: 'Las cantidades entregadas se registran con la entrega, no editando el pedido.',
  cPacaHieloEnt: 'Las cantidades entregadas se registran con la entrega, no editando el pedido.',
  cBotellonFabEnt: 'Las cantidades entregadas se registran con la entrega, no editando el pedido.',
  cBotellonDomEnt: 'Las cantidades entregadas se registran con la entrega, no editando el pedido.',
  cBolsaAguaEnt: 'Las cantidades entregadas se registran con la entrega, no editando el pedido.',
  cBolsaHieloEnt: 'Las cantidades entregadas se registran con la entrega, no editando el pedido.',
}

const MOTIVO_DESCONOCIDO = 'Campo desconocido: no se aplicó ningún cambio.'

export interface ClasificacionPut {
  /** Claves PROCESADAS presentes (valor distinto de `undefined`). */
  solicitados: string[]
  /** Claves a rechazar con su motivo. Vacío ⇒ la petición es aceptable. */
  rechazados: Record<string, string[]>
}

/** Clasifica las claves de un body de PUT. `undefined` equivale a ausente. */
export function clasificarCamposPut(body: unknown): ClasificacionPut {
  const solicitados: string[] = []
  const rechazados: Record<string, string[]> = {}
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { solicitados, rechazados }

  const procesados = new Set<string>(PUT_CAMPOS_PROCESADOS)
  const metadata = new Set<string>(PUT_CAMPOS_METADATA)
  for (const [clave, valor] of Object.entries(body as Record<string, unknown>)) {
    if (valor === undefined) continue
    if (procesados.has(clave)) solicitados.push(clave)
    else if (metadata.has(clave)) continue
    else rechazados[clave] = [PUT_CAMPOS_RECHAZADOS[clave] ?? MOTIVO_DESCONOCIDO]
  }
  return { solicitados, rechazados }
}
