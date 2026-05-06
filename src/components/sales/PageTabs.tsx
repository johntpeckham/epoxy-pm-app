'use client'

export interface PageTabSpec<K extends string = string> {
  key: K
  label: string
}

interface PageTabsProps<K extends string> {
  tabs: PageTabSpec<K>[]
  activeKey: K
  onChange: (key: K) => void
}

export default function PageTabs<K extends string>({ tabs, activeKey, onChange }: PageTabsProps<K>) {
  return (
    <div className="px-4 sm:px-6 border-b border-gray-200 dark:border-[#2a2a2a] flex items-center gap-6 overflow-x-auto">
      {tabs.map((t) => {
        const isActive = activeKey === t.key
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`-mb-px py-2 text-sm whitespace-nowrap transition-colors ${
              isActive
                ? 'text-amber-500 border-b-[1.5px] border-amber-500 font-medium'
                : 'text-gray-400 hover:text-gray-600 border-b-[1.5px] border-transparent'
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
