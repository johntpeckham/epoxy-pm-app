'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const prev = document.body.style.overflowX
    document.body.style.overflowX = 'hidden'
    return () => {
      document.body.style.overflowX = prev
    }
  }, [mounted])

  if (!mounted) return null

  return createPortal(
    <div style={{ overflowX: 'hidden', maxWidth: '100vw' }}>
      {children}
    </div>,
    document.body
  )
}
