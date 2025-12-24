"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"

interface User {
    user_id: string
    email: string
    created_at: string
}

interface AuthContextType {
    user: User | null
    isLoading: boolean
    isAuthenticated: boolean
    login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
    register: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
    logout: () => Promise<void>
    checkAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const checkAuth = useCallback(async () => {
        try {
            const response = await fetch(`${API_URL}/api/auth/me`, {
                credentials: "include",
            })
            if (response.ok) {
                const userData = await response.json()
                setUser(userData)
            } else {
                setUser(null)
            }
        } catch {
            setUser(null)
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        checkAuth()
    }, [checkAuth])

    const login = async (email: string, password: string) => {
        try {
            const response = await fetch(`${API_URL}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ email, password }),
            })

            if (response.ok) {
                await checkAuth()
                return { success: true }
            } else {
                const error = await response.json()
                return { success: false, error: error.detail || "Login failed" }
            }
        } catch {
            return { success: false, error: "Network error" }
        }
    }

    const register = async (email: string, password: string) => {
        try {
            const response = await fetch(`${API_URL}/api/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ email, password }),
            })

            if (response.ok) {
                // Auto-login after registration
                return await login(email, password)
            } else {
                const error = await response.json()
                return { success: false, error: error.detail || "Registration failed" }
            }
        } catch {
            return { success: false, error: "Network error" }
        }
    }

    const logout = async () => {
        try {
            await fetch(`${API_URL}/api/auth/logout`, {
                method: "POST",
                credentials: "include",
            })
        } catch {
            // Ignore errors
        }
        setUser(null)
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                isAuthenticated: !!user,
                login,
                register,
                logout,
                checkAuth,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider")
    }
    return context
}
