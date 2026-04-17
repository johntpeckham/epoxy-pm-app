'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2Icon, RotateCcwIcon, ArrowLeftIcon } from 'lucide-react'
import DialerSetup from './DialerSetup'
import DialerSession from './DialerSession'
import { type QueuedContact, type SessionStats } from './dialerTypes'

interface DialerClientProps {
  userId: string
}

type Mode = 'setup' | 'session' | 'complete'

const EMPTY_STATS: SessionStats = {
  total: 0,
  connected: 0,
  voicemail: 0,
  no_answer: 0,
  busy: 0,
  wrong_number: 0,
  appointment: 0,
  skipped: 0,
}

export default function DialerClient({ userId }: DialerClientProps) {
  const [mode, setMode] = useState<Mode>('setup')
  const [queue, setQueue] = useState<QueuedContact[]>([])
  const [finalStats, setFinalStats] = useState<SessionStats>(EMPTY_STATS)

  function startSession(q: QueuedContact[]) {
    if (q.length === 0) return
    setQueue(q)
    setFinalStats({ ...EMPTY_STATS, total: q.length })
    setMode('session')
  }

  function handleEnd() {
    setMode('setup')
    setQueue([])
  }

  function handleComplete(stats: SessionStats) {
    setFinalStats(stats)
    setMode('complete')
  }

  function handleNewSession() {
    setMode('setup')
    setQueue([])
    setFinalStats(EMPTY_STATS)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-7 pt-4 flex-shrink-0">
        <Link
          href="/sales"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Sales
        </Link>
      </div>
      {mode === 'setup' && <DialerSetup userId={userId} onStart={startSession} />}
      {mode === 'session' && (
        <DialerSession
          userId={userId}
          queue={queue}
          onEnd={handleEnd}
          onComplete={handleComplete}
        />
      )}
      {mode === 'complete' && (
        <SessionComplete stats={finalStats} onNewSession={handleNewSession} />
      )}
    </div>
  )
}

function SessionComplete({
  stats,
  onNewSession,
}: {
  stats: SessionStats
  onNewSession: () => void
}) {
  const completed =
    stats.connected +
    stats.voicemail +
    stats.no_answer +
    stats.busy +
    stats.wrong_number
  const rows: { label: string; value: number; accent?: boolean }[] = [
    { label: 'Connected', value: stats.connected, accent: true },
    { label: 'Voicemail', value: stats.voicemail },
    { label: 'No answer', value: stats.no_answer },
    { label: 'Busy', value: stats.busy },
    { label: 'Wrong number', value: stats.wrong_number },
    { label: 'Appointments set', value: stats.appointment, accent: true },
    { label: 'Skipped', value: stats.skipped },
  ]

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="max-w-[520px] mx-auto px-6 pt-16 pb-12 text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-5">
          <CheckCircle2Icon className="w-7 h-7 text-emerald-600" />
        </div>
        <h1 className="text-[24px] font-medium text-gray-900 leading-tight">
          Session complete
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          Nicely done — {completed} of {stats.total} call
          {stats.total === 1 ? '' : 's'} logged.
        </p>

        <div className="mt-10 border border-gray-100 rounded-xl divide-y divide-gray-100 text-left">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between px-5 py-3"
            >
              <span
                className={`text-sm ${
                  r.accent ? 'text-gray-900 font-medium' : 'text-gray-600'
                }`}
              >
                {r.label}
              </span>
              <span
                className={`text-sm tabular-nums ${
                  r.accent ? 'text-emerald-700 font-medium' : 'text-gray-500'
                }`}
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            onClick={onNewSession}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            <RotateCcwIcon className="w-4 h-4" />
            New session
          </button>
        </div>
      </div>
    </div>
  )
}
