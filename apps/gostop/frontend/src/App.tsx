import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { WalletConnect } from '@nasun/wallet-ui'
import { HeaderSoundToggle } from './components/HeaderSoundToggle'
import { HeaderBalance } from './components/HeaderBalance'
import LotteryPage from './pages/LotteryPage'
import ScratchCardPage from './pages/ScratchCardPage'
import NumberMatchPage from './pages/NumberMatchPage'
import MinesPage from './pages/MinesPage'
import HomePage from './pages/HomePage'
import FloorPage from './pages/FloorPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import GameHistoryPage from './pages/GameHistoryPage'
import { ENABLE_CRASH } from './lib/gostop-config'

// Build-time gate (C2). dev/staging dist에서는 CrashPage 코드 자체가 tree-shake로 제거됨.
const CrashPage = ENABLE_CRASH ? lazy(() => import('./pages/CrashPage')) : null

interface NavEntry {
  to: string
  label: string
}

const NAV_ITEMS: NavEntry[] = [
  { to: '/floor', label: 'Floor' },
  { to: '/games/history', label: 'History' },
]

// Runtime second-layer (A-W3): build-time gate가 정상 동작하면 dev/staging dist에 코드 자체 없음.
// runtime guard는 prod dist를 다른 hostname에서 재서빙하는 우회 시나리오 한정 방어.
function CrashRouteElement() {
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  const isProdHost = host === 'gostop.app' || host === 'www.gostop.app'
  // Allow localhost so dev/staging can render the UI for design work.
  // Production runtime guard remains intact for non-prod hostnames serving prod dist.
  const isDevHost = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local') || import.meta.env.DEV
  if (!isProdHost && !isDevHost) return <CrashDisabledPage />
  if (!CrashPage) return <CrashDisabledPage />
  return (
    <Suspense fallback={<div className="panel p-10 text-center text-neutral-300">Loading...</div>}>
      <CrashPage />
    </Suspense>
  )
}

function CrashDisabledPage() {
  return (
    <div className="panel p-10 text-center max-w-md mx-auto">
      <h1 className="font-display text-3xl text-gold mb-3">Crash is production-only</h1>
      <p className="text-base text-neutral-300">Visit gostop.app to play.</p>
    </div>
  )
}

// Reset scroll on every route change. Without this, navigating from a
// long page (Floor) to a shorter one keeps the previous scroll offset
// and lands the user mid-page (often staring at the footer).
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

import { useBalanceSync } from './hooks/useBalanceSync'

export default function App() {
  useBalanceSync() // Start background balance sync

  return (
    <div className="min-h-screen flex flex-col">
      <ScrollToTop />
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-5 py-6 sm:py-10">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/floor" element={<FloorPage />} />
          <Route path="/lottery" element={<LotteryPage />} />
          <Route path="/scratch" element={<ScratchCardPage />} />
          <Route path="/numbermatch" element={<NumberMatchPage />} />
          <Route path="/mines" element={<MinesPage />} />
          {ENABLE_CRASH && <Route path="/crash" element={<CrashRouteElement />} />}
          <Route path="/games/history" element={<GameHistoryPage />} />
          <Route path="/callback" element={<AuthCallbackPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const menuRef = useRef<HTMLDivElement>(null)

  // Close the mobile menu on route change.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  // Close on outside click.
  useEffect(() => {
    if (!menuOpen) return
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-ink-950/80 border-b border-gold-subtle">
      <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between gap-3">
        <NavLink to="/" className="flex items-center gap-3 group">
          <LogoMark />
          <span className="font-display text-2xl tracking-wide text-gold">GoStop</span>
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs uppercase tracking-[0.15em] border border-amber-400/40 bg-amber-950/30 text-amber-300/90">
            Nasun Devnet
          </span>
        </NavLink>

        {/* Desktop nav (md+) */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.to} to={item.to} label={item.label} />
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <HeaderBalance />
          <HeaderSoundToggle />
          <div className="shrink-0">
            <WalletConnect />
          </div>
          {/* Mobile hamburger (<md) */}
          <div className="md:hidden relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              className="w-11 h-11 flex items-center justify-center rounded-full border border-gold-subtle text-gold-200 hover:border-gold-200/60"
            >
              <HamburgerIcon open={menuOpen} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-12 w-44 panel p-2 flex flex-col gap-1 animate-slide-in">
                {NAV_ITEMS.map((item) => (
                  <NavItem
                    key={item.to}
                    to={item.to}
                    label={item.label}
                    fullWidth
                    onSelect={() => setMenuOpen(false)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function NavItem({
  to,
  label,
  fullWidth,
  onSelect,
}: {
  to: string
  label: string
  fullWidth?: boolean
  onSelect?: () => void
}) {
  return (
    <NavLink
      to={to}
      end
      onClick={onSelect}
      className={({ isActive }) =>
        `${fullWidth ? 'w-full' : ''} px-3 py-2 rounded-full text-sm md:text-base font-medium transition-all min-h-[44px] flex items-center ${
          isActive
            ? 'text-gold-300 bg-gold-400/10 shadow-[inset_0_0_0_1px_rgba(212,175,55,0.3)]'
            : 'text-neutral-200 hover:text-gold-200'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      {open ? (
        <path
          d="M5 5l10 10M15 5L5 15"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : (
        <>
          <path d="M3 6h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M3 10h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M3 14h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

function LogoMark() {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gold-gradient shadow-gold-glow"
    >
      <span className="font-display text-ink-900 text-lg font-bold leading-none">G</span>
    </span>
  )
}

function Footer() {
  return (
    <footer className="border-t border-gold-subtle">
      <div className="max-w-7xl mx-auto px-5 py-6 space-y-5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-neutral-300">
          <span>
            GoStop.app{' '}
            <span className="text-neutral-200">- Nasun Devnet prototype</span>
          </span>
          <span className="font-mono text-sm text-neutral-200">v0.0.1</span>
        </div>
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-4 text-sm leading-relaxed text-amber-100">
          <p>
            <span className="font-semibold text-amber-200">Disclaimer.</span>{' '}
            This site is a proof-of-concept prototype operating on Nasun
            Devnet. It is provided strictly for testing and entertainment, and
            is not a financial product. All tokens and balances shown here
            are test assets that hold no monetary value and cannot be
            redeemed. The devnet may be reset at any time without prior
            notice, which will erase all balances, history, and game state.
          </p>
        </div>
      </div>
    </footer>
  )
}

function NotFound() {
  return (
    <div className="panel p-10 text-center">
      <h1 className="font-display text-4xl text-gold mb-3">404</h1>
      <p className="text-base text-neutral-200">This table is not on the floor.</p>
    </div>
  )
}
