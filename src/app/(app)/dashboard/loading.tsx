export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="h-7 bg-gray-200 rounded w-32 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-48"></div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-6 bg-gray-200 rounded w-16"></div>
          <div className="h-6 bg-gray-200 rounded w-20"></div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-5 h-28">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-3 bg-gray-200 rounded w-1/4 mt-2"></div>
          </div>
        ))}
      </div>

      {/* Alertas */}
      <div>
        <div className="h-5 bg-gray-200 rounded w-40 mb-3"></div>
        <div className="bg-white rounded-xl p-5 h-16"></div>
      </div>

      {/* Casos */}
      <div>
        <div className="h-5 bg-gray-200 rounded w-32 mb-3"></div>
        <div className="bg-white rounded-xl p-5 h-16"></div>
      </div>

      {/* Tabla ventas por precio */}
      <div className="bg-white rounded-xl p-5 h-56">
        <div className="h-5 bg-gray-200 rounded w-40 mb-4"></div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-4 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>

      {/* Franjas horarias */}
      <div className="bg-white rounded-xl p-5 h-48">
        <div className="h-5 bg-gray-200 rounded w-48 mb-4"></div>
        <div className="h-28 bg-gray-200 rounded"></div>
      </div>

      {/* Acciones rápidas */}
      <div className="bg-white rounded-xl p-5 h-24">
        <div className="h-5 bg-gray-200 rounded w-32 mb-4"></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>

      {/* Inventario, Caja, Cartera */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-5 h-56">
          <div className="h-5 bg-gray-200 rounded w-24 mb-4"></div>
          <div className="h-28 bg-gray-200 rounded"></div>
        </div>
        <div className="bg-white rounded-xl p-5 h-56">
          <div className="h-5 bg-gray-200 rounded w-32 mb-4"></div>
          <div className="h-28 bg-gray-200 rounded"></div>
        </div>
        <div className="bg-white rounded-xl p-5 h-56">
          <div className="h-5 bg-gray-200 rounded w-20 mb-4"></div>
          <div className="h-28 bg-gray-200 rounded"></div>
        </div>
      </div>
    </div>
  )
}
