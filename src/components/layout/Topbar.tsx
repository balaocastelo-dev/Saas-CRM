'use client'

import { Bell, Search } from 'lucide-react'

interface TopbarProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export default function Topbar({ title, subtitle, actions }: TopbarProps) {
  return (
    <header className="topbar">
      <div>
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
        )}
      </div>
      
      <div className="flex items-center gap-3">
        {actions}
        
        <button className="w-9 h-9 rounded-lg flex items-center justify-center relative transition-all hover:bg-white/5"
          style={{ border: '1px solid var(--border-color)' }}>
          <Bell size={16} style={{ color: 'var(--text-secondary)' }} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
            style={{ background: 'var(--brand-red)' }} />
        </button>
      </div>
    </header>
  )
}
