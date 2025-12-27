"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Globe, Trash2, ExternalLink, Loader2, Calendar, Link2, FileText, AlertCircle } from "lucide-react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface CrawlHistoryItem {
    crawl_id: string
    root_url: string
    status: string
    started_at: string
    completed_at: string | null
    pages_crawled: number
    links_found: number
    crawl_mode: string
    algorithm: string
}

export default function HistoryPage() {
    const { isAuthenticated, isLoading: authLoading } = useAuth()
    const router = useRouter()
    const [crawls, setCrawls] = useState<CrawlHistoryItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState("")
    const [deletingId, setDeletingId] = useState<string | null>(null)

    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            router.push("/login")
        }
    }, [authLoading, isAuthenticated, router])

    useEffect(() => {
        if (isAuthenticated) {
            fetchCrawls()
        }
    }, [isAuthenticated])

    const fetchCrawls = async () => {
        try {
            const response = await api.get("/api/crawls")
            setCrawls(response.data)
        } catch {
            setError("Failed to load crawl history")
        } finally {
            setIsLoading(false)
        }
    }

    const deleteCrawl = async (crawlId: string) => {
        setDeletingId(crawlId)
        try {
            await api.delete(`/api/crawl/${crawlId}`)
            setCrawls(crawls.filter((c) => c.crawl_id !== crawlId))
        } catch {
            setError("Failed to delete crawl")
        } finally {
            setDeletingId(null)
        }
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        })
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case "completed":
                return "bg-green-500/20 text-green-400 border-green-500/30"
            case "running":
                return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
            case "stopped":
                return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
            default:
                return "bg-gray-500/20 text-gray-400 border-gray-500/30"
        }
    }

    if (authLoading || (!isAuthenticated && !authLoading)) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
            </div>
        )
    }

    return (
        <div className="min-h-screen relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
                {/* Animated stars */}
                <div className="absolute inset-0">
                    {[...Array(50)].map((_, i) => (
                        <div
                            key={i}
                            className="absolute h-1 w-1 rounded-full bg-white animate-pulse"
                            style={{
                                left: `${Math.random() * 100}%`,
                                top: `${Math.random() * 100}%`,
                                animationDelay: `${Math.random() * 3}s`,
                                animationDuration: `${2 + Math.random() * 3}s`,
                                opacity: Math.random() * 0.5 + 0.2,
                            }}
                        />
                    ))}
                </div>
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-purple-900/10 to-transparent" />
            </div>

            {/* Content with pt-24 for navbar spacing */}
            <div className="relative z-10 mx-auto max-w-6xl px-4 pt-24 pb-8">
                <div className="mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
                    <h1 className="text-5xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent mb-3 drop-shadow-[0_0_30px_rgba(34,211,238,0.3)]">
                        Crawl History
                    </h1>
                    <p className="text-lg text-gray-400">View and manage your previous crawls</p>
                </div>

                {/* Error message */}
                {error && (
                    <div className="mb-6 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-red-400 backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-300">
                        <AlertCircle className="h-5 w-5" />
                        {error}
                    </div>
                )}

                {/* Content */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
                    </div>
                ) : crawls.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in-95 duration-500">
                        <div className="rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 p-8 shadow-xl shadow-cyan-500/20 backdrop-blur-sm border border-white/10 mb-6">
                            <Globe className="h-20 w-20 text-cyan-400" />
                        </div>
                        <h2 className="text-2xl font-semibold text-white mb-3">No crawls yet</h2>
                        <p className="text-gray-400 text-lg mb-8 max-w-md">
                            Start your first web crawl to explore and visualize website structures
                        </p>
                        <Link href="/">
                            <Button className="bg-gradient-to-r from-cyan-500 to-purple-600 text-white hover:from-cyan-600 hover:to-purple-700 shadow-lg shadow-cyan-500/30 px-8 py-6 text-lg rounded-xl transition-all hover:scale-105">
                                Start Crawling
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {crawls.map((crawl, index) => (
                            <div
                                key={crawl.crawl_id}
                                className="group rounded-2xl border border-white/10 bg-gray-900/50 p-6 backdrop-blur-sm transition-all hover:border-cyan-500/30 hover:bg-gray-900/70 hover:shadow-xl hover:shadow-cyan-500/10 animate-in fade-in slide-in-from-bottom-4 duration-500"
                                style={{ animationDelay: `${index * 100}ms` }}
                            >
                                <div className="flex items-start justify-between gap-6">
                                    <div className="flex-1 overflow-hidden space-y-4">
                                        {/* URL with icon glow */}
                                        <div className="flex items-center gap-3">
                                            <div className="rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 p-2 shadow-lg shadow-cyan-500/20 group-hover:shadow-cyan-500/40 transition-all">
                                                <Globe className="h-5 w-5 text-cyan-400" />
                                            </div>
                                            <a
                                                href={crawl.root_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="truncate text-lg font-medium text-white hover:text-cyan-400 transition-colors flex items-center gap-2"
                                            >
                                                {crawl.root_url}
                                                <ExternalLink className="h-4 w-4 text-gray-500 group-hover:text-cyan-500 transition-colors" />
                                            </a>
                                        </div>

                                        {/* Stats grid with enhanced design */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <div className="rounded-lg bg-gradient-to-br from-gray-800/50 to-gray-800/30 border border-white/5 p-3 backdrop-blur-sm">
                                                <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                                                    <Calendar className="h-3.5 w-3.5" />
                                                    <span>Started</span>
                                                </div>
                                                <p className="text-white font-medium text-sm">{formatDate(crawl.started_at)}</p>
                                            </div>
                                            <div className="rounded-lg bg-gradient-to-br from-gray-800/50 to-gray-800/30 border border-white/5 p-3 backdrop-blur-sm">
                                                <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                                                    <FileText className="h-3.5 w-3.5" />
                                                    <span>Pages</span>
                                                </div>
                                                <p className="text-white font-medium text-sm">{crawl.pages_crawled}</p>
                                            </div>
                                            <div className="rounded-lg bg-gradient-to-br from-gray-800/50 to-gray-800/30 border border-white/5 p-3 backdrop-blur-sm">
                                                <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                                                    <Link2 className="h-3.5 w-3.5" />
                                                    <span>Links</span>
                                                </div>
                                                <p className="text-white font-medium text-sm">{crawl.links_found}</p>
                                            </div>
                                            <div className="rounded-lg bg-gradient-to-br from-gray-800/50 to-gray-800/30 border border-white/5 p-3 backdrop-blur-sm">
                                                <div className="text-gray-400 text-xs mb-1">Status</div>
                                                <span
                                                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusColor(crawl.status)}`}
                                                >
                                                    {crawl.status}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Tags */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-full bg-gradient-to-r from-gray-800/80 to-gray-700/80 border border-white/5 px-3 py-1 text-xs text-gray-300 font-medium">
                                                {crawl.crawl_mode}
                                            </span>
                                            <span className="rounded-full bg-gradient-to-r from-gray-800/80 to-gray-700/80 border border-white/5 px-3 py-1 text-xs text-gray-300 font-medium">
                                                {crawl.algorithm}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Actions with enhanced styling */}
                                    <div className="flex flex-col gap-3">
                                        <Link href={`/?crawl_id=${crawl.crawl_id}`}>
                                            <Button className="bg-gradient-to-r from-cyan-500 to-purple-600 text-white hover:from-cyan-600 hover:to-purple-700 shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 transition-all hover:scale-105 border-0 w-full">
                                                View Graph
                                            </Button>
                                        </Link>

                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50 hover:shadow-lg hover:shadow-red-500/20 transition-all w-full bg-transparent"
                                                    disabled={deletingId === crawl.crawl_id}
                                                >
                                                    {deletingId === crawl.crawl_id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-4 w-4" />
                                                    )}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent className="border-white/10 bg-gray-900">
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle className="text-white">Delete this crawl?</AlertDialogTitle>
                                                    <AlertDialogDescription className="text-gray-400">
                                                        This will permanently delete the crawl data. This action cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel className="border-white/10 bg-gray-800 text-white hover:bg-gray-700">
                                                        Cancel
                                                    </AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => deleteCrawl(crawl.crawl_id)}
                                                        className="bg-red-600 hover:bg-red-700"
                                                    >
                                                        Delete
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
