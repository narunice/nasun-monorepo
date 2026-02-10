import { Routes, Route, Link } from 'react-router-dom';
import { ErrorBoundary, Layout } from './components/layout';
import Home from './pages/Home';
import Transaction from './pages/Transaction';
import Transactions from './pages/Transactions';
import ObjectPage from './pages/Object';
import Address from './pages/Address';
import Validators from './pages/Validators';
import Validator from './pages/Validator';
import Checkpoints from './pages/Checkpoints';
import Checkpoint from './pages/Checkpoint';
import Package from './pages/Package';
import AuthCallback from './pages/AuthCallback';
import { Card } from './components/ui/Card';

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
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/tx/:digest" element={<Transaction />} />
          <Route path="/object/:id" element={<ObjectPage />} />
          <Route path="/address/:addr" element={<Address />} />
          <Route path="/validators" element={<Validators />} />
          <Route path="/validator/:address" element={<Validator />} />
          <Route path="/checkpoints" element={<Checkpoints />} />
          <Route path="/checkpoint/:sequence" element={<Checkpoint />} />
          <Route path="/package/:id" element={<Package />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
