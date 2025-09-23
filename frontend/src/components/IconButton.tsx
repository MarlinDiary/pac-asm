import { LucideIcon } from 'lucide-react'

interface IconButtonProps {
  icon: LucideIcon
  onClick?: () => void
  size?: number
  disabled?: boolean
}

export default function IconButton({ icon: Icon, onClick, size = 16, disabled = false }: IconButtonProps) {
  return (
    <button
      className={`w-8 h-8 flex items-center justify-center hover:rounded-md group ${
        disabled
          ? 'opacity-40'
          : 'hover:bg-[#e7e7e7] dark:hover:bg-[#222222] cursor-pointer'
      }`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <Icon
        size={size}
        className={`${
          disabled
            ? 'text-[#737373] dark:text-[#A8A8A8]'
            : 'text-[#737373] dark:text-[#A8A8A8] group-hover:text-[#1a1a1a] dark:group-hover:text-[#f5f5f5]'
        }`}
      />
    </button>
  )
}