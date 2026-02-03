/**
 * WalletConnect View Router
 *
 * Routes wc-* ViewModes to their respective components.
 * Follows the same pattern as NsaViewRouter.
 */

import type { ViewMode } from "../connect/types";
import { WalletConnectPanel } from "./WalletConnectPanel";
import { WCPairingView } from "./WCPairingView";
import { WCSessionProposal } from "./WCSessionProposal";
import { WCRequestApproval } from "./WCRequestApproval";
import { WCSessionDetail } from "./WCSessionDetail";

interface WCViewRouterProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export function WCViewRouter({ viewMode, setViewMode }: WCViewRouterProps) {
  switch (viewMode) {
    case "wc-main":
      return <WalletConnectPanel setViewMode={setViewMode} />;
    case "wc-pair":
      return <WCPairingView setViewMode={setViewMode} />;
    case "wc-proposal":
      return <WCSessionProposal setViewMode={setViewMode} />;
    case "wc-request":
      return <WCRequestApproval setViewMode={setViewMode} />;
    case "wc-session-detail":
      return <WCSessionDetail setViewMode={setViewMode} />;
    default:
      return null;
  }
}
