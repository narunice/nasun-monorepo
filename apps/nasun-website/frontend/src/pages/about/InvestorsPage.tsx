import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLayout } from "../../components/layout/SectionLayout";
import { OuterBox } from "@/components/ui";
import { PageTitle } from "@/components/ui/PageTitle";
import { Button } from "@/components/ui/button";
import { FileText, Eye, Download } from "lucide-react";

const pitchDecks = [
  { name: "Nasun Pitch Deck", description: "Nasun Protocol Overview", file: "Nasun-Pitchdeck.pdf" },
  { name: "Baram Pitch Deck", description: "AI Compliance Settlement Layer", file: "Baram-Pitchdeck.pdf" },
  { name: "Pado Pitch Deck", description: "Unified Onchain Finance", file: "PADO-pitchdeck.pdf" },
  { name: "Gen Sol Pitch Deck", description: "Sci-Fi Entertainment IP", file: "GenSol-Pitchdeck.pdf" },
];

const litepaper = {
  name: "Nasun Litepaper",
  file: "Nasun-Litepaper-2026.pdf",
};

export default function InvestorsPage() {
  return (
    <PageLayout>
      <SectionLayout className="!max-w-6xl">
        <div className="flex flex-col">
          <PageTitle as="h2" align="center">
            Investors
          </PageTitle>

          <h3 className="text-nasun-white/80 font-medium text-lg mb-4">Pitch Decks</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pitchDecks.map((deck) => (
              <OuterBox key={deck.name} color="nw0" padding="md" className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <FileText className="w-8 h-8 text-nasun-nw4/50 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-nasun-white">{deck.name}</h4>
                    <p className="text-sm text-nasun-white/60">{deck.description}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outlineNw2" size="sm" asChild>
                    <a href={`/downloads/${deck.file}`} target="_blank" rel="noopener noreferrer">
                      <Eye className="w-4 h-4 mr-2" />
                      View
                    </a>
                  </Button>
                  <Button variant="outlineNw2" size="sm" asChild>
                    <a href={`/downloads/${deck.file}`} download={deck.file}>
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </a>
                  </Button>
                </div>
              </OuterBox>
            ))}
          </div>

          <h3 className="text-nasun-white/80 font-medium text-lg mb-4 mt-12">Litepaper</h3>

          <OuterBox color="nw0" padding="md" className="flex flex-col gap-4 md:w-1/2">
            <div className="flex items-center gap-4">
              <FileText className="w-8 h-8 text-nasun-nw4/50 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-nasun-white">{litepaper.name}</h4>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outlineNw2" size="sm" asChild>
                <a href={`/downloads/${litepaper.file}`} target="_blank" rel="noopener noreferrer">
                  <Eye className="w-4 h-4 mr-2" />
                  View
                </a>
              </Button>
              <Button variant="outlineNw2" size="sm" asChild>
                <a href={`/downloads/${litepaper.file}`} download={litepaper.file}>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </a>
              </Button>
            </div>
          </OuterBox>
        </div>
      </SectionLayout>
    </PageLayout>
  );
}
