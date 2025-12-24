"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Globe, Loader2, ArrowLeft } from "lucide-react"

export default function RegisterPage() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [error, setError] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const { register } = useAuth()
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")

        if (password !== confirmPassword) {
            setError("Passwords do not match")
            return
        }

        if (password.length < 6) {
            setError("Password must be at least 6 characters")
            return
        }

        setIsLoading(true)

        const result = await register(email, password)

        if (result.success) {
            router.push("/")
        } else {
            setError(result.error || "Registration failed")
        }
        setIsLoading(false)
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
            {/* Background effect */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent" />
            </div>

            <div className="relative z-10 w-full max-w-md px-4">
                {/* Back link */}
                <Link
                    href="/"
                    className="mb-8 inline-flex items-center text-sm text-gray-400 transition-colors hover:text-cyan-400"
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to home
                </Link>

                {/* Card */}
                <div className="rounded-xl border border-white/10 bg-gray-900/50 p-8 backdrop-blur-xl">
                    {/* Header */}
                    <div className="mb-8 text-center">
                        <div className="mb-4 inline-flex items-center justify-center rounded-full bg-blue-500/10 p-3">
                            <Globe className="h-8 w-8 text-blue-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-white">Create an account</h1>
                        <p className="mt-2 text-gray-400">Save your crawls and access them anytime</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
                                {error}
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-gray-300">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="border-white/10 bg-gray-800/50 text-white placeholder:text-gray-500"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-gray-300">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="border-white/10 bg-gray-800/50 text-white placeholder:text-gray-500"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword" className="text-gray-300">Confirm Password</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                className="border-white/10 bg-gray-800/50 text-white placeholder:text-gray-500"
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating account...
                                </>
                            ) : (
                                "Create account"
                            )}
                        </Button>
                    </form>

                    {/* Footer */}
                    <p className="mt-6 text-center text-sm text-gray-400">
                        Already have an account?{" "}
                        <Link href="/login" className="text-cyan-400 hover:underline">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
