"use client"

import { useState, useEffect } from "react"
import { ExternalLink, FileText, Loader2, Target, Copy, Check, Link2, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SimilarPage {
    url: string
    title: string | null
    score: number
}

interface OutlinkPage {
    url: string
    title: string | null
    discovered_at: string | null
}

interface NodeDetailsWindowProps {
    nodeUrl: string
    nodeTitle?: string
    crawlId?: string | null // Added for outlinks API
    embeddingsReady?: boolean // true when embeddings generation is complete
    onClose: () => void
    onSimilarPagesFound?: (pages: SimilarPage[]) => void
    onHoverSimilarPage?: (url: string | null) => void
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export function NodeDetailsWindow({
    nodeUrl,
    nodeTitle,
    crawlId,
    embeddingsReady = true, // Default true for history views
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onClose,
    onSimilarPagesFound,
    onHoverSimilarPage,
}: NodeDetailsWindowProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [isFindingSimilar, setIsFindingSimilar] = useState(false)
    const [summary, setSummary] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [displayedText, setDisplayedText] = useState("")
    const [isRevealing, setIsRevealing] = useState(false)
    const [similarPages, setSimilarPages] = useState<SimilarPage[]>([])
    const [copied, setCopied] = useState(false)

    // Outlinks state
    const [outlinks, setOutlinks] = useState<OutlinkPage[]>([])
    const [showOutlinks, setShowOutlinks] = useState(false)
    const [isLoadingOutlinks, setIsLoadingOutlinks] = useState(false)
    const [outlinksPagination, setOutlinksPagination] = useState({
        page: 1,
        total: 0,
        totalPages: 1,
        perPage: 50,
    })

    const fetchOutlinks = async (pageNum = 1) => {
        if (!crawlId) return
        setIsLoadingOutlinks(true)
        try {
            const response = await fetch(
                `${API_URL}/api/crawl/${crawlId}/page/outlinks?url=${encodeURIComponent(nodeUrl)}&page=${pageNum}&per_page=50`,
                { credentials: "include" },
            )
            if (response.ok) {
                const data = await response.json()
                setOutlinks(data.links)
                setOutlinksPagination({
                    page: data.page,
                    total: data.total,
                    totalPages: data.total_pages,
                    perPage: data.per_page,
                })
            }
        } catch (err) {
            console.error("Failed to fetch outlinks:", err)
        } finally {
            setIsLoadingOutlinks(false)
        }
    }

    const handleViewOutlinks = async () => {
        if (showOutlinks) {
            setShowOutlinks(false)
            return
        }
        setShowOutlinks(true)
        setSummary(null)
        setSimilarPages([])
        if (onSimilarPagesFound) onSimilarPagesFound([])
        await fetchOutlinks(1)
    }

    const handleCopySummary = async () => {
        if (!summary) return
        try {
            await navigator.clipboard.writeText(summary)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error("Failed to copy:", err)
        }
    }

    const truncateUrl = (url: string, maxLength = 60) => {
        if (url.length <= maxLength) return url
        return url.substring(0, maxLength) + "..."
    }

    const handleVisit = () => {
        window.open(nodeUrl, "_blank", "noopener,noreferrer")
    }

    const handleSummarize = async () => {
        setIsLoading(true)
        setError(null)
        setSummary(null)
        setDisplayedText("")
        setSimilarPages([])
        setShowOutlinks(false)
        if (onSimilarPagesFound) onSimilarPagesFound([])

        try {
            const response = await fetch(`${API_URL}/api/page/summarize?url=${encodeURIComponent(nodeUrl)}`, {
                method: "POST",
            })

            if (!response.ok) {
                throw new Error("Failed to fetch summary")
            }

            const data = await response.json()
            const fullSummary = data.summary || "No summary available"
            setSummary(fullSummary)
            setIsRevealing(true)
        } catch (err) {
            console.error("[v0] Error fetching summary:", err)
            setError("Failed to generate summary. Please try again.")
        } finally {
            setIsLoading(false)
        }
    }

    const handleFindSimilar = async () => {
        setIsFindingSimilar(true)
        setError(null)
        setSimilarPages([])
        setSummary(null)
        setDisplayedText("")
        setShowOutlinks(false)

        try {
            const response = await fetch(`${API_URL}/api/page/similar?url=${encodeURIComponent(nodeUrl)}&limit=10`, {
                credentials: "include",
            })

            if (!response.ok) {
                throw new Error("Failed to find similar pages")
            }

            const data: SimilarPage[] = await response.json()
            setSimilarPages(data)

            if (onSimilarPagesFound) {
                onSimilarPagesFound(data)
            }
        } catch (err) {
            console.error("[v0] Error finding similar pages:", err)
            setError("Failed to find similar pages. Please try again.")
        } finally {
            setIsFindingSimilar(false)
        }
    }

    // Progressive text reveal effect
    useEffect(() => {
        if (!summary || !isRevealing) return

        let currentIndex = 0
        const revealInterval = setInterval(() => {
            if (currentIndex <= summary.length) {
                setDisplayedText(summary.substring(0, currentIndex))
                currentIndex += 2
            } else {
                setIsRevealing(false)
                clearInterval(revealInterval)
            }
        }, 20)

        return () => clearInterval(revealInterval)
    }, [summary, isRevealing])

    return (
        <div className="space-y-4">
            {/* Page info */}
            <div>
                <h3 className="text-sm font-semibold text-white leading-tight mb-2">{nodeTitle || "Untitled Page"}</h3>
                <p className="text-xs text-slate-400 break-all">{truncateUrl(nodeUrl)}</p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
                <Button
                    variant="ghost"
                    onClick={handleVisit}
                    className="flex-1 text-white border border-violet-500/30 hover:bg-violet-500/20 hover:border-violet-500/50 transition-all"
                >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Visit
                </Button>
                <Button
                    onClick={handleSummarize}
                    disabled={isLoading}
                    className="flex-1 bg-gradient-to-r from-violet-600/90 to-purple-600/90 hover:from-violet-500 hover:to-purple-500 text-white font-medium transition-all"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Loading...
                        </>
                    ) : (
                        <>
                            <FileText className="w-4 h-4 mr-2" />
                            Summarize
                        </>
                    )}
                </Button>
            </div>

            {/* Similar Pages button */}
            <Button
                onClick={handleFindSimilar}
                disabled={isFindingSimilar || !embeddingsReady}
                className={`w-full font-medium transition-all ${!embeddingsReady
                    ? "bg-slate-600/50 text-slate-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-cyan-600/90 to-teal-600/90 hover:from-cyan-500 hover:to-teal-500 text-white"
                    }`}
            >
                {isFindingSimilar ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Finding similar...
                    </>
                ) : !embeddingsReady ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating embeddings...
                    </>
                ) : (
                    <>
                        <Target className="w-4 h-4 mr-2" />
                        Find Similar Pages
                    </>
                )}
            </Button>

            {/* View Outlinks button */}
            {crawlId && (
                <Button
                    onClick={handleViewOutlinks}
                    disabled={isLoadingOutlinks}
                    className={`w-full font-medium transition-all ${showOutlinks
                        ? "bg-indigo-500/20 border border-indigo-500/50 text-indigo-300 hover:bg-indigo-500/30"
                        : "bg-gradient-to-r from-indigo-600/90 to-purple-600/90 hover:from-indigo-500 hover:to-purple-500 text-white"
                        }`}
                >
                    {isLoadingOutlinks ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Loading...
                        </>
                    ) : (
                        <>
                            <Link2 className="w-4 h-4 mr-2" />
                            {showOutlinks
                                ? "Hide Outlinks"
                                : `View Outlinks${outlinksPagination.total > 0 ? ` (${outlinksPagination.total})` : ""}`}
                        </>
                    )}
                </Button>
            )}

            {/* Outlinks list */}
            {showOutlinks && (
                <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-lg p-3 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-3">
                        {outlinksPagination.totalPages > 1 && (
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => fetchOutlinks(outlinksPagination.page - 1)}
                                    disabled={outlinksPagination.page === 1 || isLoadingOutlinks}
                                    className="h-6 w-6 p-0 text-indigo-400 hover:text-white hover:bg-indigo-500/20"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <span className="text-xs text-indigo-400 min-w-[50px] text-center">
                                    {outlinksPagination.page}/{outlinksPagination.totalPages}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => fetchOutlinks(outlinksPagination.page + 1)}
                                    disabled={outlinksPagination.page === outlinksPagination.totalPages || isLoadingOutlinks}
                                    className="h-6 w-6 p-0 text-indigo-400 hover:text-white hover:bg-indigo-500/20"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* List of outlinks */}
                    <div className="space-y-2 max-h-[250px] overflow-y-auto">
                        {outlinks.length === 0 ? (
                            <p className="text-xs text-indigo-300/60 text-center py-4">No discovered outlinks</p>
                        ) : (
                            outlinks.map((link) => (
                                <div
                                    key={link.url}
                                    className="flex items-start gap-2 text-xs p-2 rounded bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors cursor-pointer"
                                    onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white truncate">{link.title || "Untitled"}</p>
                                        <p className="text-slate-400 truncate text-[10px]">{link.url}</p>
                                    </div>
                                    <ExternalLink className="w-3 h-3 text-indigo-400/60 flex-shrink-0 mt-0.5" />
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Similar pages results */}
            {similarPages.length > 0 && (
                <div className="bg-cyan-950/30 border border-cyan-500/20 rounded-lg p-3 backdrop-blur-sm max-h-[200px] overflow-y-auto">
                    <p className="text-xs text-cyan-300 mb-2 font-medium">
                        {similarPages.length} similar page{similarPages.length > 1 ? "s" : ""} found
                    </p>
                    <div className="space-y-2">
                        {similarPages.map((page) => (
                            <div
                                key={page.url}
                                className="flex items-start gap-2 text-xs p-2 rounded bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors cursor-pointer"
                                onMouseEnter={() => onHoverSimilarPage?.(page.url)}
                                onMouseLeave={() => onHoverSimilarPage?.(null)}
                            >
                                <span className="text-cyan-400 font-mono">{(page.score * 100).toFixed(0)}%</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white truncate">{page.title || "Untitled"}</p>
                                    <p className="text-slate-400 truncate text-[10px]">{page.url}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Summary display with progressive reveal */}
            {summary && (
                <div className="bg-violet-950/30 border border-violet-500/20 rounded-lg p-4 backdrop-blur-sm max-h-[400px] overflow-y-auto">
                    <div className="relative">
                        {/* Display the revealed text */}
                        <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{displayedText}</p>

                        {/* Blur effect on unrevealed portion */}
                        {isRevealing && (
                            <div className="absolute inset-0 pointer-events-none">
                                <div
                                    className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-violet-950/30 to-transparent backdrop-blur-sm"
                                    style={{
                                        maskImage: "linear-gradient(to top, black, transparent)",
                                        WebkitMaskImage: "linear-gradient(to top, black, transparent)",
                                    }}
                                />
                            </div>
                        )}

                        {/* Cursor effect while revealing */}
                        {isRevealing && <span className="inline-block w-0.5 h-4 bg-violet-400 animate-pulse ml-0.5" />}
                    </div>

                    {/* Copy button */}
                    {!isRevealing && (
                        <Button
                            onClick={handleCopySummary}
                            variant="ghost"
                            size="sm"
                            className="mt-3 w-full text-violet-300 border border-violet-500/30 hover:bg-violet-500/20 hover:text-white transition-all"
                        >
                            {copied ? (
                                <>
                                    <Check className="w-4 h-4 mr-2 text-green-400" />
                                    Copied!
                                </>
                            ) : (
                                <>
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy Summary
                                </>
                            )}
                        </Button>
                    )}
                </div>
            )}

            {/* Error display */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <p className="text-sm text-red-300">{error}</p>
                </div>
            )}
        </div>
    )
}
