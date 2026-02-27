import { lazy } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { ErrorBoundary, Layout } from './components/layout';
import Home from './pages/Home';
import { Card } from './components/ui/Card';

// Lazy-loaded pages — each becomes a separate chunk
const Analytics = lazy(() => import('./pages/Analytics'));
const Transaction = lazy(() => import('./pages/Transaction'));
const Transactions = lazy(() => import('./pages/Transactions'));
const ObjectPage = lazy(() => import('./pages/Object'));
const Address = lazy(() => import('./pages/Address'));
const Validators = lazy(() => import('./pages/Validators'));
const Validator = lazy(() => import('./pages/Validator'));
const Checkpoints = lazy(() => import('./pages/Checkpoints'));
const Checkpoint = lazy(() => import('./pages/Checkpoint'));
const Package = lazy(() => import('./pages/Package'));
const Packages = lazy(() => import('./pages/Packages'));
const Tokens = lazy(() => import('./pages/Tokens'));
const Epoch = lazy(() => import('./pages/Epoch'));
const TopAccounts = lazy(() => import('./pages/TopAccounts'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));

function NotFound() {
  return (
    <Card variant="default" className="p-8 text-center">
      <h1 className="text-2xl font-bold text-foreground mb-2">Page Not Found</h1>
      <p className="text-muted-foreground mb-4">The page you are looking for does not exist.</p>
      <Link to="/" className="text-primary hover:underline">Back to Home</Link>
    </Card>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* OAuth callback route (outside Layout for full-page display) */}
        <Route path="/callback" element={<AuthCallback />} />

        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/tx/:digest" element={<Transaction />} />
          <Route path="/object/:id" element={<ObjectPage />} />
          <Route path="/address/:addr" element={<Address />} />
          <Route path="/validators" element={<Validators />} />
          <Route path="/validator/:address" element={<Validator />} />
          <Route path="/checkpoints" element={<Checkpoints />} />
          <Route path="/checkpoint/:sequence" element={<Checkpoint />} />
          <Route path="/package/:id" element={<Package />} />
          <Route path="/packages" element={<Packages />} />
          <Route path="/tokens" element={<Tokens />} />
          <Route path="/epoch/:id" element={<Epoch />} />
          <Route path="/top-accounts" element={<TopAccounts />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
