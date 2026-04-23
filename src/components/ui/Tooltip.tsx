import type { ReactNode } from 'react'

type Placement = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  label: string
  placement?: Placement
  children: ReactNode
  className?: string
}

const POSITION_CLASSES: Record<Placement, string> = {
  bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
  top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
  left: 'right-full mr-2 top-1/2 -translate-y-1/2',
  right: 'left-full ml-2 top-1/2 -translate-y-1/2',
}

export default function Tooltip({ label, placement = 'bottom', children, className = '' }: TooltipProps) {
  return (
    <span className={`group relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute ${POSITION_CLASSES[placement]} opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-opacity duration-150 bg-gray-900 text-white text-xs px-2 py-1 rounded-md whitespace-nowrap z-50 shadow-sm`}
      >
        {label}
      </span>
    </span>
  )
}
