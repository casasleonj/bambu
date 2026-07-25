export default function PedidosLoading() {
  return (
    <div className="p-4 space-y-4 animate-pulse">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="h-7 bg-gray-200 rounded w-40 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-56"></div>
        </div>
        <div className="h-10 bg-gray-200 rounded w-32"></div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <div className="h-9 bg-gray-200 rounded w-24"></div>
        <div className="h-9 bg-gray-200 rounded w-24"></div>
        <div className="h-9 bg-gray-200 rounded w-24"></div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-10 bg-gray-200 rounded w-48"></div>
        <div className="h-10 bg-gray-200 rounded w-40"></div>
        <div className="h-10 bg-gray-200 rounded w-32"></div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="grid grid-cols-12 gap-4 p-4 border-b bg-gray-50">
          <div className="col-span-2 h-4 bg-gray-200 rounded"></div>
          <div className="col-span-3 h-4 bg-gray-200 rounded"></div>
          <div className="col-span-2 h-4 bg-gray-200 rounded"></div>
          <div className="col-span-2 h-4 bg-gray-200 rounded"></div>
          <div className="col-span-2 h-4 bg-gray-200 rounded"></div>
          <div className="col-span-1 h-4 bg-gray-200 rounded"></div>
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="grid grid-cols-12 gap-4 p-4 border-b last:border-0">
            <div className="col-span-2 h-4 bg-gray-200 rounded"></div>
            <div className="col-span-3 h-4 bg-gray-200 rounded"></div>
            <div className="col-span-2 h-4 bg-gray-200 rounded"></div>
            <div className="col-span-2 h-4 bg-gray-200 rounded"></div>
            <div className="col-span-2 h-4 bg-gray-200 rounded"></div>
            <div className="col-span-1 h-4 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    </div>
  )
}
