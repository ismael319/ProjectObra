import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface ThemeContextType {
  isDark: boolean
  toggle: () => void
  brandColor: string
  setBrandColor: (color: string) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const DEFAULT_BRAND = '#2563EB'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const [brandColor, setBrandColorState] = useState(() => {
    return localStorage.getItem('brandColor') || DEFAULT_BRAND
  })

  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  useEffect(() => {
    localStorage.setItem('brandColor', brandColor)
    document.documentElement.style.setProperty('--brand-color', brandColor)
  }, [brandColor])

  const toggle = () => setIsDark((prev) => !prev)
  const setBrandColor = (color: string) => setBrandColorState(color)

  return (
    <ThemeContext.Provider value={{ isDark, toggle, brandColor, setBrandColor }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
