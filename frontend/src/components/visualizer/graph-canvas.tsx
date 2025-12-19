"use client"

import type React from "react"
import { useEffect, useState, useMemo } from "react"
import dynamic from "next/dynamic"
import type { Node, Link } from "./types"

// Node enrichi avec les coordonnées D3 (x, y)
interface GraphNode extends Node {
  x: number
  y: number
}

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => <div className="text-white text-center pt-20">Loading Graph Engine...</div>,
})

interface GraphCanvasProps {
  nodes: Node[]
  links: Link[]
  searchScores: Record<string, number>
  seedUrl: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fgRef: React.MutableRefObject<any>
  onNodeHover: (node: Node | null) => void
  hoverNode: Node | null
  highlightNodes: Set<string>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  highlightLinks: Set<any>
}

const normalizeUrl = (url: string | undefined) => {
  if (!url) return ""
  return url.endsWith("/") ? url.slice(0, -1) : url
}

export function GraphCanvas({
  nodes,
  links,
  searchScores,
  seedUrl,
  fgRef,
  onNodeHover,
  hoverNode,
  highlightNodes,
  highlightLinks,
}: GraphCanvasProps) {
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  useEffect(() => {
    setDimensions({ width: window.innerWidth, height: window.innerHeight })
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const graphData = useMemo(() => ({ nodes, links }), [nodes, links])

  return (
    <div className="absolute inset-0 z-10">
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        onNodeHover={onNodeHover}
        onNodeClick={(node) => window.open(String(node.id), "_blank")}
        cooldownTicks={100}
        d3VelocityDecay={0.3}
        d3AlphaDecay={0.02}
        linkColor={(link) =>
          hoverNode && !highlightLinks.has(link) ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.2)"
        }
        linkWidth={(link) => (highlightLinks.has(link) ? 2 : 1)}
        linkDirectionalParticles={hoverNode ? 0 : 2}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleSpeed={0.005}
        // CORRECTION 2 : Typage des arguments node, ctx et globalScale
        nodeCanvasObject={(node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
          // On vérifie que x et y existent bien (sécurité TypeScript + Runtime)
          if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return

          const isSearchActive = Object.keys(searchScores).length > 0
          const isDimmed = hoverNode && !highlightNodes.has(node.id)
          const globalAlpha = isDimmed ? 0.1 : 1

          ctx.save()
          ctx.globalAlpha = globalAlpha

          const r = 4
          const fontSize = 12 / globalScale
          const isCrawled = node.status === "crawled"
          const score = searchScores[node.id]

          let fillStyle: string

          if (isSearchActive) {
            fillStyle = "rgba(255, 255, 255, 0.2)"
            if (score !== undefined) {
              if (score > 0.75) fillStyle = "#166534"
              else if (score > 0.45) fillStyle = "#dc2626"
            }
          } else {
            fillStyle = isCrawled ? "#4ade80" : "#94a3b8"
          }

          try {
            const glowSize = 12
            const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowSize)

            if (isSearchActive) {
              if (score !== undefined && score > 0.75) {
                gradient.addColorStop(0, "rgba(22, 101, 52, 0.8)")
              } else if (score !== undefined && score > 0.45) {
                gradient.addColorStop(0, "rgba(220, 38, 38, 0.8)")
              } else {
                gradient.addColorStop(0, "rgba(100, 100, 100, 0.1)")
              }
            } else {
              gradient.addColorStop(0, isCrawled ? "rgba(74, 222, 128, 0.6)" : "rgba(148, 163, 184, 0.4)")
            }

            gradient.addColorStop(1, "rgba(0, 0, 0, 0)")

            ctx.beginPath()
            ctx.fillStyle = gradient
            ctx.arc(node.x, node.y, glowSize, 0, 2 * Math.PI)
            ctx.fill()

            ctx.beginPath()
            ctx.fillStyle = fillStyle
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
            ctx.fill()

            const isRelevantResult = isSearchActive && score !== undefined && score > 0.45

            if (node.id === normalizeUrl(seedUrl) || node === hoverNode || isRelevantResult) {
              const label = node.title
                ? node.title.length > 30
                  ? node.title.substring(0, 30) + "..."
                  : node.title
                : node.id

              ctx.font = `${fontSize}px Sans-Serif`
              ctx.textAlign = "center"
              ctx.textBaseline = "middle"

              const textWidth = ctx.measureText(label).width

              ctx.fillStyle = "rgba(0,0,0,0.8)"
              ctx.fillRect(node.x - textWidth / 2 - 2, node.y + glowSize - 6, textWidth + 4, fontSize + 4)

              ctx.fillStyle = "rgba(255, 255, 255, 1)"
              ctx.fillText(label, node.x, node.y + glowSize + 2)
            }
          } catch (_e) { }

          ctx.restore()
        }}
        nodeLabel=""
        backgroundColor="rgba(0,0,0,0)"
      />

      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="text-center">
            <p className="text-lg text-white/70">Enter a URL to visualize the web</p>
          </div>
        </div>
      )}
    </div>
  )
}