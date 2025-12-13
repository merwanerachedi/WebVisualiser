"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Starfield } from "./visualizer/starfield"
import { CrawlControls } from "./visualizer/crawl-controls"
import { SearchPanel } from "./visualizer/search-panel"
import { SettingsPanel } from "./visualizer/settings-panel"
import { StatsPanel } from "./visualizer/stats-panel"
import { GraphCanvas } from "./visualizer/graph-canvas"
import { DraggableWindow } from "./visualizer/draggable-window"
import type { Node, Link, WebSocketMessage, CrawlConfig, SearchResult } from "./visualizer/types"

const normalizeUrl = (url: string | undefined) => {
  if (!url) return ""
  return url.endsWith("/") ? url.slice(0, -1) : url
}

export default function WebVisualizer() {
  const [url, setUrl] = useState("")
  const [isConnected, setIsConnected] = useState(false)
  const [isCrawling, setIsCrawling] = useState(false)

  const [nodes, setNodes] = useState<Node[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [searchScores, setSearchScores] = useState<Record<string, number>>({})

  // Focus Mode States
  const [hoverNode, setHoverNode] = useState<Node | null>(null)
  const [highlightNodes, setHighlightNodes] = useState(new Set<string>())
  const [highlightLinks, setHighlightLinks] = useState(new Set<Link>())

  

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
              const linkExists = prev.find((l: any) => {
                const sId = l.source.id || l.source
                const tId = l.target.id || l.target
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
    setSearchScores({})
    setHighlightNodes(new Set())
    setHighlightLinks(new Set())
    setHoverNode(null)
    setUrl("")
    setSearchQuery("")
    setCrawlCompleted(false)
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
    crawled: nodes.filter(n => n.status === "crawled").length,
    links: links.length
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
        hoverNode={hoverNode}
        highlightNodes={highlightNodes}
        highlightLinks={highlightLinks}
      />

      <h1 className="absolute left-1/2 top-8 z-20 -translate-x-1/2 text-center font-mono text-4xl font-bold tracking-tight text-white drop-shadow-lg pointer-events-none">
        Web Visualizer
      </h1>

      <DraggableWindow title="Controls" defaultPosition={{ x: 50, y: 120 }} width={500}>
        <CrawlControls
          url={url}
          setUrl={setUrl}
          isCrawling={isCrawling}
          isConnected={isConnected}
          onStartCrawl={handleStartCrawl}
          onStopCrawl={handleStopCrawl}
          onReset={handleReset}
          showSettings={showSettings}
          setShowSettings={setShowSettings}
          config={config}
          setConfig={setConfig}
        />
      </DraggableWindow>

      {showSettings && (
        <DraggableWindow
          title="Settings"
          defaultPosition={{ x: 50, y: 300 }}
          width={400}
          onClose={() => setShowSettings(false)}
        >
          <SettingsPanel config={config} setConfig={setConfig} />
        </DraggableWindow>
      )}

      {crawlCompleted && (
        <DraggableWindow title="Search" defaultPosition={{ x: 50, y: 480 }} width={500}>
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
