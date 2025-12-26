"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
    Globe,
    Trash2,
    ExternalLink,
    Loader2,
    Calendar,
    Link2,
    FileText,
    AlertCircle
} from "lucide-react"
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
            setCrawls(crawls.filter(c => c.crawl_id !== crawlId))
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
                return "bg-green-500/20 text-green-400"
            case "running":
                return "bg-cyan-500/20 text-cyan-400"
            case "stopped":
                return "bg-yellow-500/20 text-yellow-400"
            default:
                return "bg-gray-500/20 text-gray-400"
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
        <div className="min-h-screen relative">
            {/* Background - covers entire screen including behind navbar */}
            <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/10 via-transparent to-transparent" />
            </div>

            {/* Content with pt-24 for navbar spacing */}
            <div className="relative z-10 mx-auto max-w-5xl px-4 pt-24 pb-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white">Crawl History</h1>
                    <p className="mt-2 text-gray-400">View and manage your previous crawls</p>
                </div>

                {/* Error message */}
                {error && (
                    <div className="mb-6 flex items-center gap-2 rounded-lg bg-red-500/10 p-4 text-red-400">
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
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <Globe className="mb-4 h-16 w-16 text-gray-600" />
                        <h2 className="text-xl font-semibold text-gray-300">No crawls yet</h2>
                        <p className="mt-2 text-gray-500">
                            Start your first crawl to see it here
                        </p>
                        <Link href="/">
                            <Button className="mt-6 bg-gradient-to-r from-cyan-500 to-blue-500 text-white">
                                Start Crawling
                            </Button>
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {crawls.map((crawl) => (
                            <div
                                key={crawl.crawl_id}
                                className="group rounded-xl border border-white/10 bg-gray-900/50 p-5 backdrop-blur-sm transition-all hover:border-white/20 hover:bg-gray-900/70"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 overflow-hidden">
                                        {/* URL */}
                                        <div className="flex items-center gap-2">
                                            <Globe className="h-4 w-4 shrink-0 text-cyan-400" />
                                            <a
                                                href={crawl.root_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="truncate font-medium text-white hover:text-cyan-400"
                                            >
                                                {crawl.root_url}
                                            </a>
                                            <ExternalLink className="h-3 w-3 shrink-0 text-gray-500" />
                                        </div>

                                        {/* Meta info */}
                                        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-400">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="h-4 w-4" />
                                                {formatDate(crawl.started_at)}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <FileText className="h-4 w-4" />
                                                {crawl.pages_crawled} pages
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Link2 className="h-4 w-4" />
                                                {crawl.links_found} links
                                            </span>
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(crawl.status)}`}>
                                                {crawl.status}
                                            </span>
                                            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs">
                                                {crawl.crawl_mode}
                                            </span>
                                            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs">
                                                {crawl.algorithm}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2">
                                        <Link href={`/?crawl_id=${crawl.crawl_id}`}>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                                            >
                                                View Graph
                                            </Button>
                                        </Link>

                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="border-red-500/30 text-red-400 hover:bg-red-500/10"
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
