'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pause, Play, Rocket, RotateCcw } from 'lucide-react'

type CampaignProcessControlsProps = {
  campaignId?: string
  status?: string
}

type ActionName = 'process' | 'start' | 'pause' | 'resume'

export default function CampaignProcessControls({
  campaignId,
  status,
}: CampaignProcessControlsProps) {
  const router = useRouter()
  const [loadingAction, setLoadingAction] = useState<ActionName | null>(null)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  async function handleAction(action: ActionName) {
    setLoadingAction(action)
    setError('')
    setFeedback('')

    try {
      const response = await fetch('/api/campanhas/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaignId,
          action,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Falha ao processar a campanha.')
      }

      setFeedback(payload.result?.message || payload.message || 'Ação executada com sucesso.')
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erro ao processar campanha.')
    } finally {
      setLoadingAction(null)
    }
  }

  const isGlobal = !campaignId

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {isGlobal ? (
          <button
            type="button"
            className="btn-secondary"
            disabled={loadingAction !== null}
            onClick={() => void handleAction('process')}>
            {loadingAction === 'process' ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}
            Processar campanhas prontas
          </button>
        ) : (
          <>
            {(status === 'draft' || status === 'scheduled') && (
              <button
                type="button"
                className="btn-primary"
                disabled={loadingAction !== null}
                onClick={() => void handleAction('start')}>
                {loadingAction === 'start' ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                Iniciar agora
              </button>
            )}

            {status === 'running' && (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={loadingAction !== null}
                  onClick={() => void handleAction('process')}>
                  {loadingAction === 'process' ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}
                  Processar lote
                </button>

                <button
                  type="button"
                  className="btn-ghost"
                  disabled={loadingAction !== null}
                  onClick={() => void handleAction('pause')}>
                  {loadingAction === 'pause' ? <Loader2 size={15} className="animate-spin" /> : <Pause size={15} />}
                  Pausar
                </button>
              </>
            )}

            {status === 'paused' && (
              <button
                type="button"
                className="btn-secondary"
                disabled={loadingAction !== null}
                onClick={() => void handleAction('resume')}>
                {loadingAction === 'resume' ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                Retomar
              </button>
            )}

            {status === 'scheduled' && (
              <button
                type="button"
                className="btn-ghost"
                disabled={loadingAction !== null}
                onClick={() => void handleAction('process')}>
                {loadingAction === 'process' ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}
                Testar lote agora
              </button>
            )}
          </>
        )}
      </div>

      {feedback && <p className="text-xs text-green-400">{feedback}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
