import { useEffect, useState } from 'react'
export const MOBILE_QUERY = '(max-width: 900px)'
export function mobileLevelLabel(id: string): string {
  if (id === 'challenge') return 'V'
  return ({ '1': 'I', '2': 'II', '3': 'III', '4': 'IV' } as Record<string, string>)[id.replace('level', '')] ?? id
}
// Presentation only; the editor, submission controller and emulator stay mounted.
export function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(false)
  const [viewportHeight, setViewportHeight] = useState<number>()
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY), viewport = window.visualViewport
    const update = () => {
      setIsMobile(query.matches)
      // Follow the software keyboard, without fighting pinch zoom.
      setViewportHeight(query.matches && viewport?.scale === 1 ? viewport.height : undefined)
    }
    update()
    query.addEventListener('change', update)
    viewport?.addEventListener('resize', update)
    return () => { query.removeEventListener('change', update); viewport?.removeEventListener('resize', update) }
  }, [])
  return { isMobile, viewportHeight }
}
