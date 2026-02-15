"use client"

import { cn } from "@/lib/utils"

const categories = [
  { value: "all", label: "ALL" },
  { value: "sports", label: "SPORTS" },
  { value: "politics", label: "POLITICS" },
  { value: "crypto", label: "CRYPTO" },
  { value: "culture", label: "CULTURE" },
]

interface FilterBarProps {
  activeCategory: string
  onCategoryChange: (category: string) => void
  className?: string
}

export function FilterBar({
  activeCategory,
  onCategoryChange,
  className,
}: FilterBarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 overflow-x-auto px-4 py-2.5 scrollbar-hide",
        className,
      )}
      role="tablist"
      aria-label="Filter trades by category"
    >
      {categories.map((cat) => {
        const isActive = activeCategory === cat.value
        return (
          <button
            key={cat.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onCategoryChange(cat.value)}
            className={cn(
              "shrink-0 px-3 py-1.5 font-sans text-xs font-bold uppercase tracking-wide transition-all duration-150",
              isActive
                ? "bg-poly-yellow text-poly-black"
                : "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {cat.label}
          </button>
        )
      })}
    </div>
  )
}
