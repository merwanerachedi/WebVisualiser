"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

interface WindowManagerContextType {
    registerWindow: (windowId: string) => void
    unregisterWindow: (windowId: string) => void
    bringToFront: (windowId: string) => void
    getZIndex: (windowId: string) => number
}

const WindowManagerContext = createContext<WindowManagerContextType | null>(null)

const BASE_Z_INDEX = 20

export function WindowManagerProvider({ children }: { children: ReactNode }) {
    // Array of window IDs in order (last = front)
    const [windowOrder, setWindowOrder] = useState<string[]>([])

    const registerWindow = useCallback((windowId: string) => {
        setWindowOrder((prev) => {
            if (prev.includes(windowId)) return prev
            return [...prev, windowId]
        })
    }, [])

    const unregisterWindow = useCallback((windowId: string) => {
        setWindowOrder((prev) => prev.filter((id) => id !== windowId))
    }, [])

    const bringToFront = useCallback((windowId: string) => {
        setWindowOrder((prev) => {
            // If already at front, do nothing
            if (prev[prev.length - 1] === windowId) return prev
            // Move to end (front)
            return [...prev.filter((id) => id !== windowId), windowId]
        })
    }, [])

    const getZIndex = useCallback(
        (windowId: string) => {
            const index = windowOrder.indexOf(windowId)
            return BASE_Z_INDEX + (index === -1 ? 0 : index)
        },
        [windowOrder]
    )

    return (
        <WindowManagerContext.Provider
            value={{ registerWindow, unregisterWindow, bringToFront, getZIndex }}
        >
            {children}
        </WindowManagerContext.Provider>
    )
}

export function useWindowManager() {
    const context = useContext(WindowManagerContext)
    if (!context) {
        throw new Error("useWindowManager must be used within a WindowManagerProvider")
    }
    return context
}
