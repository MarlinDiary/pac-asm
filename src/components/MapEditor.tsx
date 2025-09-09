'use client'

import { useState, useRef, useCallback } from 'react'
import MapRenderer from '@/components/MapRenderer'
import MapEditorToolbar from '@/components/MapEditorToolbar'
import { GameMap, MAPS } from '@/data/maps'

export type ToolType = 'air' | 'grass' | 'dot' | 'pacman' | 'ghost'

interface ViewState {
  scale: number
  offsetX: number
  offsetY: number
}

export default function MapEditor() {
  const [currentMap, setCurrentMap] = useState<GameMap>(MAPS[0])
  const [selectedTool, setSelectedTool] = useState<ToolType>('grass')
  const [viewState, setViewState] = useState<ViewState>({
    scale: 1,
    offsetX: 0,
    offsetY: 0
  })
  const [isDragging, setIsDragging] = useState(false)
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const handleToolSelect = (tool: ToolType) => {
    setSelectedTool(tool)
  }

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    
    if (e.ctrlKey) {
      // Zoom on pinch gesture (ctrlKey is set during pinch on trackpad)
      const scaleFactor = e.deltaY > 0 ? 0.93 : 1.07
      const newScale = Math.max(0.5, Math.min(2, viewState.scale * scaleFactor))

      // Zoom around the center of the world (map), keeping that point fixed on screen
      const tileSize = currentMap.tileSize || 64
      const worldCenterX = (currentMap.width * tileSize) / 2
      const worldCenterY = (currentMap.height * tileSize) / 2

      const newOffsetX = viewState.offsetX + (viewState.scale - newScale) * worldCenterX
      const newOffsetY = viewState.offsetY + (viewState.scale - newScale) * worldCenterY

      setViewState({
        scale: newScale,
        offsetX: newOffsetX,
        offsetY: newOffsetY
      })
    } else {
      // Pan on two-finger scroll (trackpad) or regular mouse wheel
      setViewState(prev => ({
        ...prev,
        offsetX: prev.offsetX - e.deltaX,
        offsetY: prev.offsetY - e.deltaY
      }))
    }
  }, [viewState])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) { // Middle mouse or Ctrl+Left
      e.preventDefault()
      setIsDragging(true)
      setLastMousePos({ x: e.clientX, y: e.clientY })
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      const deltaX = e.clientX - lastMousePos.x
      const deltaY = e.clientY - lastMousePos.y
      
      setViewState(prev => ({
        ...prev,
        offsetX: prev.offsetX + deltaX,
        offsetY: prev.offsetY + deltaY
      }))
      
      setLastMousePos({ x: e.clientX, y: e.clientY })
    }
  }, [isDragging, lastMousePos])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const resetView = useCallback(() => {
    setViewState({ scale: 1, offsetX: 0, offsetY: 0 })
  }, [])


  return (
    <div 
      className="h-screen w-full overflow-hidden bg-[#f0f0f0] dark:bg-[#0f0f0f] relative"
      style={{
        touchAction: 'none', // Disable all touch gestures
        userSelect: 'none'   // Prevent text selection
      }}
    >
      <div 
        ref={containerRef}
        className="h-full w-full flex items-center justify-center"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          cursor: isDragging ? 'grabbing' : 'default',
          touchAction: 'none' // Extra protection for touch events
        }}
      >
        <div 
          className="relative"
          style={{
            transform: `translate(${viewState.offsetX}px, ${viewState.offsetY}px) scale(${viewState.scale})`,
            transformOrigin: 'top left',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out'
          }}
        >
          <MapRenderer map={currentMap} />
        </div>
      </div>
      
      {/* Zoom percentage - clickable to reset */}
      <button
        onClick={resetView}
        className="absolute bottom-4 right-4 text-base font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 px-3 py-2 rounded-lg transition-all duration-200 cursor-pointer"
      >
        {Math.round(viewState.scale * 100)}%
      </button>
      
      <MapEditorToolbar 
        selectedTool={selectedTool}
        onToolSelect={handleToolSelect}
      />
    </div>
  )
}
