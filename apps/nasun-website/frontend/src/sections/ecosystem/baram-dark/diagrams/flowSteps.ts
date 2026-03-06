import {
  Users,
  Wallet,
  Lock,
  Shuffle,
  Cpu,
  Coins,
  ClipboardCheck,
  MessageSquare,
} from "lucide-react";
import type { ComponentType } from "react";

export type FlowStepKey =
  | "register"
  | "budget"
  | "request"
  | "assign"
  | "execute"
  | "settle"
  | "receive"
  | "dashboard";

export const flowStepsDark: {
  key: FlowStepKey;
  icon: ComponentType<{ className?: string }>;
  color: string;
}[] = [
  { key: "register", icon: Users, color: "bg-br-2/20 text-br-2" },
  { key: "budget", icon: Wallet, color: "bg-br-3/20 text-br-3" },
  { key: "request", icon: Lock, color: "bg-br-2/20 text-br-2" },
  { key: "assign", icon: Shuffle, color: "bg-br-1/20 text-br-1" },
  { key: "execute", icon: Cpu, color: "bg-br-4/20 text-br-4" },
  { key: "settle", icon: Coins, color: "bg-br-1/20 text-br-1" },
  { key: "receive", icon: ClipboardCheck, color: "bg-br-1/20 text-br-1" },
  { key: "dashboard", icon: MessageSquare, color: "bg-br-3/20 text-br-3" },
];
