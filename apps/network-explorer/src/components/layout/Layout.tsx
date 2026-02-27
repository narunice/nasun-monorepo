import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../Header';
import ChainResetBanner from './ChainResetBanner';
import Footer from './Footer';

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
    </div>
  );
}

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-300">
      <Header />
      <ChainResetBanner />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
