export interface Node {
  id: string
  url: string
  title?: string
  status: "discovered" | "crawled"
  x?: number
  y?: number
}

export interface Link {
  source: string | Node
  target: string | Node
}

export interface WebSocketMessage {
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

export interface CrawlConfig {
  max_depth: number
  max_pages: number
  crawl_mode: "INTERNAL" | "EXTERNAL"
  algorithm: "BFS" | "DFS"
}

export interface SearchResult {
  url: string
  score: number
  title: string
}
