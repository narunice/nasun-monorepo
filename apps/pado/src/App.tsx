/**
 * Pado - DEX Trading App
 * App 컴포넌트: 레이아웃 + 라우팅만 담당
 */

import { Header } from './components/layout';
import { AppRoutes } from './routes';
import { NETWORK_CONFIG } from './config/network';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Header />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <AppRoutes />

        {/* Network Info */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Connected to Nasun Devnet</p>
          <p className="font-mono text-xs">{NETWORK_CONFIG.rpcUrl}</p>
        </div>
      </main>
    </div>
  );
}
