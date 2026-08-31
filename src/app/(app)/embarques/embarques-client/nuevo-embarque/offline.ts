import { offlineDb } from '@/lib/db/offline'

/**
 * Encola la operación compuesta "crear embarque + asignar pedidos" para cuando
 * vuelva la red.
 *
 * `requestQueue` hace replay HTTP crudo (una request por item), así que no
 * puede encadenar POST→PUT por sí solo. Se guarda un item especial
 * (`localEndpoint: 'embarque-con-pedidos'`) que `syncWithServer()` reconoce y
 * procesa en dos pasos, reportando los pedidos que otro asistente ya tomó.
 *
 * Una sola cola (regla del plan §16). El `offlineId` es el mismo que el POST
 * online habría usado → el server deduplica si el POST se llega a repetir.
 */
export async function encolarEmbarqueConPedidos(
  body: Record<string, unknown>,
  pedidoIds: string[],
  offlineId: string,
): Promise<void> {
  await offlineDb.requestQueue.add({
    url: '/api/embarques',
    method: 'POST',
    body: JSON.stringify(body),
    offlineId,
    localEndpoint: 'embarque-con-pedidos',
    createdAt: new Date(),
    pedidoIds,
  })
}
