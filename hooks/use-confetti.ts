"use client"

import React from "react"

import { useCallback } from "react"

interface ConfettiParticle {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  size: number
  rotation: number
  rotationSpeed: number
}

export function useConfetti() {
  const triggerConfetti = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget
    const rect = button.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    // Create confetti container
    const container = document.createElement("div")
    container.style.position = "fixed"
    container.style.top = "0"
    container.style.left = "0"
    container.style.width = "100%"
    container.style.height = "100%"
    container.style.pointerEvents = "none"
    container.style.zIndex = "9999"
    document.body.appendChild(container)

    const colors = ["#FDB022", "#22C55E", "#3B82F6", "#F97316", "#8B5CF6", "#EC4899"]
    const particles: ConfettiParticle[] = []

    // Create particles
    for (let i = 0; i < 50; i++) {
      const angle = (Math.random() * Math.PI * 2)
      const velocity = 8 + Math.random() * 8
      particles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 6 + Math.random() * 6,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 20
      })
    }

    // Create particle elements
    const elements = particles.map((p) => {
      const el = document.createElement("div")
      el.style.position = "fixed"
      el.style.width = `${p.size}px`
      el.style.height = `${p.size}px`
      el.style.backgroundColor = p.color
      el.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px"
      el.style.left = `${p.x}px`
      el.style.top = `${p.y}px`
      container.appendChild(el)
      return el
    })

    let frame = 0
    const maxFrames = 60

    function animate() {
      frame++
      if (frame > maxFrames) {
        container.remove()
        return
      }

      particles.forEach((p, i) => {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.5 // gravity
        p.vx *= 0.98 // friction
        p.rotation += p.rotationSpeed

        const el = elements[i]
        const opacity = 1 - (frame / maxFrames)
        el.style.left = `${p.x}px`
        el.style.top = `${p.y}px`
        el.style.opacity = `${opacity}`
        el.style.transform = `rotate(${p.rotation}deg)`
      })

      requestAnimationFrame(animate)
    }

    animate()
  }, [])

  return { triggerConfetti }
}
