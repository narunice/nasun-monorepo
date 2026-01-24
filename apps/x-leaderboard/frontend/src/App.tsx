import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Leaderboard from './components/leaderboard/Leaderboard';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-nasun-black">
        <Routes>
          <Route path="/" element={<Leaderboard />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
