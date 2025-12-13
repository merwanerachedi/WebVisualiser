"use client"

import { useEffect, useRef } from "react"

export function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let width = window.innerWidth
    let height = window.innerHeight

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width
      canvas.height = height
    }
    window.addEventListener("resize", resize)
    resize()

    // Configuration des étoiles
    const stars = Array.from({ length: 200 }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 2,
      speed: Math.random() * 0.5 + 0.1,
      opacity: Math.random(),
    }))

    // Suivi de la souris pour l'effet parallaxe
    let mouseX = 0
    let mouseY = 0
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX - width / 2) * 0.05
      mouseY = (e.clientY - height / 2) * 0.05
    }
    window.addEventListener("mousemove", handleMouseMove)

    // Boucle d'animation
    let animationFrameId: number
    const animate = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = "rgba(10, 10, 10, 1)"
      ctx.fillRect(0, 0, width, height)

      stars.forEach((star) => {
        star.y -= star.speed
        if (star.y < 0) {
          star.y = height
          star.x = Math.random() * width
        }

        const parallaxX = mouseX * star.size
        const parallaxY = mouseY * star.size

        ctx.beginPath()
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`
        ctx.arc(star.x + parallaxX, star.y + parallaxY, star.size, 0, Math.PI * 2)
        ctx.fill()
      })

      animationFrameId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", handleMouseMove)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />
}
