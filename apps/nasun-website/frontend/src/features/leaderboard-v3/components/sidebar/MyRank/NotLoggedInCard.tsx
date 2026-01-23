import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth";

export function NotLoggedInCard() {
  const { signInWithTwitter } = useAuth();

  return (
    <div className="p-5 bg-gradient-to-br from-nasun-c5/20 to-nasun-c4/30 border border-white/10 rounded-sm">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 bg-nasun-c3/20 rounded-lg">
          <Trophy className="w-5 h-5 text-nasun-c3" />
        </div>
        <div>
          <h4 className="font-bold text-nasun-white text-sm uppercase tracking-tight">My Rank</h4>
          <p className="text-xs text-nasun-white/50 mt-0.5">Sign in to see your ranking</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={signInWithTwitter} variant="c4" size="sm" className="flex-1 text-xs">
          Sign in with
          <svg className="w-3.5 h-3.5 ml-1.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
