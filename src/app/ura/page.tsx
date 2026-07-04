import Link from 'next/link'
import { ExternalLink, FolderTree, PhoneCall, PlayCircle, TerminalSquare } from 'lucide-react'

const commands = [
  'npm run ura:install',
  'npm run ura:start',
  'npm run ura:dev',
]

const paths = [
  'apps/ura-balao/backend',
  'apps/ura-balao/asterisk',
  'apps/ura-balao/scripts',
  'docs/ura-balao-integracao.md',
]

export default function UraPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">URA Ativa</h1>
          <p className="page-subtitle">
            Projeto unificado no mesmo repositório, mantido como serviço local separado do CRM.
          </p>
        </div>
      </div>

      <div className="page-content space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <PhoneCall size={18} />
              <h2 className="font-semibold text-white">Painel local</h2>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              A URA roda fora do Next.js para preservar Asterisk AMI, SQLite e scripts Windows.
            </p>
            <a
              href="http://localhost:3012"
              target="_blank"
              rel="noreferrer"
              className="btn-primary inline-flex"
            >
              <ExternalLink size={15} />
              Abrir URA local
            </a>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <PlayCircle size={18} />
              <h2 className="font-semibold text-white">Atalhos Windows</h2>
            </div>
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Scripts criados na raiz deste projeto:
            </p>
            <div className="space-y-2 text-sm">
              <code className="block">install-ura-balao.cmd</code>
              <code className="block">start-ura-balao.cmd</code>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <FolderTree size={18} />
              <h2 className="font-semibold text-white">Documentação</h2>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Guia de integração e execução da URA dentro deste monorepo.
            </p>
            <Link href="/configuracoes" className="btn-secondary inline-flex">
              Ver CRM / Configurações
            </Link>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <TerminalSquare size={18} />
            <h2 className="font-semibold text-white">Comandos pela raiz</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {commands.map(command => (
              <code key={command} className="block rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--border-color)' }}>
                {command}
              </code>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold text-white mb-4">Estrutura incorporada</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {paths.map(path => (
              <code key={path} className="block rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--border-color)' }}>
                {path}
              </code>
            ))}
          </div>
          <p className="text-sm mt-4" style={{ color: 'var(--text-secondary)' }}>
            A URA foi trazida inteira para dentro do repositório, mas continua isolada do runtime do CRM para
            evitar regressões no app Next.js e no deploy da Vercel.
          </p>
        </div>
      </div>
    </div>
  )
}
