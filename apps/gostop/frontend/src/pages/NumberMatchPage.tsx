import { useForceTierDebug } from '../components/celebration'
import { useNumberMatchPage } from '../features/numbermatch/hooks/useNumberMatchPage'
import { NMHeader } from '../features/numbermatch/components/NMHeader'
import { NMPickPanel } from '../features/numbermatch/components/NMPickPanel'
import { NMPlayPanel } from '../features/numbermatch/components/NMPlayPanel'
import { NMResultCard } from '../features/numbermatch/components/NMResultCard'
import { NMPayoutTable } from '../features/numbermatch/components/NMPayoutTable'
import { StreakIndicator } from '../components/StreakIndicator'
import { useActiveAddress } from '../hooks/useActiveAddress'

export default function NumberMatchPage() {
  const walletAddress = useActiveAddress()
  const {
    isWalletConnected,
    isPlaying,
    error,
    clearError,
    picks,
    togglePick,
    setPicks,
    result,
    setResult,
    onPlay,
  } = useNumberMatchPage()

  useForceTierDebug('Number Match')

  return (
    <div className="space-y-8 min-h-screen">
      <NMHeader />
      <div className="flex justify-end"><StreakIndicator player={walletAddress} /></div>

      {error && (
        <div className="panel p-4 border-red-500/50 bg-red-950/40 flex items-center justify-between gap-3">
          <p className="text-sm text-red-200">{error}</p>
          <button onClick={clearError} className="btn-ghost !py-1 !px-3 text-sm">
            Dismiss
          </button>
        </div>
      )}

      <NMPickPanel
        picks={picks}
        onToggle={togglePick}
        onClear={() => {
          setPicks([])
          setResult(null)
        }}
        result={result}
      />

      <NMPlayPanel
        picksCount={picks.length}
        isWalletConnected={isWalletConnected}
        isPlaying={isPlaying}
        onPlay={onPlay}
      />

      {result && <NMResultCard result={result} />}

      <NMPayoutTable />
    </div>
  )
}
