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
        <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-black/50 backdrop-blur-xl">
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
                {/* Logo & Title */}
                <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
                    <Globe className="h-6 w-6 text-cyan-400" />
                    <span className="text-lg font-semibold text-white">Web Visualizer</span>
                </Link>

                {/* Navigation Links */}
                <div className="flex items-center gap-4">
                    {isAuthenticated && (
                        <Link href="/history">
                            <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white">
                                <History className="mr-2 h-4 w-4" />
                                History
                            </Button>
                        </Link>
                    )}

                    {/* Auth Section */}
                    {isLoading ? (
                        <div className="h-8 w-20 animate-pulse rounded bg-gray-800" />
                    ) : isAuthenticated ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white">
                                    <User className="mr-2 h-4 w-4" />
                                    {user?.email?.split("@")[0]}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem className="text-gray-400" disabled>
                                    {user?.email}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={logout} className="text-red-400">
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Log out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Link href="/login">
                                <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white">
                                    Log in
                                </Button>
                            </Link>
                            <Link href="/register">
                                <Button
                                    size="sm"
                                    className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-600 hover:to-blue-600"
                                >
                                    Sign up
                                </Button>
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    )
}
