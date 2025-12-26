"use client"

import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Globe, History, LogOut, User } from "lucide-react"

export function Navbar() {
    const { user, isAuthenticated, logout, isLoading } = useAuth()

    return (
        <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-6xl">
            <div className="border border-white/10 bg-slate-900/40 backdrop-blur-md rounded-2xl shadow-2xl shadow-black/50 px-6 py-3 transition-all hover:bg-slate-900/50 hover:shadow-violet-500/10">
                <div className="flex items-center justify-between">
                    {/* Logo & Title */}
                    <Link href="/" className="flex items-center gap-3 group transition-all">
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-purple-500 rounded-lg blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
                            <Globe className="relative h-7 w-7 text-violet-400 group-hover:text-violet-300 transition-colors" />
                        </div>
                        <span className="text-xl font-bold bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
                            Web Visualizer
                        </span>
                    </Link>

                    {/* Navigation Links */}
                    <div className="flex items-center gap-3">
                        {isAuthenticated && (
                            <Link href="/history">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-slate-300 hover:text-white hover:bg-white/10 transition-all"
                                >
                                    <History className="mr-2 h-4 w-4" />
                                    History
                                </Button>
                            </Link>
                        )}

                        {/* Auth Section */}
                        {isLoading ? (
                            <div className="h-9 w-24 animate-pulse rounded-lg bg-white/10" />
                        ) : isAuthenticated ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-slate-300 hover:text-white hover:bg-white/10 border border-white/10 transition-all"
                                    >
                                        <User className="mr-2 h-4 w-4" />
                                        {user?.email?.split("@")[0]}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48 bg-slate-900/95 backdrop-blur-xl border-white/10">
                                    <DropdownMenuItem className="text-slate-400" disabled>
                                        {user?.email}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-white/10" />
                                    <DropdownMenuItem onClick={logout} className="text-red-400 focus:text-red-300 focus:bg-red-500/10">
                                        <LogOut className="mr-2 h-4 w-4" />
                                        Log out
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Link href="/login">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-slate-300 hover:text-white hover:bg-white/10 transition-all"
                                    >
                                        Log in
                                    </Button>
                                </Link>
                                <Link href="/register">
                                    <Button
                                        size="sm"
                                        className="relative overflow-hidden bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-medium shadow-lg shadow-violet-500/25 transition-all"
                                    >
                                        Sign up
                                    </Button>
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    )
}
