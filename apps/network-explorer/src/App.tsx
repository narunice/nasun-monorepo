import { Routes, Route } from 'react-router-dom';
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

function App() {
  return (
    <ErrorBoundary>
      <Routes>
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
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
