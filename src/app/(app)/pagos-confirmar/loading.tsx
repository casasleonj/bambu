export default function Loading() {
  return (
    <div className="p-4 space-y-4">
      <div className="h-6 w-52 bg-gray-200 rounded animate-pulse" />
      <div className="border rounded divide-y">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 bg-gray-50 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
