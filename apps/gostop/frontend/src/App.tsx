import { Routes, Route, NavLink } from 'react-router-dom'
import { WalletConnect } from '@nasun/wallet-ui'
import LotteryPage from './pages/LotteryPage'
import HomePage from './pages/HomePage'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-6xl w-full mx-auto px-5 py-10">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/lottery" element={<LotteryPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}

function Header() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-ink-950/80 border-b border-gold-subtle">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
        <NavLink to="/" className="flex items-center gap-3 group">
          <LogoMark />
          <span className="font-display text-2xl tracking-wide text-gold">GoStop</span>
        </NavLink>

        <nav className="flex flex-wrap items-center gap-1">
          <NavItem to="/" label="Home" />
          <NavItem to="/lottery" label="Lottery" />
        </nav>

        <div className="shrink-0">
          <WalletConnect />
        </div>
      </div>
    </header>
  )
}

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `px-3 py-2 rounded-full text-sm md:text-base font-medium transition-all min-h-[44px] flex items-center ${
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
      <div className="max-w-6xl mx-auto px-5 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-neutral-300">
        <span>
          GoStop.app{' '}
          <span className="text-neutral-200">- Nasun Devnet prototype</span>
        </span>
        <span className="font-mono text-sm text-neutral-200">v0.0.1</span>
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
