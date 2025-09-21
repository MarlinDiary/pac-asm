import { useRef, useEffect, useState } from 'react'
import { ImperativePanelHandle } from 'react-resizable-panels'

export const usePanelLayout = () => {
  // Panel refs for resetting
  const firstColumnRef = useRef<ImperativePanelHandle>(null)
  const panel1Ref = useRef<ImperativePanelHandle>(null)
  const panel2Ref = useRef<ImperativePanelHandle>(null)
  const panel3Ref = useRef<ImperativePanelHandle>(null)
  const panel4Ref = useRef<ImperativePanelHandle>(null)

  const [isFullscreen, setIsFullscreen] = useState(false)

  const resetVerticalPanels = () => {
    panel1Ref.current?.resize(70)
    panel2Ref.current?.resize(30)
  }

  const resetHorizontalPanels = () => {
    firstColumnRef.current?.resize(33)
    panel3Ref.current?.resize(34)
    panel4Ref.current?.resize(33)
  }

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  return {
    // Panel refs
    firstColumnRef,
    panel1Ref,
    panel2Ref,
    panel3Ref,
    panel4Ref,
    
    // Fullscreen state
    isFullscreen,
    setIsFullscreen,
    
    // Reset functions
    resetVerticalPanels,
    resetHorizontalPanels
  }
}