import { redirect } from 'next/navigation'
import { vueltaAPedidos } from '@/lib/pedidos-contexto'

/**
 * `/pedidos/<id>` (P1-1 PR A, #377): el peek, el menú de comandos y enlaces
 * externos apuntan acá. El detalle vive en la lista de `/pedidos` (ventana
 * sobre la lista), así que esta ruta solo redirige a `?openPedido=<id>`, que
 * `PedidosClient` resuelve por id aunque el pedido no esté en la lista cargada.
 * La autenticación y los roles ya los aplica el proxy a todas las páginas.
 */
export default async function PedidoDetallePage({ params,searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{volver?:string|string[]}> }) {
  const { id } = await params
  const volver=vueltaAPedidos((await searchParams)?.volver??null)
  if(volver){
    const url=new URL(volver,'https://contexto.invalid')
    url.searchParams.set('openPedido',id)
    redirect(`${url.pathname}${url.search}`)
    return
  }
  redirect(`/pedidos?openPedido=${encodeURIComponent(id)}`)
}
