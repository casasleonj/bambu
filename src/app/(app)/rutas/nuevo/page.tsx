import RutaForm from '@/components/ruta-form'

export default function NuevaRutaPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nueva Ruta</h1>
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <RutaForm />
      </div>
    </div>
  )
}
