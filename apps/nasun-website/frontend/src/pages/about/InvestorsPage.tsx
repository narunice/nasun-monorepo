import { useTranslation } from "react-i18next";
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLayout } from "../../components/layout/SectionLayout";
import { OuterBox } from "@/components/ui";
import { PageTitle } from "@/components/ui/PageTitle";
import { Button } from "@/components/ui/button";
import { FileText, Eye, Download } from "lucide-react";

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
  const { t } = useTranslation("investors");

  return (
    <div className="flex gap-2">
      <Button variant="outlineNw2" size="sm" className="flex-1" onClick={() => viewPdf(file)}>
        <Eye className="w-4 h-4 mr-2" />
        {t("actions.view")}
      </Button>
      <Button variant="outlineNw2" size="sm" className="flex-1" onClick={() => downloadPdf(file)}>
        <Download className="w-4 h-4 mr-2" />
        {t("actions.download")}
      </Button>
    </div>
  );
}

export default function InvestorsPage() {
  const { t } = useTranslation("investors");

  const pitchDecks = [
    { name: t("pitchDecks.nasun.name"), description: t("pitchDecks.nasun.description"), file: "Nasun-Pitchdeck.pdf" },
    { name: t("pitchDecks.baram.name"), description: t("pitchDecks.baram.description"), file: "Baram-Pitchdeck.pdf" },
    { name: t("pitchDecks.pado.name"), description: t("pitchDecks.pado.description"), file: "PADO-pitchdeck.pdf" },
    { name: t("pitchDecks.genSol.name"), description: t("pitchDecks.genSol.description"), file: "GenSol-Pitchdeck.pdf" },
  ];

  const litepaper = {
    name: t("litepaper.name"),
    file: "Nasun-Litepaper-2026.pdf",
  };

  return (
    <PageLayout>
      <SectionLayout className="!max-w-6xl">
        <div className="flex flex-col">
          <PageTitle as="h2" align="center">
            Investors
          </PageTitle>

          <h3 className="text-nasun-white/80 font-medium text-lg mb-4">{t("pitchDecks.title")}</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pitchDecks.map((deck) => (
              <OuterBox key={deck.file} color="nw0" padding="md" className="flex flex-col gap-4">
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

          <h3 className="text-nasun-white/80 font-medium text-lg mb-4 mt-12">{t("litepaper.title")}</h3>

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
