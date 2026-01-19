import type { WhitelistModalState } from "@/types/whitelist";

export const METAMASK_INSTALL_URL = "https://metamask.io/download/";

export const DIALOG_CONTENT_CLASS =
  "sm:max-w-md bg-gray-900 border-nasun-c5/50 backdrop-blur-lg rounded-xl";

export const STATE_COLORS: Record<WhitelistModalState, string> = {
  idle: "c1",
  intro: "c1",
  connecting: "c1",
  signing: "c2",
  submitting: "c4",
  success: "c3",
  already_joined: "c4",
  already_withdrawn: "c4",
  error: "coral",
};
