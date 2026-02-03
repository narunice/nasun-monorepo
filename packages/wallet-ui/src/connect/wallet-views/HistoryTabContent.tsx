/**
 * Shared history tab wrapper for connected wallet views.
 */

import { TransactionHistoryPanel } from "../../transaction/TransactionHistoryPanel";
import type { ViewMode } from "../types";

export function HistoryTabContent({
  onNavigate,
  setSendRecipient,
}: {
  onNavigate: (mode: ViewMode) => void;
  setSendRecipient: (addr: string | undefined) => void;
}) {
  return (
    <div className="max-h-[280px] overflow-y-auto overflow-x-hidden mx-2 bg-white dark:bg-zinc-800 rounded-b-lg rounded-t-lg nasun-thin-scroll">
      <TransactionHistoryPanel
        hideHeader
        limit={10}
        onSend={(address) => {
          setSendRecipient(address);
          onNavigate("send");
        }}
        onAddressBook={(address) => {
          setSendRecipient(address);
          onNavigate("address-book");
        }}
      />
    </div>
  );
}
