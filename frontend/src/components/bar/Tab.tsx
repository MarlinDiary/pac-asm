import React from 'react'
import { LucideIcon } from "lucide-react"

interface TabProps {
  icon: LucideIcon
  text: string
  isSelected?: boolean
  color?: string
  darkColor?: string
  onClick?: () => void
}

export default function Tab({ icon: Icon, text, isSelected = false, color = "#666", darkColor, onClick }: TabProps) {
  const [isDark, setIsDark] = React.useState(false)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => setIsDark(mediaQuery.matches)
    handleChange() // Set initial value
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const currentColor = isDark && darkColor ? darkColor : color

  return (
    <div
      className={`h-7 px-2 py-1 flex items-center gap-1 cursor-pointer hover:bg-[#f0f0f0] dark:hover:bg-[#434343] rounded-md flex-shrink-0 whitespace-nowrap ${isSelected ? 'font-medium' : 'font-normal'}`}
      onClick={onClick}
    >
      <div className={`w-4 h-4 flex items-center justify-center ${isSelected ? 'opacity-100' : 'opacity-33'}`}>
        <Icon
          size={16}
          color={currentColor}
        />
      </div>
      <span className={`text-sm text-black dark:text-[#f5f5f5] relative inline-block whitespace-nowrap ${isSelected ? 'opacity-100' : 'opacity-33'}`}>
        <span className="invisible font-medium whitespace-nowrap" aria-hidden="true">
          {text}
        </span>
        <span className={`absolute inset-0 whitespace-nowrap ${isSelected ? 'font-medium' : 'font-normal'}`}>
          {text}
        </span>
      </span>
    </div>
  )
}