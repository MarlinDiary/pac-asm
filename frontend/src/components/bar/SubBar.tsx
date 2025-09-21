interface SubBarProps {
  children?: React.ReactNode
}

export default function SubBar({ children }: SubBarProps) {
  return (
    <div 
      className="w-full flex items-center h-8 border-b border-[#f0f0f0] dark:border-[#3C3C3C]"
    >
      {children}
    </div>
  )
}