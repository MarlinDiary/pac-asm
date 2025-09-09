'use client'

import { useState, useRef, useCallback } from 'react'
import { Copy, CopyCheck, ArrowLeft, RefreshCcw } from 'lucide-react'
import MapRenderer from '@/components/MapRenderer'
import MapGridOverlay from '@/components/MapGridOverlay'
import MapEditorToolbar from '@/components/MapEditorToolbar'
import { GameMap, TileMapping } from '@/data/maps'

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
  const [isCopied, setIsCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleToolSelect = (tool: ToolType) => {
    setSelectedTool(tool)
  }

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    
    // Check if it's a pinch gesture (ctrlKey is true for trackpad pinch)
    // For pinch: deltaY < 0 means pinch out (zoom in), deltaY > 0 means pinch in (zoom out)
    // For scroll: deltaY > 0 means scroll down (zoom out), deltaY < 0 means scroll up (zoom in)
    const scaleFactor = e.ctrlKey 
      ? (e.deltaY < 0 ? 1.2 : 0.8)  // Pinch gesture
      : (e.deltaY > 0 ? 1.2 : 0.8)  // Regular scroll
    const newScale = Math.max(1, Math.min(3, viewState.scale * scaleFactor))

    setViewState(prev => ({
      ...prev,
      scale: newScale
    }))
  }, [viewState])


  const resetView = useCallback(() => {
    setViewState({ scale: 1, offsetX: 0, offsetY: 0 })
  }, [])

  const resetToInitialState = useCallback(() => {
    // Reset the map to initial empty state
    const tiles = Array(99).fill(null).map(() => Array(99).fill('%'))
    tiles[49][49] = ' '  // Place grass under initial Pacman
    
    setCurrentMap({
      id: 'editor-canvas',
      name: 'Editor Canvas',
      width: 99,
      height: 99,
      tileSize: 20,
      tiles: tiles,
      playerPosition: { row: 49, col: 49, direction: 'right' },
      ghostPositions: [],
      playerAnimation: { direction: 'right' },
      ghostAnimations: [],
      waterBackground: { tilesX: 8, tilesY: 6 }
    })
    setViewState({ scale: 1, offsetX: 0, offsetY: 0 })
  }, [])

  const extractMinimalMap = useCallback(() => {
    // Find the bounding box of all non-air tiles and entities
    let minRow = currentMap.height
    let maxRow = -1
    let minCol = currentMap.width
    let maxCol = -1
    
    // Check all tiles
    for (let row = 0; row < currentMap.height; row++) {
      for (let col = 0; col < currentMap.width; col++) {
        if (currentMap.tiles[row][col] !== '%') {
          minRow = Math.min(minRow, row)
          maxRow = Math.max(maxRow, row)
          minCol = Math.min(minCol, col)
          maxCol = Math.max(maxCol, col)
        }
      }
    }
    
    // Check Pacman position
    if (currentMap.playerPosition.row >= 0 && currentMap.playerPosition.col >= 0) {
      minRow = Math.min(minRow, currentMap.playerPosition.row)
      maxRow = Math.max(maxRow, currentMap.playerPosition.row)
      minCol = Math.min(minCol, currentMap.playerPosition.col)
      maxCol = Math.max(maxCol, currentMap.playerPosition.col)
    }
    
    // Check ghost positions
    for (const ghost of currentMap.ghostPositions) {
      minRow = Math.min(minRow, ghost.row)
      maxRow = Math.max(maxRow, ghost.row)
      minCol = Math.min(minCol, ghost.col)
      maxCol = Math.max(maxCol, ghost.col)
    }
    
    // If no content found, return null
    if (maxRow < 0 || maxCol < 0) {
      return null
    }
    
    // Add 1 tile padding around the content
    const padding = 1
    const newHeight = maxRow - minRow + 1 + padding * 2
    const newWidth = maxCol - minCol + 1 + padding * 2
    const newTiles: (keyof TileMapping)[][] = []
    
    // Create the map with padding
    for (let r = 0; r < newHeight; r++) {
      const row: (keyof TileMapping)[] = []
      for (let c = 0; c < newWidth; c++) {
        // Check if we're in the padding area
        if (r < padding || r >= newHeight - padding || 
            c < padding || c >= newWidth - padding) {
          row.push('%' as keyof TileMapping) // Air for padding
        } else {
          // Get the tile from the original map
          const origRow = minRow + r - padding
          const origCol = minCol + c - padding
          row.push(currentMap.tiles[origRow][origCol])
        }
      }
      newTiles.push(row)
    }
    
    // Adjust entity positions relative to the new origin (accounting for padding)
    const minimalMap: GameMap = {
      ...currentMap,
      height: newHeight,
      width: newWidth,
      tiles: newTiles,
      playerPosition: currentMap.playerPosition.row >= 0 ? {
        row: currentMap.playerPosition.row - minRow + padding,
        col: currentMap.playerPosition.col - minCol + padding,
        direction: currentMap.playerPosition.direction
      } : currentMap.playerPosition,
      ghostPositions: currentMap.ghostPositions.map(g => ({
        row: g.row - minRow + padding,
        col: g.col - minCol + padding
      }))
    }
    
    return minimalMap
  }, [currentMap])

  const copyMapToClipboard = useCallback(() => {
    const minimalMap = extractMinimalMap()
    if (!minimalMap) {
      return
    }
    
    // Format tiles as a multi-line string for the raw map
    const tilesString = minimalMap.tiles.map(row => row.join('')).join('\n')
    
    // Calculate waterBackground based on dimensions
    // Even dimensions get 72, odd dimensions get 71
    const tilesX = minimalMap.width % 2 === 0 ? 72 : 71
    const tilesY = minimalMap.height % 2 === 0 ? 72 : 71
    
    // Create the map object in the format used in maps.ts
    const mapObject = `{
    id: 'custom-map',
    name: 'Custom Map',
    width: ${minimalMap.width},
    height: ${minimalMap.height},
    tileSize: 20,
    tiles: parseMapFromString(\`
${tilesString}\`),
    playerPosition: { row: ${minimalMap.playerPosition.row}, col: ${minimalMap.playerPosition.col}, direction: '${minimalMap.playerPosition.direction}' },
    ghostPositions: [${minimalMap.ghostPositions.map(g => `{ row: ${g.row}, col: ${g.col} }`).join(', ')}],
    waterBackground: { tilesX: ${tilesX}, tilesY: ${tilesY} }
  }`
    
    navigator.clipboard.writeText(mapObject).then(() => {
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000) // Reset after 2 seconds
    }).catch(err => {
      console.error('Failed to copy:', err)
    })
  }, [extractMinimalMap])


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
          
          const updateObj: Partial<GameMap> = { tiles: newTiles }
          
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
          
          const updateObj: Partial<GameMap> = { tiles: newTiles }
          
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
        const updateObj: Partial<GameMap> = { tiles: newTiles }
        
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
        
        const updateObj: Partial<GameMap> = { tiles: newTiles }
        
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
      
      if (isPacmanHere) {
        // Click on existing Pacman to rotate its direction clockwise
        const directions = ['right', 'down', 'left', 'up'] as const
        const currentDirectionIndex = directions.indexOf(currentMap.playerPosition.direction)
        const newDirection = directions[(currentDirectionIndex + 1) % 4]
        
        setCurrentMap({
          ...currentMap,
          playerPosition: { 
            ...currentMap.playerPosition, 
            direction: newDirection 
          },
          playerAnimation: {
            ...currentMap.playerAnimation,
            direction: newDirection
          }
        })
      } else if (currentTile === ' ' || currentTile === '.') {
        // Place Pacman at new position
        // Ensure grass tile underneath
        newTiles[row][col] = ' '
        
        const updateObj: Partial<GameMap> = { 
          tiles: newTiles,
          playerPosition: { row, col, direction: currentMap.playerPosition.direction },
          playerAnimation: {
            ...currentMap.playerAnimation,
            direction: currentMap.playerPosition.direction
          }
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
        
        const updateObj: Partial<GameMap> = { 
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
            onTileMouseDown={handleTileMouseDown}
            onTileMouseEnter={handleTileMouseEnter}
            onTileMouseUp={handleTileMouseUp}
          />
        </div>
      </div>
      
      {/* Back button - top left (no function) */}
      <button
        className="absolute top-4 left-4 p-2 text-gray-700 dark:text-neutral-300 hover:bg-gray-200 dark:hover:bg-neutral-800 rounded-lg transition-all duration-200 cursor-pointer"
        aria-label="Back"
      >
        <ArrowLeft size={20} />
      </button>
      
      {/* Reset button - bottom left */}
      <button
        onClick={resetToInitialState}
        className="absolute bottom-4 left-4 p-2 text-gray-700 dark:text-neutral-300 hover:bg-gray-200 dark:hover:bg-neutral-800 rounded-lg transition-all duration-200 cursor-pointer"
        aria-label="Reset to initial state"
      >
        <RefreshCcw size={20} />
      </button>
      
      {/* Copy map button - top right */}
      <button
        onClick={copyMapToClipboard}
        className="absolute top-4 right-4 p-2 text-gray-700 dark:text-neutral-300 hover:bg-gray-200 dark:hover:bg-neutral-800 rounded-lg transition-all duration-200 cursor-pointer"
        aria-label="Copy map to clipboard"
      >
        {isCopied ? (
          <CopyCheck size={20} className="text-green-600 dark:text-green-400" />
        ) : (
          <Copy size={20} />
        )}
      </button>
      
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
