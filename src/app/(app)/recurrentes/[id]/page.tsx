import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { EditarRecurrenteClient, type PlantillaSerialized } from './editar-client'
import { vueltaAHabituales } from '@/lib/pedidos-contexto'

export default async function EditarRecurrentePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string,string | string[] | undefined>> }) {
  const { id } = await params

  const plantilla = await prisma.plantillaRecurrente.findUnique({
    where: { id },
    include: {
      cliente: { select: { id: true, nombre: true, telefono: true, barrio: true, direccion: true, linkUbicacion: true } },
      negocio: { include: { cliente: { select: { id: true, nombre: true, telefono: true, barrio: true, direccion: true, linkUbicacion: true } } } },
      productos: true,
    },
  })

  if (!plantilla) notFound()

  // Hidratar productos al shape legacy para la UI
  const serialized = JSON.parse(JSON.stringify(plantilla)) as PlantillaSerialized
  serialized.productos = plantilla.productos
    ? Object.fromEntries(plantilla.productos.map(p => [p.producto, p.cantidad]))
    : {}

  const query = searchParams ? await searchParams : {}
  return <EditarRecurrenteClient plantilla={serialized} volverHref={vueltaAHabituales(query.volverHabituales) ?? '/recurrentes'} />
}
