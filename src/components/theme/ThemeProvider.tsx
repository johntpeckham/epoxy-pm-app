'use client'

import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

// ── External theme store ─────────────────────────────────────────────────
// We use a tiny external store + useSyncExternalStore so theme reads stay
// in sync with localStorage and the DOM without setting React state inside
// useEffect (which is discouraged in React 19).
const listeners = new Set<() => void>()
let cachedTheme: Theme | null = null

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function getSnapshot(): Theme {
  if (cachedTheme !== null) return cachedTheme
  cachedTheme = readStoredTheme()
  return cachedTheme
}

function getServerSnapshot(): Theme {
  // Server can never know the user's preference; the inline FOUC script
  // applies the correct class to <html> before React hydrates, so the
  // visible UI is always correct even though state defaults to 'light'.
  return 'light'
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function applyThemeClass(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function setTheme(next: Theme) {
  cachedTheme = next
  applyThemeClass(next)
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // localStorage may be unavailable
  }
  listeners.forEach((l) => l())
}

export function toggleTheme() {
  setTheme(getSnapshot() === 'dark' ? 'light' : 'dark')
}

interface ThemeApi {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export function useTheme(): ThemeApi {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return { theme, setTheme, toggleTheme }
}

/**
 * ThemeProvider — currently a transparent wrapper.
 *
 * The actual theme state lives in an external store (see above) so it can
 * be read by `useTheme` from any client component without prop drilling.
 * The inline script in `src/app/layout.tsx` applies the persisted class to
 * <html> before hydration, preventing a flash of light mode.
 *
 * The component is kept so that the root layout has an explicit place to
 * mount theme infrastructure if it grows in the future (system-preference
 * listening, transition wrappers, etc.).
 */
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
