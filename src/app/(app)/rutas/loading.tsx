export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
      <div className="h-8 w-32 bg-gray-200 rounded" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-lg border" />
        ))}
      </div>
      <div className="h-24 bg-gray-100 rounded-lg border" />
      <div className="h-24 bg-gray-100 rounded-lg border" />
    </div>
  )
}
