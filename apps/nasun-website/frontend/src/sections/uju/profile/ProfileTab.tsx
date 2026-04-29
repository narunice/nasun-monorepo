import { ConnectedAccountsCard } from "@/sections/myAccount/ConnectedAccountsCard";
import { DangerZoneCard } from "@/sections/myAccount/DangerZoneCard";
import { NotificationsPanel } from "./NotificationsPanel";
import { UjuSectionHeader } from "../shared";

interface SectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

function Section({ title, subtitle, children }: SectionProps) {
  return (
    <section>
      <UjuSectionHeader accent title={title} subtitle={subtitle} />
      {children}
    </section>
  );
}

export function ProfileTab() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <Section
        title="Notifications"
        subtitle="Recent system messages and alerts"
      >
        <NotificationsPanel />
      </Section>

      <Section
        title="Connected Accounts"
        subtitle="Wallets and social accounts linked to your identity"
      >
        <ConnectedAccountsCard />
      </Section>

      <Section
        title="Danger Zone"
        subtitle="Irreversible account actions"
      >
        <DangerZoneCard />
      </Section>
    </div>
  );
}
