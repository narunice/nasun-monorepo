import { useState, lazy, Suspense } from 'react';
import { useUserStore } from '../../../store/userStore';

const BugReportModal = lazy(() => import('./BugReportModal'));

export default function BugReportButton() {
  const [open, setOpen] = useState(false);
  const user = useUserStore((s) => s.user);

  // Only show for authenticated users with a token
  if (!user?.cognitoToken) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-20 z-50 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105"
        aria-label="Report a bug"
        title="Report a bug"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5 text-white/70"
        >
          {/* Bug icon */}
          <path d="M8 2l1.88 1.88" />
          <path d="M14.12 3.88L16 2" />
          <path d="M9 7.13v-1a3.003 3.003 0 116 0v1" />
          <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 014-4h4a4 4 0 014 4v3c0 3.3-2.7 6-6 6" />
          <path d="M12 20v-9" />
          <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
          <path d="M6 13H2" />
          <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
          <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
          <path d="M22 13h-4" />
          <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
        </svg>
      </button>

      {open && (
        <Suspense fallback={null}>
          <BugReportModal open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
}
