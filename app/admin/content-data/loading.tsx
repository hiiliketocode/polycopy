export default function ContentDataLoading() {
  return (
    <div className="min-h-screen bg-[#111827] text-white p-4 md:p-8">
      {/* Header Skeleton */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="h-8 w-96 bg-[#374151] rounded animate-pulse mb-2"></div>
            <div className="h-4 w-48 bg-[#374151] rounded animate-pulse"></div>
          </div>
          
          <div className="flex gap-3">
            <div className="h-10 w-32 bg-[#374151] rounded-lg animate-pulse"></div>
            <div className="h-10 w-36 bg-[#FDB022]/50 rounded-lg animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* Content Skeleton */}
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Section A Header */}
        <div className="bg-[#FDB022]/50 p-4 rounded-t-lg -mb-4 animate-pulse">
          <div className="h-7 w-80 bg-[#FDB022]/70 rounded"></div>
          <div className="h-4 w-64 bg-[#FDB022]/50 rounded mt-2"></div>
        </div>
        
        <div className="space-y-6 border-2 border-[#FDB022]/30 rounded-b-lg p-4 md:p-6">
          <SkeletonSection />
          <SkeletonSection />
          <SkeletonSection lines={6} />
          <SkeletonSection />
        </div>

        {/* Section B Header */}
        <div className="bg-[#3b82f6]/50 p-4 rounded-t-lg -mb-4 mt-12 animate-pulse">
          <div className="h-7 w-80 bg-[#3b82f6]/70 rounded"></div>
          <div className="h-4 w-64 bg-[#3b82f6]/50 rounded mt-2"></div>
        </div>
        
        <div className="space-y-6 border-2 border-[#3b82f6]/30 rounded-b-lg p-4 md:p-6">
          <SkeletonSection />
          <SkeletonSection lines={5} />
          <SkeletonSection />
          <SkeletonSection />
          <SkeletonSection lines={8} />
        </div>

      </div>
    </div>
  )
}

function SkeletonSection({ lines = 10 }: { lines?: number }) {
  return (
    <div className="border border-[#374151] rounded-lg p-4 md:p-6">
      <div className="h-6 w-64 bg-[#FDB022]/30 rounded mb-4 animate-pulse"></div>
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div 
            key={i} 
            className="h-4 bg-[#374151] rounded animate-pulse"
            style={{ width: `${Math.random() * 40 + 60}%` }}
          ></div>
        ))}
      </div>
    </div>
  )
}

