'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, Users, MessageSquare, Megaphone, 
  FileText, Wrench, ShoppingBag, BarChart3, Settings,
  Zap, ChevronRight, Bot, Package, Inbox, LogOut
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const navSections = [
  {
    title: 'Principal',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/clientes', icon: Users, label: 'Clientes' },
      { href: '/atendimento', icon: Inbox, label: 'Atendimento' },
    ]
  },
  {
    title: 'WhatsApp',
    items: [
      { href: '/campanhas', icon: Megaphone, label: 'Campanhas' },
      { href: '/templates', icon: MessageSquare, label: 'Templates' },
      { href: '/ia', icon: Bot, label: 'IA de Atendimento' },
    ]
  },
  {
    title: 'Comercial',
    items: [
      { href: '/crm', icon: ChevronRight, label: 'CRM / Funil' },
      { href: '/orcamentos', icon: FileText, label: 'Orçamentos' },
      { href: '/ordens', icon: Wrench, label: 'Ordens de Serviço' },
      { href: '/produtos', icon: Package, label: 'Produtos' },
    ]
  },
  {
    title: 'Análise',
    items: [
      { href: '/relatorios', icon: BarChart3, label: 'Relatórios' },
    ]
  },
  {
    title: 'Sistema',
    items: [
      { href: '/configuracoes', icon: Settings, label: 'Configurações' },
    ]
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--brand-red)', boxShadow: '0 0 16px rgba(220,38,38,0.4)' }}>
          <Zap size={16} color="white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-white text-sm leading-none truncate">Balão CRM</p>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>WhatsApp Business</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {navSections.map((section) => (
          <div key={section.title} className="mb-4">
            <p className="sidebar-section-title">{section.title}</p>
            {section.items.map((item) => {
              const isActive = pathname === item.href || 
                (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-link ${isActive ? 'active' : ''}`}>
                  <item.icon size={17} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t p-3" style={{ borderColor: 'var(--border-color)' }}>
        <button onClick={handleLogout}
          className="sidebar-link w-full hover:!text-red-400 hover:!bg-red-500/10">
          <LogOut size={16} />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  )
}
