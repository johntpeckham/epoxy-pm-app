'use client'

import { useState, useEffect } from 'react'

export default function ViewportDebug() {
  const [info, setInfo] = useState({ innerHeight: 0, dvh: 0 })

  useEffect(() => {
    function measure() {
      // Measure 100dvh via a temporary element
      const el = document.createElement('div')
      el.style.height = '100dvh'
      el.style.position = 'fixed'
      el.style.top = '0'
      el.style.visibility = 'hidden'
      document.body.appendChild(el)
      const dvh = el.offsetHeight
      document.body.removeChild(el)

      setInfo({
        innerHeight: window.innerHeight,
        dvh,
      })
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.85)',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: '11px',
        padding: '4px 8px',
        pointerEvents: 'none',
      }}
    >
      innerHeight: {info.innerHeight}px | 100dvh: {info.dvh}px | diff:{' '}
      {info.dvh - info.innerHeight}px | SA-bottom:{' '}
      {typeof window !== 'undefined'
        ? getComputedStyle(document.documentElement).getPropertyValue(
            'env(safe-area-inset-bottom)'
          ) || 'N/A'
        : 'N/A'}
    </div>
  )
}
