import { useNavigate } from "react-router-dom";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConnectTwitterCard() {
  const navigate = useNavigate();

  return (
    <div className="p-5 bg-gradient-to-br from-nasun-c5/20 to-nasun-c4/30 border border-white/10 rounded-sm">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 bg-yellow-500/20 rounded-lg">
          <Link2 className="w-5 h-5 text-yellow-400" />
        </div>
        <div>
          <h4 className="font-bold text-nasun-white text-sm uppercase tracking-tight">
            Link Your X Account
          </h4>
          <p className="text-xs text-nasun-white/50 mt-0.5">
            Connect your X account in My Account to see your rank.
          </p>
        </div>
      </div>
      <Button
        onClick={() => navigate("/my-account")}
        variant="c4"
        size="sm"
        className="w-full text-xs"
      >
        Go to My Account
      </Button>
    </div>
  );
}
