import Tab from './Tab'

interface TabBarProps {
  children?: React.ReactNode
}

export default function TabBar({ children }: TabBarProps) {
  return (
    <div 
      className="w-full flex items-center p-1 bg-[#fafafa] dark:bg-[#333333] rounded-t-lg"
      style={{ 
        height: '36px'
      }}
    >
      {children}
    </div>
  )
}

export { Tab }