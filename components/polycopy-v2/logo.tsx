"use client"

import Link from "next/link"
import Image from "next/image"
import { cn } from "@/lib/utils"

interface LogoProps {
  variant?: "icon" | "horizontal" | "poster"
  size?: "xs" | "sm" | "md" | "lg"
  className?: string
  href?: string
}

const SIZE_MAP = {
  xs: { icon: 24, horizontal: 32, poster: 100 },
  sm: { icon: 32, horizontal: 36, poster: 120 },
  md: { icon: 40, horizontal: 44, poster: 160 },
  lg: { icon: 48, horizontal: 52, poster: 200 },
}

export function Logo({
  variant = "horizontal",
  size = "md",
  className,
  href,
}: LogoProps) {
  const height = SIZE_MAP[size][variant]
  
  // Map variant to expected file names
  const fileMap = {
    icon: "/logos/polycopy_icon_mark.svg",
    horizontal: "/logos/polycopy_logo_poster.png",
    poster: "/logos/polycopy_logo_poster.png",
  }

  const logoSrc = fileMap[variant]

  // For the poster-style image used in nav, compute width from aspect ratio (~1.5:1)
  const aspectRatio = variant === "icon" ? 1 : 1.5
  const width = Math.round(height * aspectRatio)

  const logo = (
    <Image
      src={logoSrc}
      alt="Polycopy"
      width={width}
      height={height}
      className={cn("h-auto object-contain", className)}
      priority
    />
  )

  // Only wrap in Link if href is explicitly provided
  if (href) {
    return (
      <Link href={href} className="inline-flex">
        {logo}
      </Link>
    )
  }

  return <span className="inline-flex">{logo}</span>
}
