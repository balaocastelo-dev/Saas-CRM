import type { Metadata } from 'next'
import { Bot, MessageSquare, Zap } from 'lucide-react'

export const metadata: Metadata = { title: 'IA de Atendimento' }

const faqItems = [
  { pergunta: 'Qual é o endereço?', resposta: '📍 Av. Anchieta, 789 – Campinas/SP. Estacionamento no local!' },
  { pergunta: 'Qual é o horário de funcionamento?', resposta: '🕐 Segunda a sábado, das 08h às 18h.' },
  { pergunta: 'Quais formas de pagamento?', resposta: '💳 Cartão de crédito (12x), débito, PIX, boleto e dinheiro.' },
  { pergunta: 'Têm garantia nos produtos?', resposta: '🛡️ Produtos com garantia do fabricante. Serviços com 90 dias de garantia.' },
  { pergunta: 'Fazem assistência técnica?', resposta: '🔧 Sim! Notebooks, PCs, impressoras e celulares.' },
  { pergunta: 'Trabalham com produtos gamer?', resposta: '🎮 Sim! Especialistas em gamer: GPUs, CPUs, memórias e mais.' },
  { pergunta: 'Como pedir orçamento?', resposta: '💰 Responda ATENDENTE para falar com um vendedor.' },
  { pergunta: 'Como falar com atendente?', resposta: '👤 Digite ATENDENTE na conversa do WhatsApp.' },
]

export default function IAPage() {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">IA de Atendimento</h1>
          <p className="page-subtitle">Base de conhecimento para respostas automáticas</p>
        </div>
      </div>

      <div className="page-content">
        {/* Info card */}
        <div className="rounded-xl p-5 mb-6 flex items-start gap-4"
          style={{ background: 'linear-gradient(135deg, rgba(220,38,38,0.08), rgba(168,85,247,0.08))', border: '1px solid rgba(220,38,38,0.2)' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(220,38,38,0.15)' }}>
            <Bot size={24} style={{ color: 'var(--brand-red)' }} />
          </div>
          <div>
            <h3 className="font-semibold text-white mb-1">Como a IA funciona</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Quando um cliente envia uma mensagem, a IA verifica palavras-chave e responde automaticamente
              com base na base de conhecimento abaixo. Se não souber responder, transfere para um atendente humano.
              A IA <strong style={{ color: '#f87171' }}>nunca inventa preços</strong> — apenas informa para falar com o vendedor.
            </p>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-2">
                <div className="status-dot-green animate-pulse-soft" />
                <span className="text-xs text-green-400">IA ativa (configure em Configurações)</span>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ Grid */}
        <h3 className="font-semibold text-white mb-4">Base de Conhecimento</h3>
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {faqItems.map((item, i) => (
            <div key={i} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(59,130,246,0.12)' }}>
                  <MessageSquare size={15} style={{ color: '#3b82f6' }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white mb-1">{item.pergunta}</p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item.resposta}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Keywords */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card p-5">
            <h4 className="font-semibold text-white mb-3">Palavras de Opt-out</h4>
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
              Quando o cliente responder uma dessas palavras, é removido automaticamente das campanhas:
            </p>
            <div className="flex flex-wrap gap-2">
              {['SAIR', 'PARAR', 'CANCELAR', 'STOP', 'DESINSCREVER'].map(kw => (
                <span key={kw} className="badge badge-red">{kw}</span>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h4 className="font-semibold text-white mb-3">Palavras de Interesse</h4>
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
              Quando o cliente responder uma dessas palavras, uma oportunidade é criada automaticamente no CRM:
            </p>
            <div className="flex flex-wrap gap-2">
              {['QUERO', 'SIM', 'OK', 'ACEITO'].map(kw => (
                <span key={kw} className="badge badge-green">{kw}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Escalation */}
        <div className="card p-5 mt-4">
          <h4 className="font-semibold text-white mb-2">Transferência para humano</h4>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            A IA transfere automaticamente para um atendente quando:
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {[
              'O cliente digita: ATENDENTE, VENDEDOR, HUMANO ou PESSOA',
              'A IA não reconhece a intenção do cliente',
              'O cliente menciona preços específicos ou negociação',
              'A conversa envolve reclamação ou problema grave',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Zap size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--brand-red)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
