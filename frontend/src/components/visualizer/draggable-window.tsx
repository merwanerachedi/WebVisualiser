"use client"

import type React from "react"

import { useState, useRef, useEffect, type ReactNode } from "react"
import { Minus, X, Maximize2 } from "lucide-react"
import { useWindowManager } from "./window-manager-context"

interface DraggableWindowProps {
  id: string
  title: string
  children: ReactNode
  defaultPosition?: { x: number; y: number }
  onClose?: () => void
  initialMinimized?: boolean
  width?: number
}

export function DraggableWindow({
  id,
  title,
  children,
  defaultPosition = { x: 100, y: 100 },
  onClose,
  initialMinimized = false,
  width = 400,
}: DraggableWindowProps) {
  const [position, setPosition] = useState(defaultPosition)
  const [isDragging, setIsDragging] = useState(false)
  const [isMinimized, setIsMinimized] = useState(initialMinimized)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const windowRef = useRef<HTMLDivElement>(null)

  const { registerWindow, unregisterWindow, bringToFront, getZIndex } = useWindowManager()

  // Register window on mount, unregister on unmount
  useEffect(() => {
    registerWindow(id)
    return () => unregisterWindow(id)
  }, [id, registerWindow, unregisterWindow])

  const handleWindowMouseDown = () => {
    bringToFront(id)
  }

  const handleTitleBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    bringToFront(id)
    if (windowRef.current) {
      const rect = windowRef.current.getBoundingClientRect()
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      })
      setIsDragging(true)
    }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, dragOffset])

  return (
    <div
      ref={windowRef}
      className="absolute rounded-xl border border-violet-500/20 bg-black/90 shadow-2xl backdrop-blur-xl"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${width}px`,
        zIndex: getZIndex(id),
        cursor: isDragging ? "grabbing" : "default",
      }}
      onMouseDown={handleWindowMouseDown}
    >
      {/* Subtle violet gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-purple-500/5 rounded-xl pointer-events-none" />

      {/* Title Bar */}
      <div
        className="relative flex items-center justify-between rounded-t-xl bg-violet-950/40 border-b border-violet-500/20 px-4 py-2 cursor-grab active:cursor-grabbing"
        onMouseDown={handleTitleBarMouseDown}
      >
        <span className="font-mono text-sm font-semibold text-white">{title}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="rounded p-1 text-white/70 hover:bg-violet-500/20 hover:text-white transition-colors"
          >
            {isMinimized ? <Maximize2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded p-1 text-white/70 hover:bg-violet-500/20 hover:text-red-400 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {!isMinimized && <div className="relative p-4">{children}</div>}
    </div>
  )
}
