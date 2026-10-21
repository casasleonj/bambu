import { redirect } from 'next/navigation'

/**
 * `/pedidos/<id>` (P1-1 PR A, #377): el peek, el menú de comandos y enlaces
 * externos apuntan acá. El detalle vive en la lista de `/pedidos` (ventana
 * sobre la lista), así que esta ruta solo redirige a `?openPedido=<id>`, que
 * `PedidosClient` resuelve por id aunque el pedido no esté en la lista cargada.
 * La autenticación y los roles ya los aplica el proxy a todas las páginas.
 */
export default async function PedidoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/pedidos?openPedido=${encodeURIComponent(id)}`)
}
