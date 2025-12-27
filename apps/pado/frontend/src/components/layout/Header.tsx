import { WalletConnect } from '@nasun/wallet-ui';

export function Header() {
  return (
    <header className="border-b border-gray-800 px-6 py-4">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <img src="/temp-logo.png" alt="Pado" className="w-8 h-8" />
          <h1 className="text-2xl font-bold text-blue-400">Pado</h1>
        </div>
        <div className="flex items-center gap-4">
          <WalletConnect />
        </div>
      </div>
    </header>
  );
}
