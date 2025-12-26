"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useSearchParams } from "next/navigation"
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

  const [nodes, setNodes] = useState<Node[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [searchScores, setSearchScores] = useState<Record<string, number>>({})

  // Focus Mode States
  const [hoverNode, setHoverNode] = useState<Node | null>(null)
  const [highlightNodes, setHighlightNodes] = useState(new Set<string>())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [highlightLinks, setHighlightLinks] = useState(new Set<any>())

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

  const wsRef = useRef<WebSocket | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null)

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

  const handleNodeClick = useCallback((node: Node, screenX: number, screenY: number) => {
    setClickedNode(node)
    setSelectedNode(node)
  }, [])

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    try {
      const response = await fetch(`http://localhost:8000/api/search?q=${encodeURIComponent(searchQuery)}`)
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
    setSearchScores({})

    try {
      const resp = await fetch("http://localhost:8000/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url, ...config }),
      })

      if (!resp.ok) throw new Error(`Failed: ${resp.status}`)
      const data = await resp.json()
      const crawlId = data.crawl_id

      const ws = new WebSocket(`ws://localhost:8000/ws/${crawlId}`)

      // Variable pour stocker l'intervalle de ping
      let pingInterval: NodeJS.Timeout | null = null

      ws.onopen = () => {
        setIsConnected(true)
        setIsCrawling(true)
        setNodes([{ id: cleanSeedUrl, url: cleanSeedUrl, status: "discovered", x: 0, y: 0 }])
        setLinks([])

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
            setNodes((prev) => {
              const node = prev.find((n) => n.id === pageUrl)
              if (node) {
                node.status = "crawled"
                node.title = message.data.title
                return [...prev]
              }
              return [...prev, { id: pageUrl, url: pageUrl, title: message.data.title, status: "crawled" }]
            })
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
                return [...prev, ...newNodes]
              }
              return prev
            })

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
          } else if (message.type === "crawl_completed") {
            setIsCrawling(false)
            setIsConnected(false)
            setCrawlCompleted(true)
            setIsStopping(false)
            if (pingInterval) clearInterval(pingInterval)
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
    } catch (_err) {
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

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden">
      <Starfield />

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
      />

      {selectedNode && (
        <DraggableWindow
          title="Page Details"
          defaultPosition={{ x: window.innerWidth / 2 - 200, y: window.innerHeight / 2 - 200 }}
          width={450}
          onClose={() => {
            setClickedNode(null)
            setSelectedNode(null)
          }}
        >
          <NodeDetailsWindow
            nodeUrl={selectedNode.url}
            nodeTitle={selectedNode.title}
            onClose={() => {
              setClickedNode(null)
              setSelectedNode(null)
            }}
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
          onStartCrawl={handleStartCrawl}
          onStopCrawl={handleStopCrawl}
          onReset={handleReset}
          showSettings={showSettings}
          setShowSettings={setShowSettings}
        />
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

      {crawlCompleted && (
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
