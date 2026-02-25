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

// Fetch the file with Accept: application/pdf so Vite's SPA fallback middleware
// (which intercepts Accept: text/html and */*) does not rewrite to index.html in dev.
async function fetchPdfBlob(file: string): Promise<Blob> {
  const res = await fetch(`/downloads/${file}`, { headers: { Accept: "application/pdf" } });
  if (!res.ok) throw new Error(`Failed to fetch ${file}: ${res.status}`);
  return res.blob();
}

async function viewPdf(file: string) {
  try {
    const blob = await fetchPdfBlob(file);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    window.open(`/downloads/${file}`, "_blank");
  }
}

async function downloadPdf(file: string) {
  try {
    const blob = await fetchPdfBlob(file);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  } catch {
    const a = document.createElement("a");
    a.href = `/downloads/${file}`;
    a.download = file;
    a.click();
  }
}

function PdfActions({ file }: { file: string }) {
  return (
    <div className="flex gap-2">
      <Button variant="outlineNw2" size="sm" className="flex-1" onClick={() => viewPdf(file)}>
        <Eye className="w-4 h-4 mr-2" />
        View
      </Button>
      <Button variant="outlineNw2" size="sm" className="flex-1" onClick={() => downloadPdf(file)}>
        <Download className="w-4 h-4 mr-2" />
        Download
      </Button>
    </div>
  );
}

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
                <PdfActions file={deck.file} />
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
            <PdfActions file={litepaper.file} />
          </OuterBox>
        </div>
      </SectionLayout>
    </PageLayout>
  );
}
