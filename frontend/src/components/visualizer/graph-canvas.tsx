"use client"

import type React from "react"
import { useEffect, useState, useMemo, useCallback } from "react"
import dynamic from "next/dynamic"
import type { Node, Link } from "./types"

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
  onNodeClick: (node: Node, screenX: number, screenY: number) => void
  hoverNode: Node | null
  highlightNodes: Set<string>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  highlightLinks: Set<any>
  clickedNode: Node | null
  similarNodes?: Set<string>
  hoveredSimilarUrl?: string | null
  // Analytics Mode
  analyticsMode?: boolean
  pageRankScores?: Record<string, number>
  maxPageRank?: number
  importanceFilter?: number // 0-100
}

const normalizeUrl = (url: string | undefined) => {
  if (!url) return ""
  return url.endsWith("/") ? url.slice(0, -1) : url
}

// Heatmap color function: low score = cyan, high score = red
const getHeatmapColor = (score: number, maxScore: number): string => {
  if (maxScore === 0) return "#06b6d4" // cyan default
  const normalized = score / maxScore // 0 to 1
  // Cyan (cool) -> Purple -> Pink -> Red (hot) - neon/cyberpunk theme
  if (normalized < 0.25) return "#06b6d4" // cyan-500 - lowest rank
  if (normalized < 0.5) return "#8b5cf6" // violet-500 - low-medium rank
  if (normalized < 0.75) return "#ec4899" // pink-500 - medium-high rank
  return "#ef4444" // red-500 - highest rank
}

export function GraphCanvas({
  nodes,
  links,
  searchScores,
  seedUrl,
  fgRef,
  onNodeHover,
  onNodeClick,
  hoverNode,
  highlightNodes,
  highlightLinks,
  clickedNode,
  similarNodes = new Set(),
  hoveredSimilarUrl = null,
  analyticsMode = false,
  pageRankScores = {},
  maxPageRank = 0,
  importanceFilter = 0,
}: GraphCanvasProps) {
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  useEffect(() => {
    setDimensions({ width: window.innerWidth, height: window.innerHeight })
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const graphData = useMemo(() => ({ nodes, links }), [nodes, links])

  const handleNodeClick = (node: GraphNode, event: MouseEvent) => {
    if (fgRef.current && node.x !== undefined && node.y !== undefined) {
      onNodeClick(node as Node, event.clientX, event.clientY)
    }
  }

  // Helper: Check if a node passes the importance filter
  const nodePassesFilter = useCallback(
    (nodeUrl: string) => {
      if (!analyticsMode) return true
      const normalizedUrl = normalizeUrl(nodeUrl)
      const score = pageRankScores[normalizedUrl] || 0
      const normalizedScore = maxPageRank > 0 ? (score / maxPageRank) * 100 : 0
      return normalizedScore >= importanceFilter
    },
    [analyticsMode, pageRankScores, maxPageRank, importanceFilter],
  )

  return (
    <div className="absolute inset-0 z-10">
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        onNodeHover={onNodeHover}
        onNodeClick={handleNodeClick}
        cooldownTicks={100}
        d3VelocityDecay={0.3}
        d3AlphaDecay={0.02}
        linkVisibility={(link) => {
          // In analytics mode, hide links if either endpoint is filtered out
          if (!analyticsMode) return true
          const sourceUrl = typeof link.source === "object" ? (link.source as Node).url : String(link.source)
          const targetUrl = typeof link.target === "object" ? (link.target as Node).url : String(link.target)
          return nodePassesFilter(sourceUrl) && nodePassesFilter(targetUrl)
        }}
        linkColor={(link) =>
          (hoverNode && !highlightLinks.has(link)) || similarNodes.size > 0 || clickedNode
            ? "rgba(255, 255, 255, 0.05)"
            : "rgba(255, 255, 255, 0.2)"
        }
        linkWidth={(link) => (highlightLinks.has(link) ? 2 : 1)}
        linkDirectionalParticles={hoverNode || similarNodes.size > 0 || clickedNode ? 0 : 2}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleSpeed={0.005}
        nodeCanvasObject={(node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
          if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return

          const isSearchActive = Object.keys(searchScores).length > 0
          const isSimilarModeActive = similarNodes.size > 0
          const isSimilarNode = similarNodes.has(node.id)
          const isHoveredSimilarNode = hoveredSimilarUrl && node.id === hoveredSimilarUrl

          // Analytics mode: check if node passes importance threshold
          // Use node.url (not node.id) since API returns URLs
          const normalizedNodeUrl = normalizeUrl(node.url)
          const nodePageRank = pageRankScores[normalizedNodeUrl] || 0
          const normalizedScore = maxPageRank > 0 ? (nodePageRank / maxPageRank) * 100 : 0
          const passesImportanceFilter = normalizedScore >= importanceFilter

          // In analytics mode, hide nodes below threshold
          if (analyticsMode && !passesImportanceFilter) {
            return // Don't render this node
          }

          // Determine if node should be dimmed
          let isDimmed = false
          if (analyticsMode) {
            // In analytics mode, no dimming - use heatmap colors instead
            isDimmed = false
          } else if (hoveredSimilarUrl) {
            // When hovering a result item, only highlight that specific node
            isDimmed = node.id !== hoveredSimilarUrl
          } else if (isSimilarModeActive) {
            isDimmed = !isSimilarNode
          } else if (clickedNode) {
            isDimmed = node.id !== clickedNode.id
          } else if (hoverNode) {
            isDimmed = !highlightNodes.has(node.id)
          }

          const globalAlpha = isDimmed ? 0.1 : 1

          ctx.save()
          ctx.globalAlpha = globalAlpha

          const r = 4
          const fontSize = 12 / globalScale
          const isCrawled = node.status === "crawled"
          const score = searchScores[node.id]

          let fillStyle: string

          if (analyticsMode) {
            // Heatmap coloring based on PageRank score
            fillStyle = getHeatmapColor(nodePageRank, maxPageRank)
          } else if (isSimilarModeActive && isSimilarNode) {
            // Similar pages get cyan color
            fillStyle = "#06b6d4" // cyan-500
          } else if (isSearchActive) {
            fillStyle = "rgba(255, 255, 255, 0.2)"
            if (score !== undefined) {
              if (score > 0.75)
                fillStyle = "#8b5cf6" // violet-500 for high relevance
              else if (score > 0.45) fillStyle = "#ec4899" // pink-500 for medium relevance
            }
          } else {
            fillStyle = isCrawled ? "#8b5cf6" : "#94a3b8" // violet-500 for crawled, slate-400 for pending
          }

          try {
            const glowSize = 12
            const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowSize)

            // Match glow to PageRank color
            if (analyticsMode) {
              const color = getHeatmapColor(nodePageRank, maxPageRank)
              if (color === "#06b6d4") {
                gradient.addColorStop(0, "rgba(6, 182, 212, 0.9)") // cyan glow
              } else if (color === "#8b5cf6") {
                gradient.addColorStop(0, "rgba(139, 92, 246, 0.9)") // purple glow
              } else if (color === "#ec4899") {
                gradient.addColorStop(0, "rgba(236, 72, 153, 0.9)") // pink glow
              } else {
                gradient.addColorStop(0, "rgba(239, 68, 68, 0.9)") // red glow
              }
            } else if (isSimilarModeActive && isSimilarNode) {
              // Cyan glow for similar pages
              gradient.addColorStop(0, "rgba(6, 182, 212, 0.9)") // cyan glow
            } else if (isSearchActive) {
              if (score !== undefined && score > 0.75) {
                gradient.addColorStop(0, "rgba(139, 92, 246, 0.9)") // violet glow
              } else if (score !== undefined && score > 0.45) {
                gradient.addColorStop(0, "rgba(236, 72, 153, 0.8)") // pink glow
              } else {
                gradient.addColorStop(0, "rgba(100, 100, 100, 0.1)")
              }
            } else {
              gradient.addColorStop(0, isCrawled ? "rgba(139, 92, 246, 0.8)" : "rgba(148, 163, 184, 0.5)")
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
