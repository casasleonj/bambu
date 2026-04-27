export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Estás offline</h1>
        <p className="text-gray-600">
          No hay conexión a internet. Los cambios se sincronizarán cuando reconectes.
        </p>
      </div>
    </div>
  )
}