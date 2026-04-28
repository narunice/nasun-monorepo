import { UjuCard, UjuSectionHeader } from "../shared";

// Mockup placeholder. Wire to real news/events feed in a follow-up.
export function NewsEventsCard() {
  return (
    <UjuCard>
      <UjuSectionHeader
        accent
        title="News, Events, and Msgs"
        subtitle="Coming soon"
      />
      <div className="py-6 text-center text-base text-uju-secondary">
        News, events, and inbox messages will appear here.
      </div>
    </UjuCard>
  );
}
