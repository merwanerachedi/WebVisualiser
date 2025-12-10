"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Play, Pause, RotateCcw, Settings } from "lucide-react"
import dynamic from "next/dynamic"

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => <div className="text-white text-center pt-20">Loading Graph Engine...</div>,
})

const normalizeUrl = (url: string | undefined) => {
  if (!url) return ""
  return url.endsWith("/") ? url.slice(0, -1) : url
}

interface Node {
  id: string
  url: string
  title?: string
  status: "discovered" | "crawled"
  x?: number
  y?: number
}

interface Link {
  source: string | Node // D3 remplace string par Node object
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

export default function WebVisualizer() {
  const [url, setUrl] = useState("")
  const [isConnected, setIsConnected] = useState(false)
  const [isCrawling, setIsCrawling] = useState(false)
  
  const [nodes, setNodes] = useState<Node[]>([])
  const [links, setLinks] = useState<Link[]>([])
  
  const [stats, setStats] = useState({ discovered: 0, crawled: 0, links: 0 })
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  const [showSettings, setShowSettings] = useState(false)
  const [config, setConfig] = useState<CrawlConfig>({
    max_depth: 3,
    max_pages: 100,
    crawl_mode: "INTERNAL",
    algorithm: "BFS",
  })

  const wsRef = useRef<WebSocket | null>(null)
  const fgRef = useRef<any>(null)

  const handleStartCrawl = useCallback(async () => {
    if (!url) return

    const cleanSeedUrl = normalizeUrl(url)

    try {
      console.log("🚀 Starting crawl with URL:", url)
      const resp = await fetch("http://localhost:8000/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          max_depth: config.max_depth,
          max_pages: config.max_pages,
          crawl_mode: config.crawl_mode,
          algorithm: config.algorithm,
        }),
      })

      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`Failed to create crawl: ${resp.status} ${text}`)
      }

      const data = await resp.json()
      const crawlId = data.crawl_id
      
      const ws = new WebSocket(`ws://localhost:8000/ws/${crawlId}`)

      ws.onopen = () => {
        console.log("✅ WebSocket open for crawl", crawlId)
        setIsConnected(true)
        setIsCrawling(true)

        setNodes([{ 
          id: cleanSeedUrl, 
          url: cleanSeedUrl, 
          status: "discovered",
          x: 0, 
          y: 0
        }])
        setLinks([])
        setStats({ discovered: 1, crawled: 0, links: 0 })
      }

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)

          if (message.type === "page_discovered") {
            const pageUrl = normalizeUrl(message.data.url)
            const { title } = message.data
            
            setNodes((prev) => {
              const node = prev.find((n) => n.id === pageUrl)
              if (node) {
                // ⚠️ CORRECTION CRITIQUE : Mutation directe au lieu de remplacement
                // Cela préserve les liens existants qui pointent vers cet objet précis
                node.status = "crawled"
                node.title = title
                // On retourne une copie du tableau (mais avec les MÊMES objets dedans)
                // pour déclencher le rendu React sans casser D3
                return [...prev] 
              }
              // Nouveau noeud (rare ici, mais possible)
              return [...prev, { id: pageUrl, url: pageUrl, title, status: "crawled" }]
            })
            setStats((prev) => ({ ...prev, crawled: prev.crawled + 1 }))
            
          } else if (message.type === "link_created") {
            const source = normalizeUrl(message.data.source)
            const target = normalizeUrl(message.data.target)
            
            if (!source || !target || source === target) return

            setNodes((prev) => {
              const newNodes = []
              const sourceNode = prev.find((n) => n.id === source)
              
              if (!sourceNode) {
                newNodes.push({ id: source, url: source, status: "discovered" as const })
              }
              
              const targetExists = prev.find((n) => n.id === target)
              if (!targetExists) {
                // On place le nouveau noeud près de son parent pour éviter l'éjection
                // On vérifie que sourceNode.x existe bien (est un nombre)
                const baseX = (sourceNode?.x !== undefined) ? sourceNode.x : 0
                const baseY = (sourceNode?.y !== undefined) ? sourceNode.y : 0
                
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
              // Vérification d'existence robuste (gère string ID ou objet Node)
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
          } 
          else if (message.type === "crawl_completed") {
            console.log("🏁 Fin du crawl reçue.")
            setIsCrawling(false)
            setIsConnected(false)
            ws.close()
            wsRef.current = null
            if (fgRef.current) fgRef.current.zoomToFit(1000, 50)
          }
          else if (message.type === "redirect_corrected") {
            const source = normalizeUrl(message.data.source)
            const old_target = normalizeUrl(message.data.old_target)
            const new_target = normalizeUrl(message.data.new_target)
            
            if (!source || !old_target || !new_target) return

            setNodes((prev) => {
              // Pour la suppression, on filtre (crée un nouveau tableau), c'est ok
              const nodesWithoutRedirect = prev.filter(n => n.id !== old_target)
              const targetExists = nodesWithoutRedirect.find(n => n.id === new_target)
              if (!targetExists) {
                 const oldNode = prev.find(n => n.id === old_target)
                 return [...nodesWithoutRedirect, { 
                   id: new_target, url: new_target, status: "discovered", 
                   x: oldNode?.x || 0, y: oldNode?.y || 0 
                 }]
              }
              return nodesWithoutRedirect
            })

            setLinks((prev) => {
              const cleanLinks = prev.filter((l: any) => {
                const sId = l.source.id || l.source
                const tId = l.target.id || l.target
                return sId !== old_target && tId !== old_target
              })
              const exists = cleanLinks.find((l: any) => {
                const sId = l.source.id || l.source
                const tId = l.target.id || l.target
                return sId === source && tId === new_target
              })
              if (!exists) return [...cleanLinks, { source, target: new_target }]
              return cleanLinks
            })
          }
        } catch (error) { console.error("❌ Error handling WS message:", error) }
      }

      ws.onerror = () => { setIsConnected(false); setIsCrawling(false) }
      ws.onclose = () => { setIsConnected(false); setIsCrawling(false) }
      wsRef.current = ws
    } catch (err) {
      console.error("Error starting crawl:", err)
      setIsCrawling(false); setIsConnected(false)
    }
  }, [url, config])

  const handleStopCrawl = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ action: "stop_crawl" }))
      wsRef.current.close()
      wsRef.current = null
    }
    setIsCrawling(false); setIsConnected(false)
  }, [])

  const handleReset = useCallback(() => {
    handleStopCrawl()
    setNodes([]); setLinks([])
    setStats({ discovered: 0, crawled: 0, links: 0 })
    setUrl("")
  }, [handleStopCrawl])

  useEffect(() => { return () => { if (wsRef.current) wsRef.current.close() } }, [])

  useEffect(() => {
    setDimensions({ width: window.innerWidth, height: window.innerHeight })
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const graphData = useMemo(() => ({ nodes, links }), [nodes, links])

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden">
      
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        
        // Physique
        cooldownTicks={100}
        d3VelocityDecay={0.3} // Friction modérée
        d3AlphaDecay={0.02}

        // Liens natifs (gris clair)
        linkColor={() => "rgba(255, 255, 255, 0.2)"}
        linkWidth={1}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleSpeed={0.005}

        // Dessin des noeuds (Gris uniforme)
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;

          const r = 4 // Taille fixe
          const fontSize = 12 / globalScale
          const fillStyle = "#94a3b8" // Slate 400 (Gris) pour tout le monde
          
          try {
            // Glow blanc léger
            const glowSize = 12
            const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowSize)
            gradient.addColorStop(0, "rgba(255, 255, 255, 0.2)")
            gradient.addColorStop(1, "rgba(0, 0, 0, 0)")
            
            ctx.beginPath()
            ctx.fillStyle = gradient
            ctx.arc(node.x, node.y, glowSize, 0, 2 * Math.PI)
            ctx.fill()
  
            // Cercle solide
            ctx.beginPath()
            ctx.fillStyle = fillStyle
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
            ctx.fill()
            
            // Labels
            if (globalScale > 1.2 || node.id === normalizeUrl(url)) {
               const label = node.title ? (node.title.length > 20 ? node.title.substring(0, 20) + '...' : node.title) : node.id
               ctx.font = `${fontSize}px Sans-Serif`
               ctx.textAlign = 'center'
               ctx.textBaseline = 'middle'
               ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
               ctx.fillText(label, node.x, node.y + glowSize + 2)
            }
          } catch (e) {}
        }}
        
        onNodeClick={(node) => window.open(node.id, '_blank')}
        nodeLabel="id"
        backgroundColor="#000000"
      />

      {/* --- UI --- */}
      <div className="absolute left-1/2 top-8 z-10 flex -translate-x-1/2 flex-col items-center gap-4 pointer-events-none">
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
              className="w-96 rounded-lg border border-white/30 bg-white/10 px-4 py-2 font-mono text-sm text-white placeholder:text-white/50 focus:border-white focus:outline-none"
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
            <button onClick={handleReset} className="rounded-lg border border-white/30 p-2 text-white hover:bg-white/10">
              <RotateCcw className="h-4 w-4" />
            </button>
            <button onClick={() => setShowSettings(!showSettings)} className="rounded-lg border border-white/30 p-2 text-white hover:bg-white/10">
              <Settings className="h-4 w-4" />
            </button>
          </div>
          {showSettings && (
            <div className="mt-4 space-y-3 border-t border-white/20 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/70">Max Depth</label>
                  <input type="number" min="1" max="10" value={config.max_depth} onChange={(e) => setConfig({ ...config, max_depth: Number.parseInt(e.target.value) || 1 })} className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 font-mono text-sm text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/70">Max Pages</label>
                  <input type="number" min="1" max="1000" value={config.max_pages} onChange={(e) => setConfig({ ...config, max_pages: Number.parseInt(e.target.value) || 1 })} className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 font-mono text-sm text-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/70">Crawl Mode</label>
                  <select value={config.crawl_mode} onChange={(e) => setConfig({ ...config, crawl_mode: e.target.value as any })} className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 font-mono text-sm text-white">
                    <option value="INTERNAL">INTERNAL</option>
                    <option value="EXTERNAL">EXTERNAL</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/70">Algorithm</label>
                  <select value={config.algorithm} onChange={(e) => setConfig({ ...config, algorithm: e.target.value as any })} className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 font-mono text-sm text-white">
                    <option value="BFS">BFS</option>
                    <option value="DFS">DFS</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="absolute right-8 top-8 z-10 pointer-events-none">
        <div className="rounded-xl border border-white/20 bg-black/80 p-4 backdrop-blur-sm pointer-events-auto">
          <div className="space-y-2 font-mono text-sm">
            <div className="flex justify-between gap-6"><span className="text-white/60">Discovered:</span><span className="font-bold text-white">{stats.discovered}</span></div>
            <div className="flex justify-between gap-6"><span className="text-white/60">Crawled:</span><span className="font-bold text-white">{stats.crawled}</span></div>
            <div className="flex justify-between gap-6"><span className="text-white/60">Links:</span><span className="font-bold text-white">{stats.links}</span></div>
            <div className="mt-2 flex items-center gap-2 border-t border-white/20 pt-2">
              <div className={`h-2 w-2 rounded-full ${isConnected ? "animate-pulse bg-white" : "bg-white/30"}`} />
              <span className="text-xs text-white/60">{isConnected ? "Connected" : "Disconnected"}</span>
            </div>
          </div>
        </div>
      </div>

      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-lg text-white/70">Enter a URL to visualize the web</p>
          </div>
        </div>
      )}
    </div>
  )
}