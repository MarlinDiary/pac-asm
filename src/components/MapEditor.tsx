'use client'

import { useState, useRef, useCallback } from 'react'
import MapRenderer from '@/components/MapRenderer'
import MapGridOverlay from '@/components/MapGridOverlay'
import MapEditorToolbar from '@/components/MapEditorToolbar'
import { GameMap } from '@/data/maps'

export type ToolType = 'air' | 'grass' | 'dot' | 'pacman' | 'ghost'

interface ViewState {
  scale: number
  offsetX: number
  offsetY: number
}

export default function MapEditor() {
  // Create a large empty canvas for editing
  const canvasSize = 99 // 99x99 grid
  const tiles = Array(canvasSize).fill(null).map(() => Array(canvasSize).fill('%'))
  // Place grass tile under initial Pacman position
  tiles[49][49] = ' '
  
  const emptyCanvas: GameMap = {
    id: 'editor-canvas',
    name: 'Editor Canvas',
    width: canvasSize,
    height: canvasSize,
    tileSize: 20,
    tiles: tiles,
    playerPosition: { row: 49, col: 49, direction: 'right' },
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
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawingMode, setDrawingMode] = useState<'add' | 'remove' | null>(null)
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

      setViewState(prev => ({
        ...prev,
        scale: newScale
      }))
    }
    // Remove pan functionality - only zoom is allowed
  }, [viewState])


  const resetView = useCallback(() => {
    setViewState({ scale: 1, offsetX: 0, offsetY: 0 })
  }, [])


  const applyToolWithMode = useCallback((row: number, col: number, mode?: 'add' | 'remove' | null) => {
    // Allow editing anywhere within the canvas bounds
    if (row < 0 || row >= currentMap.height || col < 0 || col >= currentMap.width) {
      return
    }
    
    const newTiles = [...currentMap.tiles]
    newTiles[row] = [...newTiles[row]]
    const currentTile = currentMap.tiles[row][col]
    
    if (selectedTool === 'grass') {
      if (mode === 'add') {
        // Only add grass if it's air
        if (currentTile === '%') {
          newTiles[row][col] = ' '
          setCurrentMap({
            ...currentMap,
            tiles: newTiles
          })
        }
      } else if (mode === 'remove') {
        // Only remove if it's grass or dot
        if (currentTile === ' ' || currentTile === '.') {
          newTiles[row][col] = '%'
          
          // Handle entities on this tile
          const isPacmanHere = currentMap.playerPosition.row === row && currentMap.playerPosition.col === col
          const ghostIndex = currentMap.ghostPositions.findIndex(g => g.row === row && g.col === col)
          
          let updateObj: any = { tiles: newTiles }
          
          if (isPacmanHere) {
            updateObj.playerPosition = { row: -1, col: -1, direction: currentMap.playerPosition.direction }
          }
          
          if (ghostIndex !== -1) {
            const newGhostPositions = [...currentMap.ghostPositions]
            newGhostPositions.splice(ghostIndex, 1)
            updateObj.ghostPositions = newGhostPositions
          }
          
          setCurrentMap({
            ...currentMap,
            ...updateObj
          })
        }
      }
    } else if (selectedTool === 'dot') {
      if (mode === 'add') {
        // Only add dot if it's grass
        if (currentTile === ' ') {
          newTiles[row][col] = '.'
          
          // Remove entities if present
          const isPacmanHere = currentMap.playerPosition.row === row && currentMap.playerPosition.col === col
          const ghostIndex = currentMap.ghostPositions.findIndex(g => g.row === row && g.col === col)
          
          let updateObj: any = { tiles: newTiles }
          
          if (isPacmanHere) {
            updateObj.playerPosition = { row: -1, col: -1, direction: currentMap.playerPosition.direction }
          }
          
          if (ghostIndex !== -1) {
            const newGhostPositions = [...currentMap.ghostPositions]
            newGhostPositions.splice(ghostIndex, 1)
            updateObj.ghostPositions = newGhostPositions
          }
          
          setCurrentMap({
            ...currentMap,
            ...updateObj
          })
        }
      } else if (mode === 'remove') {
        // Only remove if it's a dot
        if (currentTile === '.') {
          newTiles[row][col] = ' '
          setCurrentMap({
            ...currentMap,
            tiles: newTiles
          })
        }
      }
    }
  }, [selectedTool, currentMap])

  const handleTileClick = useCallback((row: number, col: number) => {
    // Allow editing anywhere within the canvas bounds
    if (row < 0 || row >= currentMap.height || col < 0 || col >= currentMap.width) {
      return
    }
    
    const newTiles = [...currentMap.tiles]
    newTiles[row] = [...newTiles[row]]
    
    if (selectedTool === 'grass') {
      const currentTile = currentMap.tiles[row][col]
      const isPacmanHere = currentMap.playerPosition.row === row && currentMap.playerPosition.col === col
      const ghostIndex = currentMap.ghostPositions.findIndex(g => g.row === row && g.col === col)
      
      // Toggle: grass/dot -> air, air -> grass
      if (currentTile === ' ' || currentTile === '.') {
        newTiles[row][col] = '%' // Remove grass (and dot if present)
        
        // Prepare update object
        let updateObj: any = { tiles: newTiles }
        
        // If Pacman is on this tile, move him off the map
        if (isPacmanHere) {
          updateObj.playerPosition = { row: -1, col: -1, direction: currentMap.playerPosition.direction }
        }
        
        // If a ghost is on this tile, remove it
        if (ghostIndex !== -1) {
          const newGhostPositions = [...currentMap.ghostPositions]
          newGhostPositions.splice(ghostIndex, 1)
          updateObj.ghostPositions = newGhostPositions
        }
        
        setCurrentMap({
          ...currentMap,
          ...updateObj
        })
      } else {
        newTiles[row][col] = ' ' // Place grass
        setCurrentMap({
          ...currentMap,
          tiles: newTiles
        })
      }
    } else if (selectedTool === 'dot') {
      const currentTile = currentMap.tiles[row][col]
      const isPacmanHere = currentMap.playerPosition.row === row && currentMap.playerPosition.col === col
      const ghostIndex = currentMap.ghostPositions.findIndex(g => g.row === row && g.col === col)
      
      // Dots can be placed on grass tiles or replace existing dots
      if (currentTile === ' ' || currentTile === '.') {
        if (currentTile === '.') {
          // Remove dot, revert to grass
          newTiles[row][col] = ' '
        } else {
          // Place dot
          newTiles[row][col] = '.'
        }
        
        let updateObj: any = { tiles: newTiles }
        
        // Remove Pacman if he's here
        if (isPacmanHere) {
          updateObj.playerPosition = { row: -1, col: -1, direction: currentMap.playerPosition.direction }
        }
        
        // Remove ghost if it's here
        if (ghostIndex !== -1) {
          const newGhostPositions = [...currentMap.ghostPositions]
          newGhostPositions.splice(ghostIndex, 1)
          updateObj.ghostPositions = newGhostPositions
        }
        
        setCurrentMap({
          ...currentMap,
          ...updateObj
        })
      }
    } else if (selectedTool === 'pacman') {
      const currentTile = currentMap.tiles[row][col]
      const isPacmanHere = currentMap.playerPosition.row === row && currentMap.playerPosition.col === col
      const ghostIndex = currentMap.ghostPositions.findIndex(g => g.row === row && g.col === col)
      
      // Pacman can be placed on grass or dots
      if (currentTile === ' ' || currentTile === '.') {
        if (isPacmanHere) {
          // Click on existing Pacman to remove it
          setCurrentMap({
            ...currentMap,
            playerPosition: { row: -1, col: -1, direction: currentMap.playerPosition.direction }
          })
        } else {
          // Place Pacman at new position
          // Ensure grass tile underneath
          newTiles[row][col] = ' '
          
          let updateObj: any = { 
            tiles: newTiles,
            playerPosition: { row, col, direction: currentMap.playerPosition.direction }
          }
          
          // Remove ghost if it's here
          if (ghostIndex !== -1) {
            const newGhostPositions = [...currentMap.ghostPositions]
            newGhostPositions.splice(ghostIndex, 1)
            updateObj.ghostPositions = newGhostPositions
          }
          
          setCurrentMap({
            ...currentMap,
            ...updateObj
          })
        }
      }
    } else if (selectedTool === 'ghost') {
      const currentTile = currentMap.tiles[row][col]
      const isPacmanHere = currentMap.playerPosition.row === row && currentMap.playerPosition.col === col
      const ghostIndex = currentMap.ghostPositions.findIndex(g => g.row === row && g.col === col)
      
      // Ghosts can be placed on grass or dots
      if (currentTile === ' ' || currentTile === '.') {
        const newGhostPositions = [...currentMap.ghostPositions]
        
        if (ghostIndex !== -1) {
          // Click on existing ghost to remove it
          newGhostPositions.splice(ghostIndex, 1)
        } else {
          // Add new ghost
          newGhostPositions.push({ row, col })
          
          // If we have more than 2 ghosts, remove the oldest one
          if (newGhostPositions.length > 2) {
            newGhostPositions.shift()
          }
        }
        
        // Ensure grass tile underneath
        newTiles[row][col] = ' '
        
        let updateObj: any = { 
          tiles: newTiles,
          ghostPositions: newGhostPositions
        }
        
        // Remove Pacman if he's here
        if (isPacmanHere) {
          updateObj.playerPosition = { row: -1, col: -1, direction: currentMap.playerPosition.direction }
        }
        
        setCurrentMap({
          ...currentMap,
          ...updateObj
        })
      }
    }
  }, [selectedTool, currentMap])

  const handleTileMouseDown = useCallback((row: number, col: number) => {
    if (selectedTool === 'grass' || selectedTool === 'dot') {
      // Determine the mode based on the current tile BEFORE clicking
      const currentTile = currentMap.tiles[row][col]
      let mode: 'add' | 'remove' | null = null
      
      if (selectedTool === 'grass') {
        // If current tile is air, we'll be adding; otherwise removing
        mode = currentTile === '%' ? 'add' : 'remove'
      } else if (selectedTool === 'dot') {
        // If current tile is grass, we'll be adding dot; if it's dot, removing
        mode = currentTile === ' ' ? 'add' : (currentTile === '.' ? 'remove' : null)
      }
      
      // Apply the normal click action
      handleTileClick(row, col)
      
      // Set up for dragging
      setIsDrawing(true)
      setDrawingMode(mode)
    } else {
      // For other tools, just use normal click behavior
      handleTileClick(row, col)
    }
  }, [selectedTool, currentMap, handleTileClick])

  const handleTileMouseEnter = useCallback((row: number, col: number) => {
    // Continue drawing with the same mode
    if (isDrawing && drawingMode && (selectedTool === 'grass' || selectedTool === 'dot')) {
      applyToolWithMode(row, col, drawingMode)
    }
  }, [isDrawing, drawingMode, selectedTool, applyToolWithMode])

  const handleTileMouseUp = useCallback(() => {
    setIsDrawing(false)
    setDrawingMode(null)
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
        style={{
          cursor: 'default',
          touchAction: 'none' // Extra protection for touch events
        }}
      >
        <div 
          className="relative"
          style={{
            transform: `scale(${viewState.scale})`,
            transformOrigin: 'center',
            transition: 'transform 0.1s ease-out'
          }}
        >
          <MapRenderer map={currentMap} />
          <MapGridOverlay 
            map={currentMap} 
            onTileClick={handleTileClick}
            onTileMouseDown={handleTileMouseDown}
            onTileMouseEnter={handleTileMouseEnter}
            onTileMouseUp={handleTileMouseUp}
          />
        </div>
      </div>
      
      {/* Zoom percentage - clickable to reset */}
      <button
        onClick={resetView}
        className="absolute bottom-4 right-4 text-base font-semibold text-gray-700 dark:text-neutral-300 hover:bg-gray-200 dark:hover:bg-neutral-800 px-3 py-1 rounded-lg transition-all duration-200 cursor-pointer"
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
