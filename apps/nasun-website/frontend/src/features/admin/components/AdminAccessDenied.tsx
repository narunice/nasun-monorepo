import { useNavigate } from 'react-router-dom';

export function AdminAccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-nasun-c6 flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <div className="text-6xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold text-white mb-4">Access Denied</h1>
        <p className="text-white/70 mb-8">
          You do not have permission to access the admin area.
          Please contact an administrator if you believe this is an error.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 bg-nasun-c4 text-white rounded-lg hover:bg-nasun-c5 transition-colors"
        >
          Return to Home
        </button>
      </div>
    </div>
  );
}
