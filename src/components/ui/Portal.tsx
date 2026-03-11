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

    // Lock the viewport to prevent horizontal shifting on mobile.
    // position:fixed + left/right:0 prevents iOS elastic viewport movement
    // when the modal DOM is inserted.
    const prevPosition = document.body.style.position
    const prevLeft = document.body.style.left
    const prevRight = document.body.style.right
    const prevOverflow = document.body.style.overflow
    const prevOverflowX = document.body.style.overflowX

    document.body.style.position = 'fixed'
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.overflow = 'hidden'
    document.body.style.overflowX = 'hidden'

    return () => {
      document.body.style.position = prevPosition
      document.body.style.left = prevLeft
      document.body.style.right = prevRight
      document.body.style.overflow = prevOverflow
      document.body.style.overflowX = prevOverflowX
    }
  }, [mounted])

  if (!mounted) return null

  return createPortal(children, document.body)
}
