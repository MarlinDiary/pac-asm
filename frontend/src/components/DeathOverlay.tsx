import React, { useEffect, useState } from 'react'
import FuzzyText from './FuzzyText'

interface DeathOverlayProps {
  show: boolean
  onComplete?: () => void
}

export default function DeathOverlay({ show, onComplete }: DeathOverlayProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [opacity, setOpacity] = useState(0)

  useEffect(() => {
    if (show) {
      // Delay the appearance by 75ms
      const showTimer = setTimeout(() => {
        setIsVisible(true)
        // Start fade in with cubic-bezier easing
        requestAnimationFrame(() => {
          setOpacity(1)
        })
      }, 75)

      // Start fade out after fully visible
      const fadeOutTimer = setTimeout(() => {
        setOpacity(0)
      }, 1000) // 75ms delay + 300ms fade in + 625ms visible

      // Hide completely after fade out completes
      const hideTimer = setTimeout(() => {
        setIsVisible(false)
        onComplete?.()
      }, 1200) // Keep total at 1.2s: 75ms delay + 300ms fade in + 625ms visible + 200ms fade out

      return () => {
        clearTimeout(showTimer)
        clearTimeout(fadeOutTimer)
        clearTimeout(hideTimer)
      }
    } else {
      setOpacity(0)
      setIsVisible(false)
    }
  }, [show, onComplete])

  if (!isVisible) return null

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap');
      `}</style>
      <div
        className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
        style={{
          opacity: opacity,
          transition: opacity === 1
            ? 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)' // Slower fade in (300ms)
            : 'opacity 0.2s cubic-bezier(0.4, 0, 1, 1)', // Faster fade out (200ms)
        }}
      >
        <FuzzyText
          fontSize="4rem"
          fontWeight={400}
          fontFamily="'Silkscreen', monospace"
          color="#A70000"
          enableHover={false}
          baseIntensity={0.25}
        >
          D E A T H
        </FuzzyText>
      </div>
    </>
  )
}