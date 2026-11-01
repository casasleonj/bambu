import { prisma } from '@/lib/prisma'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import TrabajadorDetailClient from './trabajador-detail-client'

export default async function TrabajadorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // #566: el ASISTENTE ve la lista de trabajadores (con su deuda), no la ficha completa
  // (nómina, deudas con acciones) que sigue siendo de ADMIN y CONTADOR.
  const session = await auth()
  if ((session?.user as { role?: string } | undefined)?.role === 'ASISTENTE') redirect('/trabajadores')

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
