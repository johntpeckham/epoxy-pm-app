'use client'

import { useState } from 'react'
import { FileTextIcon } from 'lucide-react'

interface SetupPromptProps {
  onComplete: (startNumber: number) => void
}

export default function SetupPrompt({ onComplete }: SetupPromptProps) {
  const [number, setNumber] = useState(1000)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 text-center">
        <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <FileTextIcon className="w-6 h-6 text-amber-600" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Welcome to Proposals</h3>
        <p className="text-sm text-gray-500 mb-4">
          What number would you like to start your proposals at?
        </p>
        <input
          type="number"
          value={number}
          onChange={(e) => setNumber(Number(e.target.value))}
          className="w-full text-center text-lg font-semibold text-amber-600 border border-amber-200 rounded-lg px-4 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
        />
        <button
          onClick={() => onComplete(number)}
          className="w-full py-2.5 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 transition-colors"
        >
          Get Started
        </button>
      </div>
    </div>
  )
}
