import { useState } from 'react'
import TabBar, { Tab } from './bar/TabBar'
import { LucideIcon } from 'lucide-react'

interface TabConfig {
  icon: LucideIcon
  text: string
  color: string
  darkColor?: string
}

interface CardProps {
  className?: string
  children?: React.ReactNode
  tabs?: TabConfig[]
  defaultSelectedTab?: number
  selectedTab?: number
  onTabChange?: (index: number) => void
  tabContent?: React.ReactNode[]
}

export default function Card({ className = '', children, tabs = [], defaultSelectedTab = 0, selectedTab: controlledSelectedTab, onTabChange, tabContent = [] }: CardProps) {
  const [internalSelectedTab, setInternalSelectedTab] = useState(defaultSelectedTab)
  const selectedTab = controlledSelectedTab !== undefined ? controlledSelectedTab : internalSelectedTab
  
  const handleTabClick = (index: number) => {
    if (controlledSelectedTab === undefined) {
      setInternalSelectedTab(index)
    }
    onTabChange?.(index)
  }

  return (
    <div className={`w-full h-full bg-white dark:bg-[#262626] rounded-lg flex flex-col overflow-hidden ${className}`}>
      <TabBar>
        {tabs.map((tab, index) => (
          <Tab
            key={index}
            icon={tab.icon}
            text={tab.text}
            color={tab.color}
            darkColor={tab.darkColor}
            isSelected={selectedTab === index}
            onClick={() => handleTabClick(index)}
          />
        ))}
      </TabBar>
      <div
        className="flex-1 relative"
      >
        {tabContent.length > 0 ? (
          tabContent.map((content, index) => (
            <div
              key={index}
              className="absolute inset-0 overflow-y-auto [&::-webkit-scrollbar]:hidden"
              style={{
                opacity: selectedTab === index ? 1 : 0,
                // The active, full-size pane covers the inactive panes. Avoid
                // toggling inherited pointer-events on thousands of cells.
                zIndex: selectedTab === index ? 1 : 0,
                // Keep the mounted pane and its scroll/state, but do not lay
                // out an invisible memory table on every panel resize.
                contentVisibility: selectedTab === index ? 'visible' : 'hidden'
              }}
              aria-hidden={selectedTab === index ? undefined : true}
            >
              {content}
            </div>
          ))
        ) : (
          <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:hidden">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
