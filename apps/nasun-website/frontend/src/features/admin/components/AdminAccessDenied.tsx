import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function AdminAccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-nasun-black flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <div className="text-6xl mb-6">🔒</div>
        <h1 className="text-2xl font-medium text-nasun-white mb-4">Access Denied</h1>
        <p className="text-nasun-white/70 mb-8 leading-relaxed">
          You do not have permission to access the admin area.
          Please contact an administrator if you believe this is an error.
        </p>
        <Button
          onClick={() => navigate('/')}
          variant="c4"
          size="lg"
        >
          Return to Home
        </Button>
      </div>
    </div>
  );
}
