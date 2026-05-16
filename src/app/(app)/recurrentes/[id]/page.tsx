import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { EditarRecurrenteClient } from './editar-client'

export default async function EditarRecurrentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const plantilla = await prisma.plantillaRecurrente.findUnique({
    where: { id },
    include: {
      cliente: { select: { id: true, nombre: true, telefono: true, barrio: true, direccion: true } },
    },
  })

  if (!plantilla) notFound()

  const serialized = JSON.parse(JSON.stringify(plantilla))
  serialized.productos = plantilla.productos ? JSON.parse(plantilla.productos) : {}

  return <EditarRecurrenteClient plantilla={serialized} />
}
