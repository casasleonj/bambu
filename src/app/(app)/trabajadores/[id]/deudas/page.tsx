import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import TrabajadorDetailClient from '../trabajador-detail-client'

export default async function DeudasPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const trabajador = await prisma.trabajador.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          embarques: true,
          nominas: true,
          deudas: true,
        },
      },
    },
  })

  if (!trabajador) notFound()

  const serialized = JSON.parse(JSON.stringify(trabajador))

  return <TrabajadorDetailClient trabajador={serialized} />
}
