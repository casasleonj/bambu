// Habilita partial prefetching de /cartera en Next 16 (CLAUDE.md Known Issue #15).
export default function Loading() {
  return (
    <div className="p-4 space-y-4">
      <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
      <div className="h-9 w-full max-w-md bg-gray-100 rounded animate-pulse" />
      <div className="border rounded divide-y">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-11 bg-gray-50 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
