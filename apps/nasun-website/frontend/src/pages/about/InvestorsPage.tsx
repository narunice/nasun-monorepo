import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLayout } from "../../components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui";
import { FileText } from "lucide-react";

const pitchDecks = [
  { name: "Nasun", description: "Nasun Protocol Overview" },
  { name: "Baram", description: "AI Compliance Settlement Layer" },
  { name: "Pado", description: "Unified Onchain Finance" },
  { name: "GenSol", description: "Interactive Entertainment IP" },
];

export default function InvestorsPage() {
  return (
    <PageLayout>
      <SectionLayout className="!max-w-4xl gap-8 md:gap-12">
        <div className="text-center">
          <SectionTitle as="h2">Investors</SectionTitle>
          <p className="text-nasun-white/70 mt-2">
            Pitch decks and investor materials will be available here soon.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pitchDecks.map((deck) => (
            <div
              key={deck.name}
              className="flex items-center gap-4 p-6 rounded-lg border border-nasun-white/10 bg-gray-900/50"
            >
              <FileText className="w-8 h-8 text-nasun-white/30 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-nasun-white">{deck.name}</h4>
                <p className="text-sm text-nasun-white/50">{deck.description}</p>
                <p className="text-xs text-nasun-white/30 mt-1">Coming Soon</p>
              </div>
            </div>
          ))}
        </div>
      </SectionLayout>
    </PageLayout>
  );
}
