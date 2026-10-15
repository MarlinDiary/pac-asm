import { useEffect, useRef, useState, type ReactNode } from 'react'
export function fitGameScale(availableWidth: number, availableHeight: number, width: number, height: number) {
  return Math.max(0.05, Math.min(1, (availableWidth - 24) / width, (availableHeight - 24) / height))
}
export default function GameViewport({ mobile, width, height, children }: {
  mobile: boolean; width: number; height: number; children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const element = ref.current
    if (!element || !mobile) return
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect
      if (w > 0 && h > 0) setScale(fitGameScale(w, h, width, height))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [mobile, width, height])
  return <div ref={ref} className="pac-game-viewport absolute inset-0 flex items-center justify-center">
    <div className="relative flex items-center justify-center" style={mobile ? { transform: `scale(${scale})`, flexShrink: 0 } : undefined}>{children}</div>
  </div>
}
