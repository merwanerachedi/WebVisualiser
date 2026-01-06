"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { optionalAuthApi } from "@/lib/api"
import { Starfield } from "./visualizer/starfield"
import { CrawlControls } from "./visualizer/crawl-controls"
import { SearchPanel } from "./visualizer/search-panel"
import { SettingsPanel } from "./visualizer/settings-panel"
import { StatsPanel } from "./visualizer/stats-panel"
import { GraphCanvas } from "./visualizer/graph-canvas"
import { DraggableWindow } from "./visualizer/draggable-window"
import { NodeDetailsWindow } from "./visualizer/node-details-window"
import type { Node, Link, WebSocketMessage, CrawlConfig, SearchResult } from "./visualizer/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"

const normalizeUrl = (url: string | undefined) => {
  if (!url) return ""
  return url.endsWith("/") ? url.slice(0, -1) : url
}

export default function WebVisualizer() {
  const searchParams = useSearchParams()
  const crawlIdFromUrl = searchParams.get("crawl_id")

  const [url, setUrl] = useState("")
  const [isConnected, setIsConnected] = useState(false)
  const [isCrawling, setIsCrawling] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [rateLimitError, setRateLimitError] = useState<string | null>(null)

  const [nodes, setNodes] = useState<Node[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [searchScores, setSearchScores] = useState<Record<string, number>>({})

  // Focus Mode States
  const [hoverNode, setHoverNode] = useState<Node | null>(null)
  const [highlightNodes, setHighlightNodes] = useState(new Set<string>())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [highlightLinks, setHighlightLinks] = useState(new Set<any>())
  const [similarNodes, setSimilarNodes] = useState(new Set<string>())
  const [hoveredSimilarUrl, setHoveredSimilarUrl] = useState<string | null>(null)

  const [clickedNode, setClickedNode] = useState<Node | null>(null)

  const [showSettings, setShowSettings] = useState(false)
  const [config, setConfig] = useState<CrawlConfig>({
    max_depth: 3,
    max_pages: 100,
    crawl_mode: "INTERNAL",
    algorithm: "BFS",
  })

  const [searchQuery, setSearchQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [crawlCompleted, setCrawlCompleted] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [embeddingsReady, setEmbeddingsReady] = useState(false)

  // Analytics Mode States
  const [analyticsMode, setAnalyticsMode] = useState(false)
  const [pageRankScores, setPageRankScores] = useState<Record<string, number>>({})
  const [maxPageRank, setMaxPageRank] = useState(0)
  const [importanceFilter, setImportanceFilter] = useState(0) // 0-100%
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false)
  const [currentCrawlId, setCurrentCrawlId] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null)

  // Indexed storage for all links (for filtering crawled→crawled)
  const allLinksRef = useRef<{
    bySource: Map<string, { source: string; target: string }[]>
    byTarget: Map<string, { source: string; target: string }[]>
  }>({
    bySource: new Map(),
    byTarget: new Map(),
  })

  const [selectedNode, setSelectedNode] = useState<Node | null>(null)

  useEffect(() => {
    if (crawlIdFromUrl) {
      loadGraphFromHistory(crawlIdFromUrl)
    }
  }, [crawlIdFromUrl])

  const loadGraphFromHistory = async (crawlId: string) => {
    setIsLoadingHistory(true)
    try {
      const response = await fetch(`${API_URL}/api/crawl/${crawlId}/graph`, {
        credentials: "include",
      })
      if (response.ok) {
        const data = await response.json()

        // DEBUG: Log what we received from API
        console.log("🔍 Graph data received:", {
          nodesCount: data.nodes.length,
          edgesCount: data.edges.length,
          firstNode: data.nodes[0],
          firstEdge: data.edges[0],
        })

        // Convertir les données de l'API en format attendu
        const loadedNodes: Node[] = data.nodes.map((n: { id: string; label: string; status: number }) => ({
          id: n.id,
          url: n.id,
          title: n.label,
          status: n.status > 0 ? "crawled" : "discovered",
        }))

        const loadedLinks: Link[] = data.edges.map((e: { source: string; target: string }) => ({
          source: e.source,
          target: e.target,
        }))

        setNodes(loadedNodes)
        setLinks(loadedLinks)
        setCrawlCompleted(true)
        setCurrentCrawlId(crawlId) // Store for analytics

        try {
          const statusResponse = await fetch(`${API_URL}/api/crawl/${crawlId}/embedding-status`, {
            credentials: "include",
          })
          if (statusResponse.ok) {
            const statusData = await statusResponse.json()
            setEmbeddingsReady(statusData.embedding_status === "completed")
          }
        } catch (err) {
          setEmbeddingsReady(true)
        }

        // Zoomer sur le graphe après chargement
        setTimeout(() => {
          if (fgRef.current) {
            fgRef.current.zoomToFit(1000, 50)
          }
        }, 500)
      }
    } catch (error) {
      console.error("Failed to load graph from history:", error)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const handleNodeHover = (node: Node | null) => {
    setHoverNode(node || null)
    const newHighlightNodes = new Set<string>()
    const newHighlightLinks = new Set<Link>()

    if (node) {
      newHighlightNodes.add(node.id)
      links.forEach((link) => {
        const sourceId = typeof link.source === "object" ? (link.source as Node).id : link.source
        const targetId = typeof link.target === "object" ? (link.target as Node).id : link.target
        if (sourceId === node.id || targetId === node.id) {
          newHighlightLinks.add(link)
          newHighlightNodes.add(sourceId)
          newHighlightNodes.add(targetId)
        }
      })
    }
    setHighlightNodes(newHighlightNodes)
    setHighlightLinks(newHighlightLinks)
  }

  const handleSimilarPagesFound = useCallback(
    (pages: { url: string; title: string | null; score: number }[]) => {
      // If no pages, reset to normal state
      if (pages.length === 0) {
        setSimilarNodes(new Set())
        return
      }

      const similar = new Set<string>()
      pages.forEach((p) => {
        const normalizedUrl = normalizeUrl(p.url)
        similar.add(normalizedUrl)
      })
      // Also add the selected node itself
      if (selectedNode) {
        similar.add(normalizeUrl(selectedNode.url))
      }
      setSimilarNodes(similar)
    },
    [selectedNode],
  )

  const handleNodeClick = useCallback((node: Node, screenX: number, screenY: number) => {
    setClickedNode(node)
    setSelectedNode(node)
    setSimilarNodes(new Set()) // Clear similar nodes when clicking a new node
  }, [])

  // Analytics Mode Handler
  const handleAnalytics = useCallback(async () => {
    const activeCrawlId = currentCrawlId || crawlIdFromUrl
    if (!activeCrawlId) return

    // If already in analytics mode, toggle off
    if (analyticsMode) {
      setAnalyticsMode(false)
      setImportanceFilter(0)
      return
    }

    setIsLoadingAnalytics(true)
    try {
      const response = await fetch(`${API_URL}/api/crawl/${activeCrawlId}/pagerank`, { credentials: "include" })

      // Handle rate limit
      if (response.status === 429) {
        setRateLimitError("Calculating too fast! Please wait a moment ⏳")
        setTimeout(() => setRateLimitError(null), 4000)
        return
      }

      if (!response.ok) throw new Error("Failed to fetch PageRank")

      const data = await response.json()

      // Convert scores array to map for quick lookup
      // Keep MAX score if URL appears multiple times
      const scoresMap: Record<string, number> = {}
      data.scores.forEach((s: { url: string; score: number }) => {
        const normalizedUrl = normalizeUrl(s.url)
        if (!scoresMap[normalizedUrl] || s.score > scoresMap[normalizedUrl]) {
          scoresMap[normalizedUrl] = s.score
        }
      })

      setPageRankScores(scoresMap)
      setMaxPageRank(data.max_score)
      setAnalyticsMode(true)
    } catch (error) {
      console.error("Analytics error:", error)
    } finally {
      setIsLoadingAnalytics(false)
    }
  }, [currentCrawlId, crawlIdFromUrl, analyticsMode])

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    try {
      const response = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(searchQuery)}`)
      if (!response.ok) throw new Error("Search failed")

      const results: SearchResult[] = await response.json()

      const newScores: Record<string, number> = {}
      results.forEach((r) => {
        newScores[normalizeUrl(r.url)] = r.score
      })
      setSearchScores(newScores)

      if (results.length > 0 && fgRef.current) {
        const bestId = normalizeUrl(results[0].url)
        const node = nodes.find((n) => n.id === bestId)
        if (node && typeof node.x === "number" && typeof node.y === "number") {
          fgRef.current.centerAt(node.x, node.y, 1000)
          fgRef.current.zoom(3, 2000)
        }
      }
    } catch (error) {
      console.error("[v0] Search error:", error)
    } finally {
      setIsSearching(false)
    }
  }, [searchQuery, nodes])

  const handleStartCrawl = useCallback(async () => {
    if (!url) return
    const cleanSeedUrl = normalizeUrl(url)

    setCrawlCompleted(false)
    setEmbeddingsReady(false) // Reset embeddings status
    setSearchScores({})
    setRateLimitError(null)

    try {
      // Utiliser optionalAuthApi pour tenter un refresh silencieux du token
      // Si l'utilisateur était connecté, le crawl sera linké à son compte
      const resp = await optionalAuthApi.post("/api/crawl", { url, ...config })
      const data = resp.data
      const crawlId = data.crawl_id
      setCurrentCrawlId(crawlId) // Store for analytics

      const ws = new WebSocket(`${WS_URL}/ws/${crawlId}`)

      // Variable pour stocker l'intervalle de ping
      let pingInterval: NodeJS.Timeout | null = null

      ws.onopen = () => {
        setIsConnected(true)
        setIsCrawling(true)
        setNodes([{ id: cleanSeedUrl, url: cleanSeedUrl, status: "discovered", x: 0, y: 0 }])
        setLinks([])
        // Reset indexed link storage for new crawl
        allLinksRef.current.bySource.clear()
        allLinksRef.current.byTarget.clear()

        // Envoyer un ping toutes les 20 secondes pour garder la connexion vivante
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("ping")
          }
        }, 20000)
      }

      ws.onmessage = (event) => {
        // Ignorer les réponses "pong" du serveur
        if (event.data === "pong") return

        try {
          const message: WebSocketMessage = JSON.parse(event.data)

          if (message.type === "page_discovered") {
            const pageUrl = normalizeUrl(message.data.url)

            // Add or update the crawled node
            setNodes((prev) => {
              const node = prev.find((n) => n.id === pageUrl)
              if (node) {
                node.status = "crawled"
                node.title = message.data.title
                return [...prev]
              }
              return [...prev, { id: pageUrl, url: pageUrl, title: message.data.title, status: "crawled" }]
            })

            // Activate pending links that now have both endpoints crawled
            setLinks((prevLinks) => {
              setNodes((currentNodes) => {
                const crawledIds = new Set(currentNodes.filter(n => n.status === "crawled").map(n => n.id))
                crawledIds.add(pageUrl) // Include the new crawled node

                // Find links from/to this node where the other end is also crawled
                const linksFromNode = allLinksRef.current.bySource.get(pageUrl) || []
                const linksToNode = allLinksRef.current.byTarget.get(pageUrl) || []
                const allPendingLinks = [...linksFromNode, ...linksToNode]

                const newLinks = allPendingLinks.filter(link => {
                  // Check if both ends are crawled
                  if (!crawledIds.has(link.source) || !crawledIds.has(link.target)) return false
                  // Check if link already exists
                  const exists = prevLinks.some(l => {
                    const sId = typeof l.source === "object" ? (l.source as Node).id : l.source
                    const tId = typeof l.target === "object" ? (l.target as Node).id : l.target
                    return sId === link.source && tId === link.target
                  })
                  return !exists
                })

                if (newLinks.length > 0) {
                  setLinks(prev => [...prev, ...newLinks])
                }

                return currentNodes
              })
              return prevLinks
            })
          } else if (message.type === "link_created") {
            const source = normalizeUrl(message.data.source)
            const target = normalizeUrl(message.data.target)
            if (!source || !target || source === target) return

            // Store link in indexed storage for later activation
            const linkData = { source, target }
            const bySource = allLinksRef.current.bySource
            const byTarget = allLinksRef.current.byTarget

            if (!bySource.has(source)) bySource.set(source, [])
            if (!byTarget.has(target)) byTarget.set(target, [])

            // Check if already stored
            const existsInIndex = bySource.get(source)!.some(l => l.target === target)
            if (!existsInIndex) {
              bySource.get(source)!.push(linkData)
              byTarget.get(target)!.push(linkData)
            }

            // Only display if both nodes are already crawled
            setNodes((currentNodes) => {
              const sourceNode = currentNodes.find(n => n.id === source && n.status === "crawled")
              const targetNode = currentNodes.find(n => n.id === target && n.status === "crawled")

              if (sourceNode && targetNode) {
                setLinks((prev) => {
                  const linkExists = prev.find((l) => {
                    const sId = typeof l.source === "object" ? (l.source as Node).id : l.source
                    const tId = typeof l.target === "object" ? (l.target as Node).id : l.target
                    return sId === source && tId === target
                  })
                  if (!linkExists) {
                    return [...prev, { source, target }]
                  }
                  return prev
                })
              }
              return currentNodes
            })
          } else if (message.type === "crawl_completed") {
            setIsCrawling(false)
            setCrawlCompleted(true)
            setIsStopping(false)
            // Ne PAS fermer le WebSocket - on attend embedding_completed
            if (fgRef.current) fgRef.current.zoomToFit(1000, 50)
          } else if (message.type === "embedding_completed") {
            // Embeddings terminés - on peut maintenant utiliser search/similar
            setEmbeddingsReady(true)
            setIsConnected(false)
            if (pingInterval) clearInterval(pingInterval)
            ws.close()
            wsRef.current = null
            console.log("✅ Embeddings completed, WebSocket closed")
          } else if (message.type === "redirect_corrected") {
            const { source, old_target, new_target } = message.data
            const s = normalizeUrl(source),
              ot = normalizeUrl(old_target),
              nt = normalizeUrl(new_target)
            if (!s || !ot || !nt) return

            setNodes((prev) => {
              const nodesWithoutRedirect = prev.filter((n) => n.id !== ot)
              const targetExists = nodesWithoutRedirect.find((n) => n.id === nt)
              if (!targetExists) {
                const oldNode = prev.find((n) => n.id === ot)
                return [
                  ...nodesWithoutRedirect,
                  { id: nt, url: nt, status: "discovered", x: oldNode?.x || 0, y: oldNode?.y || 0 },
                ]
              }
              return nodesWithoutRedirect
            })

            setLinks((prev) => {
              const cleanLinks = prev.filter((l) => {
                const sId = typeof l.source === "object" ? (l.source as Node).id : l.source
                const tId = typeof l.target === "object" ? (l.target as Node).id : l.target
                return sId !== ot && tId !== ot
              })
              const exists = cleanLinks.find((l) => {
                const sId = typeof l.source === "object" ? (l.source as Node).id : l.source
                const tId = typeof l.target === "object" ? (l.target as Node).id : l.target
                return sId === s && tId === nt
              })
              if (!exists) return [...cleanLinks, { source: s, target: nt }]
              return cleanLinks
            })
          }
        } catch (error) {
          console.error(error)
        }
      }
      ws.onerror = () => {
        if (pingInterval) clearInterval(pingInterval)
        setIsConnected(false)
        setIsCrawling(false)
      }
      ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval)
        setIsConnected(false)
        setIsCrawling(false)
      }
      wsRef.current = ws
    } catch (err) {
      // Handle rate limit from axios error
      const axiosError = err as { response?: { status?: number } }
      if (axiosError.response?.status === 429) {
        setRateLimitError("Too many crawls! Please wait a moment before exploring again ✨")
        setTimeout(() => setRateLimitError(null), 5000)
      }
      setIsCrawling(false)
      setIsConnected(false)
    }
  }, [url, config])

  const handleStopCrawl = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Activer l'état "Finalisation en cours"
      setIsStopping(true)
      // Envoyer la demande d'arrêt gracieux
      wsRef.current.send(JSON.stringify({ action: "stop_crawl" }))
    }
  }, [])

  const handleReset = useCallback(() => {
    handleStopCrawl()
    setNodes([])
    setLinks([])
    setSearchScores({})
    setHighlightNodes(new Set())
    setHighlightLinks(new Set())
    setHoverNode(null)
    setUrl("")
    setSearchQuery("")
    setCrawlCompleted(false)
    setEmbeddingsReady(false)
    setClickedNode(null)
    setSelectedNode(null)
  }, [handleStopCrawl])

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setSearchScores({})
    }
  }, [searchQuery])

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  const stats = {
    discovered: nodes.length,
    crawled: nodes.filter((n) => n.status === "crawled").length,
    links: links.length,
  }

  const getSliderThumbColor = (value: number) => {
    if (value < 33) {
      // Cyan to purple
      const t = value / 33
      return `rgb(${6 + (147 - 6) * t}, ${182 + (51 - 182) * t}, ${212 + (255 - 212) * t})`
    } else if (value < 66) {
      // Purple to pink
      const t = (value - 33) / 33
      return `rgb(${147 + (236 - 147) * t}, ${51 + (72 - 51) * t}, ${255 + (153 - 255) * t})`
    } else {
      // Pink to red
      const t = (value - 66) / 34
      return `rgb(${236 + (239 - 236) * t}, ${72 + (68 - 72) * t}, ${153 + (68 - 153) * t})`
    }
  }

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden">
      <Starfield />

      {/* Rate Limit Error Toast */}
      {rateLimitError && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="px-6 py-4 rounded-2xl bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30 backdrop-blur-xl shadow-2xl shadow-red-500/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                <span className="text-xl">⏳</span>
              </div>
              <div>
                <p className="text-white font-semibold">Slow down, explorer!</p>
                <p className="text-white/70 text-sm">{rateLimitError}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <GraphCanvas
        nodes={nodes}
        links={links}
        searchScores={searchScores}
        seedUrl={url}
        fgRef={fgRef}
        onNodeHover={handleNodeHover}
        onNodeClick={handleNodeClick}
        hoverNode={hoverNode}
        highlightNodes={highlightNodes}
        highlightLinks={highlightLinks}
        clickedNode={clickedNode}
        similarNodes={similarNodes}
        hoveredSimilarUrl={hoveredSimilarUrl}
        analyticsMode={analyticsMode}
        pageRankScores={pageRankScores}
        maxPageRank={maxPageRank}
        importanceFilter={importanceFilter}
      />

      {selectedNode && (
        <DraggableWindow
          title="Page Details"
          defaultPosition={{ x: window.innerWidth - 500, y: window.innerHeight / 2 }}
          width={450}
          onClose={() => {
            setClickedNode(null)
            setSelectedNode(null)
            setSimilarNodes(new Set()) // Reset graph when closing window
          }}
        >
          <NodeDetailsWindow
            nodeUrl={selectedNode.url}
            nodeTitle={selectedNode.title}
            crawlId={currentCrawlId || crawlIdFromUrl}
            embeddingsReady={embeddingsReady}
            onClose={() => {
              setClickedNode(null)
              setSelectedNode(null)
              setSimilarNodes(new Set())
              setHoveredSimilarUrl(null)
            }}
            onSimilarPagesFound={handleSimilarPagesFound}
            onHoverSimilarPage={(url) => setHoveredSimilarUrl(url ? normalizeUrl(url) : null)}
          />
        </DraggableWindow>
      )}

      <DraggableWindow title="Controls" defaultPosition={{ x: 50, y: 90 }} width={500}>
        <CrawlControls
          url={url}
          setUrl={setUrl}
          isCrawling={isCrawling}
          isConnected={isConnected}
          isStopping={isStopping}
          isAnalyzing={crawlCompleted && !embeddingsReady}
          onStartCrawl={handleStartCrawl}
          onStopCrawl={handleStopCrawl}
          onReset={handleReset}
          showSettings={showSettings}
          setShowSettings={setShowSettings}
        />

        {/* Analytics Mode Controls - visible when graph has nodes */}
        {nodes.length > 0 && !isCrawling && (
          <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
            <button
              onClick={handleAnalytics}
              disabled={isLoadingAnalytics}
              className={`
                w-full group relative overflow-hidden rounded-xl transition-all duration-300
                ${analyticsMode
                  ? "bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-pink-500/20 border-2 border-cyan-400/50 shadow-[0_0_30px_rgba(6,182,212,0.4)]"
                  : "bg-white/5 hover:bg-white/10 border-2 border-white/10 hover:border-white/20"
                }
              `}
            >
              {/* Background shimmer effect when active */}
              {analyticsMode && (
                <div className="absolute inset-0 opacity-30">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]" />
                </div>
              )}

              <div className="relative flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  {/* Custom analytics icon */}
                  <div
                    className={`
                    flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-300
                    ${analyticsMode ? "bg-gradient-to-br from-cyan-500 to-purple-500" : "bg-white/10"}
                  `}
                  >
                    <svg
                      className={`w-5 h-5 transition-colors ${analyticsMode ? "text-white" : "text-white/60"}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 3v18h18" />
                      <path d="m19 9-5 5-4-4-3 3" />
                      <circle cx="19" cy="9" r="1.5" fill="currentColor" />
                    </svg>
                  </div>

                  <div className="text-left">
                    <div className={`font-semibold ${analyticsMode ? "text-cyan-300" : "text-white/90"}`}>
                      Analytics
                    </div>
                    <div className="text-xs text-white/50">PageRank visualization</div>
                  </div>
                </div>

                {/* Toggle switch */}
                <div
                  className={`
                  relative w-12 h-6 rounded-full transition-all duration-300
                  ${analyticsMode ? "bg-gradient-to-r from-cyan-500 to-purple-500" : "bg-white/20"}
                `}
                >
                  <div
                    className={`
                    absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-all duration-300 shadow-lg
                    ${analyticsMode ? "translate-x-6" : "translate-x-0"}
                  `}
                  />
                </div>
              </div>
            </button>

            {/* Importance Filter - only visible when analytics is ON */}
            {analyticsMode && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex justify-between text-xs text-white/60">
                  <span>Importance Filter</span>
                  <span>{importanceFilter}%</span>
                </div>
                <div className="relative">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={importanceFilter}
                    onChange={(e) => setImportanceFilter(Number(e.target.value))}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:transition-all [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:transition-all"
                    style={
                      {
                        //CSS custom properties for dynamic colors
                        "--thumb-color": getSliderThumbColor(importanceFilter),
                      } as React.CSSProperties
                    }
                  />
                  <style jsx>{`
                    input[type='range']::-webkit-slider-thumb {
                      background: var(--thumb-color);
                      box-shadow: 0 0 10px var(--thumb-color), 0 0 20px var(--thumb-color);
                    }
                    input[type='range']::-moz-range-thumb {
                      background: var(--thumb-color);
                      box-shadow: 0 0 10px var(--thumb-color), 0 0 20px var(--thumb-color);
                    }
                  `}</style>
                </div>
                <div className="flex justify-between text-[10px] text-white/40">
                  <span>Show all</span>
                  <span>Top only</span>
                </div>
              </div>
            )}
          </div>
        )}
      </DraggableWindow>

      {showSettings && (
        <DraggableWindow
          title="Settings"
          defaultPosition={{ x: 50, y: 270 }}
          width={400}
          onClose={() => setShowSettings(false)}
        >
          <SettingsPanel config={config} setConfig={setConfig} />
        </DraggableWindow>
      )}

      {embeddingsReady && (
        <DraggableWindow title="Search" defaultPosition={{ x: 50, y: 440 }} width={500}>
          <SearchPanel
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            isSearching={isSearching}
            onSearch={handleSearch}
            crawlCompleted={crawlCompleted}
          />
        </DraggableWindow>
      )}

      <StatsPanel stats={stats} isConnected={isConnected} />
    </div>
  )
}
