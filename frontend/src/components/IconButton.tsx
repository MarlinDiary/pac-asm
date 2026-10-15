import { LucideIcon } from 'lucide-react'
import { ReactNode } from 'react'

interface IconButtonProps {
  label?: string
  icon?: LucideIcon
  onClick?: () => void
  size?: number
  disabled?: boolean
  customContent?: ReactNode
}

export default function IconButton({ label, icon: Icon, onClick, size = 16, disabled = false, customContent }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`w-8 h-8 flex items-center justify-center hover:rounded-md group ${
        disabled
          ? 'opacity-40'
          : 'hover:bg-[#e7e7e7] dark:hover:bg-[#222222] cursor-pointer'
      }`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {customContent ? (
        customContent
      ) : Icon ? (
        <Icon
          size={size}
          className={`${
            disabled
              ? 'text-[#737373] dark:text-[#A8A8A8]'
              : 'text-[#737373] dark:text-[#A8A8A8] group-hover:text-[#1a1a1a] dark:group-hover:text-[#f5f5f5]'
          }`}
        />
      ) : null}
    </button>
  )
}