'use client'

import { useState, useRef, useCallback } from 'react'
import MapRenderer from '@/components/MapRenderer'
import MapGridOverlay from '@/components/MapGridOverlay'
import MapEditorToolbar from '@/components/MapEditorToolbar'
import { GameMap, MAPS } from '@/data/maps'

export type ToolType = 'air' | 'grass' | 'dot' | 'pacman' | 'ghost'

interface ViewState {
  scale: number
  offsetX: number
  offsetY: number
}

export default function MapEditor() {
  // Create a large empty canvas for editing
  const canvasSize = 100 // 100x100 grid
  const emptyCanvas: GameMap = {
    id: 'editor-canvas',
    name: 'Editor Canvas',
    width: canvasSize,
    height: canvasSize,
    tileSize: 20,
    tiles: Array(canvasSize).fill(null).map(() => Array(canvasSize).fill('%')),
    playerPosition: { row: 50, col: 50, direction: 'right' },
    ghostPositions: [],
    playerAnimation: { direction: 'right' },
    ghostAnimations: [],
    waterBackground: { tilesX: 8, tilesY: 6 }
  }
  
  const [currentMap, setCurrentMap] = useState<GameMap>(emptyCanvas)
  const [selectedTool, setSelectedTool] = useState<ToolType>('grass')
  const [viewState, setViewState] = useState<ViewState>({
    scale: 1,
    offsetX: 0,
    offsetY: 0
  })
  const containerRef = useRef<HTMLDivElement>(null)

  const handleToolSelect = (tool: ToolType) => {
    setSelectedTool(tool)
  }

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    
    if (e.ctrlKey) {
      // Discrete scaling for responsiveness
      const scaleFactor = e.deltaY > 0 ? 0.8 : 1.2
      const newScale = Math.max(1, Math.min(3, viewState.scale * scaleFactor))

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
    }
    // Remove pan functionality - only zoom is allowed
  }, [viewState, currentMap])


  const resetView = useCallback(() => {
    setViewState({ scale: 1, offsetX: 0, offsetY: 0 })
  }, [])

  const handleTileClick = useCallback((row: number, col: number) => {
    // Allow editing anywhere within the canvas bounds
    if (row < 0 || row >= currentMap.height || col < 0 || col >= currentMap.width) {
      return
    }
    
    if (selectedTool === 'grass') {
      const newTiles = [...currentMap.tiles]
      newTiles[row] = [...newTiles[row]]
      newTiles[row][col] = ' ' // Grass tile (space character)
      setCurrentMap({
        ...currentMap,
        tiles: newTiles
      })
    }
  }, [selectedTool, currentMap])


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
        style={{
          cursor: 'default',
          touchAction: 'none' // Extra protection for touch events
        }}
      >
        <div 
          className="relative"
          style={{
            transform: `translate(${viewState.offsetX}px, ${viewState.offsetY}px) scale(${viewState.scale})`,
            transformOrigin: 'top left',
            transition: 'transform 0.1s ease-out'
          }}
        >
          <MapRenderer map={currentMap} />
          <MapGridOverlay map={currentMap} onTileClick={handleTileClick} />
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
