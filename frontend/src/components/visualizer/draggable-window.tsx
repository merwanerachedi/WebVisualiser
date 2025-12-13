"use client"

import type React from "react"

import { useState, useRef, useEffect, type ReactNode } from "react"
import { Minus, X, Maximize2 } from "lucide-react"

interface DraggableWindowProps {
  title: string
  children: ReactNode
  defaultPosition?: { x: number; y: number }
  onClose?: () => void
  initialMinimized?: boolean
  width?: number
}

export function DraggableWindow({
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

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
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
      className="absolute z-20 rounded-xl border border-white/20 bg-black/80 shadow-2xl backdrop-blur-sm"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${width}px`,
        cursor: isDragging ? "grabbing" : "default",
      }}
    >
      {/* Title Bar */}
      <div
        className="flex items-center justify-between rounded-t-xl bg-white/10 px-4 py-2 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      >
        <span className="font-mono text-sm font-semibold text-white">{title}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"
          >
            {isMinimized ? <Maximize2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          </button>
          {onClose && (
            <button onClick={onClose} className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-red-400">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {!isMinimized && <div className="p-4">{children}</div>}
    </div>
  )
}
