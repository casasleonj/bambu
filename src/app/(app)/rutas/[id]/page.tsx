import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import RutaForm from '@/components/ruta-form'
import { RutaResumen } from './ruta-resumen'

export default async function EditarRutaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const ruta = await prisma.ruta.findUnique({
    where: { id },
  })

  if (!ruta) {
    notFound()
  }

  const initialData = {
    nombre: ruta.nombre,
    dias: ruta.dias || '',
    repartidorId: ruta.repartidorId || '',
    repartidorRespaldoId: ruta.repartidorRespaldoId || '',
    horarioInicio: ruta.horarioInicio || '06:00',
    horarioFin: ruta.horarioFin || '14:00',
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Editar ruta habitual</h1>
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <RutaForm initialData={initialData} rutaId={ruta.id} />
      </div>
      <RutaResumen rutaId={ruta.id} repartidorId={ruta.repartidorId} />
    </div>
  )
}
