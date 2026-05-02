import { useOptimisticBalance } from '../store/useBalanceStore'
import { formatNusdcFixed } from '../lib/format'

export function HeaderBalance() {
  const { balance, isInitialized } = useOptimisticBalance()

  if (!isInitialized) return null

  return (
    <div className="hidden sm:flex flex-col items-end px-3 py-1.5 rounded-lg border border-gold-subtle bg-gold-400/5 shadow-[inset_0_0_12px_rgba(212,175,55,0.05)]">
      <span className="text-xs uppercase tracking-widest text-gold-300/80 font-bold leading-none mb-1">
        Balance
      </span>
      <span className="font-mono text-sm text-gold-200 leading-none">
        {formatNusdcFixed(balance)} <span className="text-xs ml-0.5 opacity-70">NUSDC</span>
      </span>
    </div>
  )
}
