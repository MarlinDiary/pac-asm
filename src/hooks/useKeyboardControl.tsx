import React, { useEffect, useCallback } from 'react'
import { GameMap } from '@/data/maps'
import { updateMapWithMovement } from '@/lib/game-animation'

interface UseKeyboardControlProps {
  enabled: boolean
  currentMap: GameMap | null
  onMapUpdate: (newMap: GameMap) => void
}

/**
 * Custom hook for keyboard control of player movement
 * Only for development use, not production
 */
export const useKeyboardControl = ({
  enabled,
  currentMap,
  onMapUpdate
}: UseKeyboardControlProps) => {
  
  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    if (!enabled || !currentMap) return

    // Prevent default behavior for arrow keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
      event.preventDefault()
    }

    let command = 0

    // Map keyboard keys to movement commands
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        command = 1 // Up
        break
      case 'ArrowDown':
      case 'KeyS':
        command = 2 // Down
        break
      case 'ArrowLeft':
      case 'KeyA':
        command = 3 // Left
        break
      case 'ArrowRight':
      case 'KeyD':
        command = 4 // Right
        break
      default:
        return // Ignore other keys
    }

    if (command > 0) {
      const newMap = updateMapWithMovement(currentMap, command)
      onMapUpdate(newMap)
    }
  }, [enabled, currentMap, onMapUpdate])

  useEffect(() => {
    if (!enabled) return

    // Add event listener
    document.addEventListener('keydown', handleKeyPress)

    // Cleanup function
    return () => {
      document.removeEventListener('keydown', handleKeyPress)
    }
  }, [enabled, handleKeyPress])

  return {
    // Returns nothing - this hook only handles side effects
  }
}

/**
 * Simple keyboard control component for quick integration
 */
interface KeyboardControlProps {
  enabled?: boolean
  currentMap: GameMap | null
  onMapUpdate: (newMap: GameMap) => void
  children?: React.ReactNode
}

export const KeyboardControl = ({
  enabled = false,
  currentMap,
  onMapUpdate,
  children
}: KeyboardControlProps) => {
  useKeyboardControl({
    enabled,
    currentMap,
    onMapUpdate
  })

  return (
    <>
      {children}
    </>
  )
}