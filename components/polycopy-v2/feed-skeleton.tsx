"use client"

export function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="card-technical animate-pulse">
          {/* Header skeleton */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-gray-200" />
              <div>
                <div className="mb-2 h-4 w-24 bg-gray-200" />
                <div className="h-3 w-16 bg-gray-200" />
              </div>
            </div>
            <div className="h-6 w-16 bg-gray-200" />
          </div>

          {/* Market title skeleton */}
          <div className="mb-4 h-6 w-3/4 bg-gray-200" />

          {/* Stats grid skeleton */}
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="h-16 bg-gray-100" />
            <div className="h-16 bg-gray-100" />
            <div className="h-16 bg-gray-100" />
          </div>

          {/* Button skeleton */}
          <div className="h-11 w-full bg-gray-200" />
        </div>
      ))}
    </div>
  )
}
