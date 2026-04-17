'use client'

import { useState, useRef, useEffect } from 'react'
import { PlusIcon, CalculatorIcon, CheckIcon } from 'lucide-react'

export interface ModuleDefinition {
  id: string
  label: string
  description: string
  icon: React.ReactNode
}

export const AVAILABLE_MODULES: ModuleDefinition[] = [
  {
    id: 'cpi_calculator',
    label: 'CPI Calculator',
    description: '60/40 split on final total',
    icon: <CalculatorIcon className="w-4 h-4 text-amber-500" />,
  },
]

interface AddModuleButtonProps {
  activeModules: string[]
  onAddModule: (moduleId: string) => void
}

export default function AddModuleButton({
  activeModules,
  onAddModule,
}: AddModuleButtonProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-gray-500 border-2 border-dashed border-gray-300 rounded-lg hover:text-amber-600 hover:border-amber-400 transition"
      >
        <PlusIcon className="w-3.5 h-3.5" />
        Add module
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg z-20 overflow-hidden">
          {AVAILABLE_MODULES.map((mod) => {
            const isActive = activeModules.includes(mod.id)
            return (
              <button
                key={mod.id}
                disabled={isActive}
                onClick={() => {
                  onAddModule(mod.id)
                  setOpen(false)
                }}
                className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition ${
                  isActive
                    ? 'opacity-50 cursor-default bg-gray-50'
                    : 'hover:bg-gray-50 cursor-pointer'
                }`}
              >
                <span className="mt-0.5 flex-shrink-0">{mod.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900">
                    {mod.label}
                  </p>
                  <p className="text-[11px] text-gray-400">{mod.description}</p>
                </div>
                {isActive && (
                  <CheckIcon className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
