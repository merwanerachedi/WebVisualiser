"use client"

import { useEffect, useRef } from "react"

interface Node {
  id: string
  url: string
  title?: string
  status?: "discovered" | "crawled"
  domain?: string
  x?: number
  y?: number
  vx?: number
  vy?: number
  rotation?: number
  rotationSpeed?: number
}

interface Link {
  source: string | Node
  target: string | Node
}

interface NetworkGraphProps {
  nodes: Node[]
  links: Link[]
}

export default function NetworkGraph({ nodes, links }: NetworkGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const simulationDataRef = useRef<{
    nodes: Node[]
    links: Link[]
  }>({ nodes: [], links: [] })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)

    const simNodes: Node[] = nodes.map((node, i) => {
      const existing = simulationDataRef.current.nodes.find((n) => n.id === node.id)
      if (existing) return existing

      const angle = (i / nodes.length) * Math.PI * 2
      const radius = Math.min(canvas.width, canvas.height) * 0.3
      return {
        ...node,
        x: canvas.width / 2 + Math.cos(angle) * radius,
        y: canvas.height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.02,
      }
    })

    const simLinks: Link[] = links.map((link) => ({
      source: simNodes.find((n) => n.id === link.source) || link.source,
      target: simNodes.find((n) => n.id === link.target) || link.target,
    }))

    simulationDataRef.current = { nodes: simNodes, links: simLinks }

    const simulate = () => {
      const { nodes: simNodes, links: simLinks } = simulationDataRef.current

      simNodes.forEach((node, i) => {
        if (!node.x || !node.y) return

        const centerX = canvas.width / 2
        const centerY = canvas.height / 2
        const dx = centerX - node.x
        const dy = centerY - node.y
        node.vx = (node.vx || 0) + dx * 0.0001
        node.vy = (node.vy || 0) + dy * 0.0001

        simNodes.forEach((other, j) => {
          if (i === j || !other.x || !other.y) return
          const dx = node.x! - other.x
          const dy = node.y! - other.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = 100 / (dist * dist)
          node.vx = (node.vx || 0) + (dx / dist) * force
          node.vy = (node.vy || 0) + (dy / dist) * force
        })

        node.x += node.vx || 0
        node.y += node.vy || 0

        node.vx = (node.vx || 0) * 0.9
        node.vy = (node.vy || 0) * 0.9

        node.rotation = (node.rotation || 0) + (node.rotationSpeed || 0)
      })

      simLinks.forEach((link) => {
        const source = link.source as Node
        const target = link.target as Node
        if (!source.x || !source.y || !target.x || !target.y) return

        const dx = target.x - source.x
        const dy = target.y - source.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = (dist - 100) * 0.01

        source.vx = (source.vx || 0) + (dx / dist) * force
        source.vy = (source.vy || 0) + (dy / dist) * force
        target.vx = (target.vx || 0) - (dx / dist) * force
        target.vy = (target.vy || 0) - (dy / dist) * force
      })
    }

    const drawVortex = (x: number, y: number, size: number, rotation: number, opacity = 1) => {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rotation)

      ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.8})`
      ctx.lineWidth = 2

      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
          const radius = size * (1 - angle / (Math.PI * 2)) + i * 3
          const x = Math.cos(angle + i * (Math.PI / 1.5)) * radius
          const y = Math.sin(angle + i * (Math.PI / 1.5)) * radius
          if (angle === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.stroke()
      }

      ctx.restore()
    }

    const render = () => {
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
      gradient.addColorStop(0, "rgb(0, 0, 0)")
      gradient.addColorStop(0.5, "rgb(30, 30, 30)")
      gradient.addColorStop(1, "rgb(50, 50, 50)")
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const { nodes: simNodes, links: simLinks } = simulationDataRef.current

      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"
      ctx.lineWidth = 1.5
      simLinks.forEach((link) => {
        const source = link.source as Node
        const target = link.target as Node
        if (!source.x || !source.y || !target.x || !target.y) return

        ctx.beginPath()
        ctx.moveTo(source.x, source.y)
        ctx.lineTo(target.x, target.y)
        ctx.stroke()
      })

      simNodes.forEach((node) => {
        if (!node.x || !node.y) return

        const isCrawled = node.status === "crawled"
        const size = isCrawled ? 25 : 18

        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, size + 10)
        gradient.addColorStop(0, "rgba(255, 255, 255, 0.4)")
        gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.2)")
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)")

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(node.x, node.y, size + 10, 0, Math.PI * 2)
        ctx.fill()

        drawVortex(node.x, node.y, size, node.rotation || 0, isCrawled ? 1 : 0.7)

        ctx.fillStyle = isCrawled ? "rgb(255, 255, 255)" : "rgba(255, 255, 255, 0.8)"
        ctx.beginPath()
        ctx.arc(node.x, node.y, isCrawled ? 4 : 3, 0, Math.PI * 2)
        ctx.fill()
      })

      simulate()
      animationFrameRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener("resize", resizeCanvas)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [nodes, links])

  return <canvas ref={canvasRef} className="absolute inset-0" />
}
