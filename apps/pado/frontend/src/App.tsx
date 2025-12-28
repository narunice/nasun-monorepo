/**
 * Pado - DEX Trading App
 * App 컴포넌트: 레이아웃 + 라우팅만 담당
 */

import { Header } from './components/layout';
import { AppRoutes } from './routes';
import { NETWORK_CONFIG } from './config/network';

export default function App() {
  return (
    <div className="min-h-screen bg-theme-bg-primary text-theme-text-primary">
      <Header />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <AppRoutes />

        {/* Network Info */}
        <div className="mt-8 text-center text-sm text-theme-text-muted">
          <p>Connected to Nasun Devnet</p>
          <p className="font-mono text-xs">{NETWORK_CONFIG.rpcUrl}</p>
        </div>
      </main>
    </div>
  );
}
