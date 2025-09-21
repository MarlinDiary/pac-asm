'use client'

import { useEffect } from 'react'
import MapEditor from '@/components/MapEditor'

export default function MapPage() {
  useEffect(() => {
    const preventZoom = (e: TouchEvent) => {
      // Prevent multi-touch and edge swipes that cause navigation
      if (e.touches.length > 1 || e.changedTouches.length > 1) {
        e.preventDefault()
        e.stopPropagation()
        return false
      }
    }

    const preventGestureZoom = (e: Event) => {
      e.preventDefault()
    }

    const preventKeyboardZoom = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
        e.preventDefault()
      }
    }

    const preventWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
      }
    }

    // Add global listeners only on map page
    document.addEventListener('touchstart', preventZoom, { passive: false })
    document.addEventListener('touchmove', preventZoom, { passive: false })
    document.addEventListener('gesturestart', preventGestureZoom, { passive: false })
    document.addEventListener('gesturechange', preventGestureZoom, { passive: false })
    document.addEventListener('gestureend', preventGestureZoom, { passive: false })
    document.addEventListener('keydown', preventKeyboardZoom, { passive: false })
    document.addEventListener('wheel', preventWheelZoom, { passive: false })

    // Set body and html styles to prevent all unwanted behaviors
    document.body.style.touchAction = 'none'
    document.body.style.userSelect = 'none'
    document.body.style.overscrollBehavior = 'none'
    document.body.style.position = 'fixed'
    document.body.style.width = '100%'
    document.body.style.height = '100%'
    document.documentElement.style.touchAction = 'none'
    document.documentElement.style.overscrollBehavior = 'none'

    return () => {
      // Cleanup when leaving the page
      document.removeEventListener('touchstart', preventZoom)
      document.removeEventListener('touchmove', preventZoom)
      document.removeEventListener('gesturestart', preventGestureZoom)
      document.removeEventListener('gesturechange', preventGestureZoom)
      document.removeEventListener('gestureend', preventGestureZoom)
      document.removeEventListener('keydown', preventKeyboardZoom)
      document.removeEventListener('wheel', preventWheelZoom)
      
      // Reset all styles
      document.body.style.touchAction = ''
      document.body.style.userSelect = ''
      document.body.style.overscrollBehavior = ''
      document.body.style.position = ''
      document.body.style.width = ''
      document.body.style.height = ''
      document.documentElement.style.touchAction = ''
      document.documentElement.style.overscrollBehavior = ''
    }
  }, [])

  return <MapEditor />
}