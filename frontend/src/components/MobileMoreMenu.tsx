'use client'

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Book, Check, CircuitBoard, Ellipsis, HardDrive, Lightbulb, Stethoscope } from 'lucide-react'

const options = [
  { name: 'Manual', icon: Book, color: '#50AE40' },
  { name: 'Hint', icon: Lightbulb, color: '#A2470F', darkColor: '#FFAB70' },
  { name: 'Register', icon: CircuitBoard, color: '#9164EA' },
  { name: 'Memory', icon: HardDrive, color: '#01A2C2' },
  { name: 'Diagnostics', icon: Stethoscope, color: '#DF0D25', darkColor: '#FF6B6B' },
]

const colors = (option?: typeof options[number]) => ({
  '--pac-tool-color': option?.color ?? 'currentColor',
  '--pac-tool-dark-color': option?.darkColor ?? option?.color ?? 'currentColor',
}) as CSSProperties

export default function MobileMoreMenu({ mobile, value, onSelect }: {
  mobile: boolean
  value: string
  onSelect: (name: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const id = useId()
  const selected = options.find(option => option.name === value)

  useEffect(() => { if (!mobile) setIsOpen(false) }, [mobile])
  useEffect(() => {
    if (!isOpen) return
    const selectedItem = menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
    ;(selectedItem ?? menuRef.current?.querySelector<HTMLButtonElement>('button'))?.focus()
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [isOpen])

  const close = () => { setIsOpen(false); triggerRef.current?.focus() }

  return (
    <div ref={rootRef} className="pac-more">
      <button ref={triggerRef} type="button" className="pac-more-trigger" style={colors(selected)}
        aria-label="More" title="More" aria-haspopup="menu" aria-expanded={isOpen}
        aria-controls={id} data-active={Boolean(selected)}
        onClick={() => setIsOpen(open => !open)}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setIsOpen(true) }
        }}>
        <Ellipsis size={20} aria-hidden="true" />
      </button>
      {/* Keep mounted for BOTH directions, using the existing MemoryFilter transition. */}
      <div ref={menuRef} id={id} role="menu" aria-label="Workspace tools" aria-hidden={!isOpen} inert={!isOpen}
        className={`pac-more-menu absolute z-30 min-w-[180px] rounded-lg p-2 overflow-auto focus:outline-none shadow-lg shadow-black/10 dark:shadow-black/20 bg-white dark:bg-[#303030] border border-[#F0F0F0] dark:border-[#3C3C3C] transition-all duration-200 origin-top-right ${
          isOpen ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'
        }`}
        onBlur={event => { if (!rootRef.current?.contains(event.relatedTarget as Node)) setIsOpen(false) }}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
          const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
          const index = items.indexOf(document.activeElement as HTMLButtonElement)
          const next = event.key === 'ArrowDown' ? (index + 1) % items.length
            : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1
          if (next >= 0) { event.preventDefault(); items[next]?.focus() }
        }}>
        {options.map(({ name, icon: Icon, ...color }) => (
          <button key={name} type="button" role="menuitemradio" aria-checked={value === name}
            tabIndex={isOpen ? 0 : -1} style={colors({ name, icon: Icon, ...color })}
            className={`w-full min-h-11 flex items-center gap-2 py-2 pl-2 pr-8 relative rounded text-sm cursor-pointer hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] focus-visible:bg-[#f0f0f0] dark:focus-visible:bg-[#2a2a2a] ${value === name ? 'font-medium text-[#262626] dark:text-white' : 'text-[#5a5a5a] dark:text-[#a0a0a0]'}`}
            onClick={() => { onSelect(name); close() }}>
            <Icon className="pac-tool-icon" size={16} aria-hidden="true" />{name}
            {value === name && <Check className="pac-tool-icon absolute right-2" size={16} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  )
}
