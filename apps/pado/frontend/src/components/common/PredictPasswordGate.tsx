import { useState } from 'react';

const SESSION_KEY = 'pado_predict_unlocked';

function isUnlocked(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === '1';
}

interface Props {
  children: React.ReactNode;
}

export function PredictPasswordGate({ children }: Props) {
  const [authed, setAuthed] = useState(isUnlocked);
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  if (authed) {
    return <>{children}</>;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (id === 'pado' && password === 'predict') {
      sessionStorage.setItem(SESSION_KEY, '1');
      setAuthed(true);
    } else {
      setError(true);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <div className="w-full max-w-sm">
        <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-8">
          <div className="mb-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-500/10 mb-4">
              <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-theme-text-primary">Prediction Markets</h2>
            <p className="text-sm text-theme-text-muted mt-1">Enter credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-theme-text-secondary mb-1.5">
                ID
              </label>
              <input
                type="text"
                value={id}
                onChange={(e) => { setId(e.target.value); setError(false); }}
                className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-sm text-theme-text-primary placeholder-theme-text-muted focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="Enter ID"
                autoComplete="username"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-text-secondary mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(false); }}
                className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border rounded-lg text-sm text-theme-text-primary placeholder-theme-text-muted focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="Enter password"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400">Incorrect ID or password.</p>
            )}

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
