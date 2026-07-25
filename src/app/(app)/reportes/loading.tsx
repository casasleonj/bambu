export default function ReportesLoading() {
  return (
    <div className="p-4 space-y-4 animate-pulse">
      {/* Header */}
      <div>
        <div className="h-7 bg-gray-200 rounded w-32 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-64"></div>
      </div>

      {/* Date filters */}
      <div className="flex gap-3">
        <div className="h-10 bg-gray-200 rounded w-40"></div>
        <div className="h-10 bg-gray-200 rounded w-40"></div>
        <div className="h-10 bg-gray-200 rounded w-24"></div>
      </div>

      {/* Stat cards */}
      <div className="bg-white rounded-xl p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="text-center">
              <div className="h-8 bg-gray-200 rounded w-24 mx-auto mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-20 mx-auto"></div>
            </div>
          ))}
        </div>
      </div>

      {/* Balance + cards */}
      <div className="bg-white rounded-xl p-6 h-64"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-6 h-40"></div>
        <div className="bg-white rounded-xl p-6 h-40"></div>
      </div>
    </div>
  )
}
