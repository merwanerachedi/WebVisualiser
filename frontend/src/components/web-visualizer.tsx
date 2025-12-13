"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Play, Pause, RotateCcw, Settings, Search } from "lucide-react"
import dynamic from "next/dynamic"

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => <div className="text-white text-center pt-20">Loading Graph Engine...</div>,
})

const normalizeUrl = (url: string | undefined) => {
  if (!url) return ""
  return url.endsWith("/") ? url.slice(0, -1) : url
}

// --- COMPOSANT STARFIELD (FOND ÉTOILÉ) ---
const Starfield = () => {
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
      mouseX = (e.clientX - width / 2) * 0.05 // Facteur de mouvement faible
      mouseY = (e.clientY - height / 2) * 0.05
    }
    window.addEventListener("mousemove", handleMouseMove)

    // Boucle d'animation
    let animationFrameId: number
    const animate = () => {
      ctx.clearRect(0, 0, width, height)

      // Fond noir profond mais pas total pour laisser voir le gradient CSS si besoin
      ctx.fillStyle = "rgba(10, 10, 10, 1)"
      ctx.fillRect(0, 0, width, height)

      stars.forEach((star) => {
        // Mouvement naturel vers le haut
        star.y -= star.speed
        if (star.y < 0) {
          star.y = height
          star.x = Math.random() * width
        }

        // Application du parallaxe (décalage selon la souris)
        // Les plus grosses étoiles bougent plus vite (effet de profondeur)
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

// --- TYPES ---
interface Node {
  id: string
  url: string
  title?: string
  status: "discovered" | "crawled"
  // Score removed from here to avoid state mutation issues
  x?: number
  y?: number
}

interface Link {
  source: string | Node
  target: string | Node
}

interface WebSocketMessage {
  type: "link_created" | "page_discovered" | "crawl_completed" | "redirect_corrected"
  data: {
    source?: string
    target?: string
    old_target?: string
    new_target?: string
    anchor?: string
    url?: string
    title?: string
    status_code?: number
    domain?: string
    path?: string
    crawl_id?: string
  }
}

interface CrawlConfig {
  max_depth: number
  max_pages: number
  crawl_mode: "INTERNAL" | "EXTERNAL"
  algorithm: "BFS" | "DFS"
}

interface SearchResult {
  url: string
  score: number
  title: string
}

export default function WebVisualizer() {
  const [url, setUrl] = useState("")
  const [isConnected, setIsConnected] = useState(false)
  const [isCrawling, setIsCrawling] = useState(false)

  const [nodes, setNodes] = useState<Node[]>([])
  const [links, setLinks] = useState<Link[]>([])
  
  // ✅ NEW STATE: Store scores separately to avoid breaking graph references
  const [searchScores, setSearchScores] = useState<Record<string, number>>({})

  // STATES FOCUS MODE
  const [hoverNode, setHoverNode] = useState<Node | null>(null)
  const [highlightNodes, setHighlightNodes] = useState(new Set<string>())
  const [highlightLinks, setHighlightLinks] = useState(new Set<Link>())

  const [stats, setStats] = useState({ discovered: 0, crawled: 0, links: 0 })
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

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

  const wsRef = useRef<WebSocket | null>(null)
  const fgRef = useRef<any>(null)

  const handleNodeHover = (node: Node | null) => {
    setHoverNode(node || null)
    const newHighlightNodes = new Set<string>()
    const newHighlightLinks = new Set<Link>()

    if (node) {
      newHighlightNodes.add(node.id)
      links.forEach((link) => {
        const sourceId = typeof link.source === "object" ? (link.source as any).id : link.source
        const targetId = typeof link.target === "object" ? (link.target as any).id : link.target
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

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    try {
      const response = await fetch(`http://localhost:8000/api/search?q=${encodeURIComponent(searchQuery)}`)
      if (!response.ok) throw new Error("Search failed")

      const results: SearchResult[] = await response.json()

      // ✅ FIXED: Update separate scores state instead of modifying nodes directly
      const newScores: Record<string, number> = {}
      results.forEach((r) => {
        newScores[normalizeUrl(r.url)] = r.score
      })
      setSearchScores(newScores)

      // Optional: Zoom to best result
      if (results.length > 0 && fgRef.current) {
         const bestId = normalizeUrl(results[0].url)
         const node = nodes.find(n => n.id === bestId)
         if (node && typeof node.x === 'number' && typeof node.y === 'number') {
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
    setSearchScores({}) // Reset scores on new crawl

    try {
      console.log("🚀 Starting crawl with URL:", url)
      const resp = await fetch("http://localhost:8000/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, ...config }),
      })

      if (!resp.ok) throw new Error(`Failed: ${resp.status}`)
      const data = await resp.json()
      const crawlId = data.crawl_id

      const ws = new WebSocket(`ws://localhost:8000/ws/${crawlId}`)

      ws.onopen = () => {
        setIsConnected(true)
        setIsCrawling(true)
        setNodes([{ id: cleanSeedUrl, url: cleanSeedUrl, status: "discovered", x: 0, y: 0 }])
        setLinks([])
        setStats({ discovered: 1, crawled: 0, links: 0 })
      }

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)

          if (message.type === "page_discovered") {
            const pageUrl = normalizeUrl(message.data.url)
            setNodes((prev) => {
              const node = prev.find((n) => n.id === pageUrl)
              if (node) {
                node.status = "crawled"
                node.title = message.data.title
                return [...prev]
              }
              return [...prev, { id: pageUrl, url: pageUrl, title: message.data.title, status: "crawled" }]
            })
            setStats((prev) => ({ ...prev, crawled: prev.crawled + 1 }))
          } else if (message.type === "link_created") {
            const source = normalizeUrl(message.data.source)
            const target = normalizeUrl(message.data.target)
            if (!source || !target || source === target) return

            setNodes((prev) => {
              const newNodes = []
              const sourceNode = prev.find((n) => n.id === source)
              if (!sourceNode) newNodes.push({ id: source, url: source, status: "discovered" as const })

              const targetExists = prev.find((n) => n.id === target)
              if (!targetExists) {
                const baseX = sourceNode?.x !== undefined ? sourceNode.x : 0
                const baseY = sourceNode?.y !== undefined ? sourceNode.y : 0
                const spawnX = baseX + (Math.random() - 0.5) * 10
                const spawnY = baseY + (Math.random() - 0.5) * 10
                newNodes.push({ id: target, url: target, status: "discovered" as const, x: spawnX, y: spawnY })
              }
              if (newNodes.length > 0) {
                setStats((s) => ({ ...s, discovered: s.discovered + newNodes.length }))
                return [...prev, ...newNodes]
              }
              return prev
            })

            setLinks((prev) => {
              const linkExists = prev.find((l: any) => {
                const sId = l.source.id || l.source
                const tId = l.target.id || l.target
                return sId === source && tId === target
              })
              if (!linkExists) {
                setStats((s) => ({ ...s, links: s.links + 1 }))
                return [...prev, { source, target }]
              }
              return prev
            })
          } else if (message.type === "crawl_completed") {
            setIsCrawling(false)
            setIsConnected(false)
            setCrawlCompleted(true)
            ws.close()
            wsRef.current = null
            if (fgRef.current) fgRef.current.zoomToFit(1000, 50)
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
              const cleanLinks = prev.filter((l: any) => {
                const sId = l.source.id || l.source
                const tId = l.target.id || l.target
                return sId !== ot && tId !== ot
              })
              const exists = cleanLinks.find((l: any) => {
                const sId = l.source.id || l.source
                const tId = l.target.id || l.target
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
        setIsConnected(false)
        setIsCrawling(false)
      }
      ws.onclose = () => {
        setIsConnected(false)
        setIsCrawling(false)
      }
      wsRef.current = ws
    } catch (err) {
      setIsCrawling(false)
      setIsConnected(false)
    }
  }, [url, config])

  const handleStopCrawl = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ action: "stop_crawl" }))
      wsRef.current.close()
      wsRef.current = null
    }
    setIsCrawling(false)
    setIsConnected(false)
    setCrawlCompleted(true)
  }, [])

  const handleReset = useCallback(() => {
    handleStopCrawl()
    setNodes([])
    setLinks([])
    setSearchScores({}) // Reset scores
    setHighlightNodes(new Set())
    setHighlightLinks(new Set())
    setHoverNode(null)
    setStats({ discovered: 0, crawled: 0, links: 0 })
    setUrl("")
    setSearchQuery("")
    setCrawlCompleted(false)
  }, [handleStopCrawl])

  // Effet automatique : Si on vide la barre de recherche, on remet le graphe en vert
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

  useEffect(() => {
    setDimensions({ width: window.innerWidth, height: window.innerHeight })
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const graphData = useMemo(() => ({ nodes, links }), [nodes, links])

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden">
      {/* 1. LAYER FOND : ÉTOILES */}
      <Starfield />

      {/* 2. LAYER GRAPHE : TRANSPARENT */}
      <div className="absolute inset-0 z-10">
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          // Interactions
          onNodeHover={handleNodeHover}
          onNodeClick={(node) => window.open(node.id, "_blank")}
          // Physique
          cooldownTicks={100}
          d3VelocityDecay={0.3}
          d3AlphaDecay={0.02}
          // Liens (Focus Mode)
          linkColor={(link) =>
            hoverNode && !highlightLinks.has(link) ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.2)"
          }
          linkWidth={(link) => (highlightLinks.has(link) ? 2 : 1)}
          linkDirectionalParticles={hoverNode ? 0 : 2}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleSpeed={0.005}
          // Noeuds (Focus Mode + Couleurs)
          nodeCanvasObject={(node: any, ctx, globalScale) => {
            if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return

            // 1. Est-ce qu'une recherche est active ?
            // On regarde si on a des scores dans notre dictionnaire
            const isSearchActive = Object.keys(searchScores).length > 0

            const isDimmed = hoverNode && !highlightNodes.has(node.id)
            const globalAlpha = isDimmed ? 0.1 : 1

            ctx.save()
            ctx.globalAlpha = globalAlpha

            const r = 4
            const fontSize = 12 / globalScale
            const isCrawled = node.status === "crawled"
            const score = searchScores[node.id]

            // 2. LOGIQUE DE COULEUR (Coeur du changement)
            let fillStyle: string
            
            if (isSearchActive) {
                // --- MODE RECHERCHE ---
                // Par défaut, tout le monde est GRIS (même les pages crawlées)
                fillStyle = "rgba(255, 255, 255, 0.2)" 

                // Sauf si on a un score pertinent
                if (score !== undefined) {
                    if (score > 0.75) fillStyle = "#166534" // Vert Foncé (Top)
                    else if (score > 0.45) fillStyle = "#dc2626" // Rouge (Moyen)
                }
            } else {
                // --- MODE NORMAL ---
                // Vert si crawlé, Gris si découvert
                fillStyle = isCrawled ? "#4ade80" : "#94a3b8"
            }

            try {
              // 3. LOGIQUE DU GLOW (Lueur autour du point)
              const glowSize = 12
              const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowSize)

              if (isSearchActive) {
                  // En recherche, seuls les résultats brillent
                  if (score !== undefined && score > 0.75) {
                      gradient.addColorStop(0, "rgba(22, 101, 52, 0.8)") // Glow Vert
                  } else if (score !== undefined && score > 0.45) {
                      gradient.addColorStop(0, "rgba(220, 38, 38, 0.8)") // Glow Rouge
                  } else {
                      gradient.addColorStop(0, "rgba(100, 100, 100, 0.1)") // Glow Gris très faible pour les autres
                  }
              } else {
                  // En mode normal
                  gradient.addColorStop(0, isCrawled ? "rgba(74, 222, 128, 0.6)" : "rgba(148, 163, 184, 0.4)")
              }
              
              gradient.addColorStop(1, "rgba(0, 0, 0, 0)")

              // Dessin du Glow
              ctx.beginPath()
              ctx.fillStyle = gradient
              ctx.arc(node.x, node.y, glowSize, 0, 2 * Math.PI)
              ctx.fill()

              // Dessin du Coeur (Point central)
              ctx.beginPath()
              ctx.fillStyle = fillStyle
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
              ctx.fill()

              // 4. LOGIQUE DES LABELS (TEXTE)
              // On affiche le label si : C'est le seed, OU survolé, OU c'est un résultat pertinent
              const isRelevantResult = isSearchActive && score !== undefined && score > 0.45;

              if (node.id === normalizeUrl(url) || node === hoverNode || isRelevantResult) {
                const label = node.title
                  ? node.title.length > 30
                    ? node.title.substring(0, 30) + "..."
                    : node.title
                  : node.id
                  
                ctx.font = `${fontSize}px Sans-Serif`
                ctx.textAlign = "center"
                ctx.textBaseline = "middle"

                const textWidth = ctx.measureText(label).width
                
                // Fond du texte (plus foncé pour lisibilité)
                ctx.fillStyle = "rgba(0,0,0,0.8)" 
                ctx.fillRect(node.x - textWidth / 2 - 2, node.y + glowSize - 6, textWidth + 4, fontSize + 4)

                // Texte blanc brillant
                ctx.fillStyle = "rgba(255, 255, 255, 1)"
                ctx.fillText(label, node.x, node.y + glowSize + 2)
              }
            } catch (e) {}

            ctx.restore()
          }}
          nodeLabel=""
          backgroundColor="rgba(0,0,0,0)"
        />
      </div>

      {/* 3. LAYER UI : AU DESSUS DE TOUT */}
      <div className="absolute left-1/2 top-8 z-20 flex -translate-x-1/2 flex-col items-center gap-4 pointer-events-none">
        <h1 className="text-center font-mono text-4xl font-bold tracking-tight text-white drop-shadow-lg">
          Web Visualizer
        </h1>

        <div className="rounded-xl border border-white/20 bg-black/80 p-6 shadow-2xl backdrop-blur-sm pointer-events-auto">
          <div className="flex items-center gap-3">
            <input
              type="url"
              placeholder="Enter seed URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isCrawling}
              className="w-96 rounded-lg border border-white/30 bg-white/10 px-4 py-2 font-mono text-sm text-white focus:outline-none"
            />
            {!isCrawling ? (
              <button
                onClick={handleStartCrawl}
                disabled={!url || isConnected}
                className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-medium text-black hover:bg-white/90 disabled:opacity-50"
              >
                <Play className="h-4 w-4" /> Start
              </button>
            ) : (
              <button
                onClick={handleStopCrawl}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700"
              >
                <Pause className="h-4 w-4" /> Stop
              </button>
            )}
            <button
              onClick={handleReset}
              className="rounded-lg border border-white/30 p-2 text-white hover:bg-white/10"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="rounded-lg border border-white/30 p-2 text-white hover:bg-white/10"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
          {showSettings && (
            <div className="mt-4 space-y-3 border-t border-white/20 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/70">Max Depth</label>
                  <input
                    type="number"
                    min="1"
                    value={config.max_depth}
                    onChange={(e) => setConfig({ ...config, max_depth: +e.target.value })}
                    className="w-full bg-white/10 text-white rounded px-2 py-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/70">Max Pages</label>
                  <input
                    type="number"
                    min="1"
                    value={config.max_pages}
                    onChange={(e) => setConfig({ ...config, max_pages: +e.target.value })}
                    className="w-full bg-white/10 text-white rounded px-2 py-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/70">Crawl Mode</label>
                  <select
                    value={config.crawl_mode}
                    onChange={(e) => setConfig({ ...config, crawl_mode: e.target.value as any })}
                    className="w-full bg-white/10 text-white rounded px-2 py-1"
                  >
                    <option value="INTERNAL">INTERNAL</option>
                    <option value="EXTERNAL">EXTERNAL</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-white/70">Algorithm</label>
                  <select
                    value={config.algorithm}
                    onChange={(e) => setConfig({ ...config, algorithm: e.target.value as any })}
                    className="w-full bg-white/10 text-white rounded px-2 py-1"
                  >
                    <option value="BFS">BFS</option>
                    <option value="DFS">DFS</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {crawlCompleted && (
          <div className="rounded-xl border border-white/20 bg-black/80 p-6 shadow-2xl backdrop-blur-sm pointer-events-auto">
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Search for content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                disabled={isSearching}
                className="w-96 rounded-lg border border-white/30 bg-white/10 px-4 py-2 font-mono text-sm text-white focus:outline-none placeholder:text-white/50"
              />
              <button
                onClick={handleSearch}
                disabled={!searchQuery.trim() || isSearching}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Search className="h-4 w-4" />
                {isSearching ? "Searching..." : "Search"}
              </button>
            </div>
            <div className="mt-3 text-xs text-white/60 text-center">
              High relevance: <span className="inline-block w-3 h-3 rounded-full bg-[#166534] align-middle"></span>{" "}
              Green • Medium relevance:{" "}
              <span className="inline-block w-3 h-3 rounded-full bg-[#dc2626] align-middle ml-1"></span> Red
            </div>
          </div>
        )}
      </div>

      <div className="absolute right-8 top-8 z-20 pointer-events-none">
        <div className="rounded-xl border border-white/20 bg-black/80 p-4 backdrop-blur-sm pointer-events-auto">
          <div className="space-y-2 font-mono text-sm text-white">
            <div className="flex justify-between gap-6">
              <span>Discovered:</span>
              <span className="font-bold">{stats.discovered}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span>Crawled:</span>
              <span className="font-bold">{stats.crawled}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span>Links:</span>
              <span className="font-bold">{stats.links}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 border-t border-white/20 pt-2">
              <div className={`h-2 w-2 rounded-full ${isConnected ? "animate-pulse bg-white" : "bg-white/30"}`} />
              <span className="text-xs text-white/60">{isConnected ? "Connected" : "Disconnected"}</span>
            </div>
          </div>
        </div>
      </div>

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