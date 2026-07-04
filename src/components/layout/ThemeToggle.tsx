'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'balcao-crm-theme'

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(STORAGE_KEY)
    const resolvedTheme: ThemeMode = savedTheme === 'light' ? 'light' : 'dark'

    applyTheme(resolvedTheme)
    setTheme(resolvedTheme)
    setMounted(true)
  }, [])

  function handleToggle() {
    const nextTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    applyTheme(nextTheme)
    window.localStorage.setItem(STORAGE_KEY, nextTheme)
  }

  const isLight = theme === 'light'

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="sidebar-link w-full"
      aria-label={`Alternar para tema ${isLight ? 'escuro' : 'claro'}`}>
      {isLight ? <Moon size={16} /> : <Sun size={16} />}
      <span>{mounted ? `Tema ${isLight ? 'claro' : 'escuro'}` : 'Tema escuro'}</span>
    </button>
  )
}
