import { Outlet } from 'react-router-dom';
import Header from '../Header';
import ChainResetBanner from './ChainResetBanner';

export default function Layout() {
  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      <Header />
      <ChainResetBanner />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
