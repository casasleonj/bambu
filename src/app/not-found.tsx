import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] bg-gray-100 flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-blue-600">404</h1>
        <p className="mt-4 text-xl text-gray-600">Página no encontrada</p>
        <p className="mt-2 text-gray-500">La página que buscas no existe o fue movida.</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
        >
          Volver al Dashboard
        </Link>
      </div>
    </div>
  )
}
