"use client";

import Image from "next/image";

interface PolycopyLogoProps {
  className?: string;
  size?: "default" | "large";
  variant?: "dark" | "light";
}

export function PolycopyLogo({ className = "", size = "default", variant = "dark" }: PolycopyLogoProps) {
  const isLarge = size === "large";
  const height = isLarge ? 48 : 36;
  
  // Use the official white logo image for dark backgrounds
  if (variant === "light") {
    return (
      <div className={className}>
        <Image
          src="/logos/polycopy-logo-white.png"
          alt="Polycopy"
          width={isLarge ? 200 : 150}
          height={height}
          className="h-auto"
          style={{ height: isLarge ? 48 : 36, width: 'auto' }}
          priority
        />
      </div>
    );
  }
  
  // SVG version for light backgrounds
  const iconSize = isLarge ? 56 : 40;
  const textClass = isLarge ? "text-3xl md:text-4xl" : "text-2xl";
  const gapClass = isLarge ? "gap-3" : "gap-2";
  
  return (
    <div className={`flex items-center ${gapClass} ${className}`}>
      {/* Polycopy Icon - Two overlapping rounded squares */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Back square - lighter yellow */}
        <rect
          x="8"
          y="4"
          width="24"
          height="24"
          rx="6"
          fill="#FDCF72"
        />
        {/* Front square - main yellow */}
        <rect
          x="4"
          y="12"
          width="24"
          height="24"
          rx="6"
          fill="#FDB022"
        />
      </svg>
      {/* Text */}
      <span className={`${textClass} font-bold text-polycopy-black`}>Polycopy</span>
    </div>
  );
}
