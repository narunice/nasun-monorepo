import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { ButtonV3 } from "@/components/ui/button-v3";
import { cn } from "@/utils/utils";
import {
  Wallet,
  Wind,
  Orbit,
  Layers,
  Server,
  Globe,
  Scale,
  FileText,
  Eye,
  Download,
  Check,
  ArrowRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// PDF helpers (shared pattern — see PartnerContent / InvestorsPage)
// ---------------------------------------------------------------------------
async function fetchPdfBlob(file: string): Promise<Blob> {
  const res = await fetch(`/downloads/${file}`, {
    headers: { Accept: "application/pdf" },
  });
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

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------
const PRODUCTS = [
  {
    name: "Pado",
    Icon: Wallet,
    desc: "Full-featured DeFi — DEX, prediction markets, lottery, social trading. Live on devnet.",
    iconColor: "text-pado-2",
  },
  {
    name: "Gen Sol",
    Icon: Orbit,
    desc: "Cinematic sci-fi IP universe — multiplayer shooter, animation, film.",
    iconColor: "text-sf-yellow",
  },
  {
    name: "Nasun AI",
    Icon: Wind,
    desc: "On-chain AI compliance settlement layer with TEE-based execution and auditable economic records.",
    iconColor: "text-br-1",
  },
];

const HIGHLIGHTS = [
  {
    Icon: Layers,
    title: "Move L1",
    desc: "Sub-second finality, parallel execution",
  },
  {
    Icon: Server,
    title: "Live Devnet",
    desc: "Full stack running — not a whitepaper",
  },
  {
    Icon: Globe,
    title: "Korea Market",
    desc: "16M users, $70B assets, zero native L1",
  },
  {
    Icon: Scale,
    title: "Regulatory Tailwind",
    desc: "Stablecoin law, RWA tokenization, AI Basic Act",
  },
];

const LITEPAPER_FILE = "Nasun-Litepaper-2026.pdf";

const HERO_PARAGRAPHS = [
  "Nasun is a Move-based Layer-1 blockchain built as infrastructure for finance, AI, and entertainment.",
  "Three live platforms power the ecosystem: Pado, a full-featured DeFi platform; Gen Sol, a cinematic sci-fi universe spanning games, animation, and film; and Nasun AI, on-chain governance for AI agents.",
  "Nasun is a global network building from a strategic beachhead. South Korea offers more than 16 million crypto users, approximately $70 billion in held digital assets, and no Korean-native decentralized trading venue or compliant self-custody infrastructure, a gap that is large, specific, and unaddressed.",
  "Regulatory frameworks are actively opening: stablecoin legislation, RWA tokenization initiatives, a tripling of national AI investment, and mandatory compliance requirements under Korea's AI Basic Act, now in effect. Korea's cultural export machine, reaching across film, television, and gaming, also gives the Gen Sol IP universe direct access to global audiences from launch.",
];

// ---------------------------------------------------------------------------
// Form types
// ---------------------------------------------------------------------------
interface FormData {
  email: string;
  firm: string;
}

const INITIAL_FORM: FormData = { email: "", firm: "" };

// ---------------------------------------------------------------------------
// Input styling constants
// ---------------------------------------------------------------------------
const INPUT_BASE =
  "w-full px-4 py-3 rounded-lg border bg-nasun-black/50 text-nasun-white placeholder:text-nasun-white/30 focus:outline-none transition-all text-sm";
const INPUT_NORMAL = "border-nasun-white/20 focus:border-nasun-nw1";
const INPUT_ERROR = "border-red-400/60 focus:border-red-400";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const InvestorsContent = () => {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormData, string>> = {};
    if (!formData.email.trim()) {
      next.email = "Required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      next.email = "Please enter a valid email address";
    }
    if (!formData.firm.trim()) next.firm = "Required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const formId = import.meta.env.VITE_FORMSPREE_INVESTOR_FORM_ID;
    if (!formId) {
      toast.error("Something went wrong. Please try again or reach out directly.");
      console.error("[Investors] VITE_FORMSPREE_INVESTOR_FORM_ID is not configured");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`https://formspree.io/f/${formId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: formData.email, firm: formData.firm }),
      });

      if (!res.ok) throw new Error(`Formspree error: ${res.status}`);
      setSubmitted(true);
    } catch (err) {
      console.error("[Investors] Form submission failed:", err);
      toast.error("Something went wrong. Please try again or reach out directly.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClassName = (field: keyof FormData) =>
    cn(INPUT_BASE, errors[field] ? INPUT_ERROR : INPUT_NORMAL);

  return (
    <SectionLayout className="!max-w-5xl">
      {/* ----------------------------------------------------------------- */}
      {/* Hero                                                               */}
      {/* ----------------------------------------------------------------- */}
      <PageTitle as="h2" align="center">
        ABOUT NASUN
      </PageTitle>

      <div className="max-w-3xl mx-auto mb-8 space-y-4 text-nasun-white/80 text-base md:text-lg leading-relaxed">
        {HERO_PARAGRAPHS.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
        <p className="font-bold text-nasun-white">
          The foundation is Korean. The ambition is global.
        </p>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Sections                                                           */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col gap-12 md:gap-16 lg:gap-20">
        {/* ----- Products ----- */}
        <section className="mt-2 md:mt-4">
          <p className="uppercase tracking-widest text-nasun-nw4 text-center mb-4 text-sm">
            Three platforms operational on Nasun Devnet and approaching public launch
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PRODUCTS.map(({ name, Icon, desc, iconColor }) => (
              <OuterBox key={name} color="nw0" padding="sm" className="!border-none !bg-nasun-nw3">
                <div className="flex items-start justify-between mb-2">
                  <h6 className="font-bold text-nasun-white">{name}</h6>
                  <Icon className={cn("w-5 h-5 flex-shrink-0", iconColor)} />
                </div>
                <p className="text-nasun-white/70 text-sm">{desc}</p>
              </OuterBox>
            ))}
          </div>
        </section>

        {/* ----- Highlights ----- */}
        <section>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {HIGHLIGHTS.map(({ Icon, title, desc }) => (
              <OuterBox key={title} color="nw1" padding="sm" className="text-center">
                <Icon className="w-6 h-6 text-nasun-nw1 mx-auto mb-2" />
                <h6 className="font-bold text-nasun-white mb-1">{title}</h6>
                <p className="text-xs md:text-sm text-nasun-white/60">{desc}</p>
              </OuterBox>
            ))}
          </div>
        </section>

        {/* ----- Public Litepaper ----- */}
        <section>
          <p className="text-sm uppercase tracking-[0.1em] text-nasun-nw4 mb-4">Public Materials</p>
          <SectionTitle as="h4">Litepaper</SectionTitle>
          <p className="text-nasun-white/80 mb-6">
            Protocol architecture, ecosystem products, and long-term vision.
          </p>

          <OuterBox color="nw1" padding="md">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <FileText className="w-8 h-8 text-nasun-nw4/50 flex-shrink-0" />
                <p className="text-sm text-nasun-white/60">Nasun Litepaper 2026 · PDF</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <ButtonV3 variant="nw1" outline size="sm" onClick={() => viewPdf(LITEPAPER_FILE)}>
                  <Eye className="w-4 h-4 mr-1.5" />
                  View
                </ButtonV3>
                <ButtonV3
                  variant="nw1"
                  outline
                  size="sm"
                  onClick={() => downloadPdf(LITEPAPER_FILE)}
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  Download
                </ButtonV3>
              </div>
            </div>
          </OuterBox>
        </section>

        {/* ----- Investor Request Form ----- */}
        <section>
          <OuterBox color="nw0" padding="lg">
            <SectionTitle as="h4">For Investors</SectionTitle>
            <p className="text-nasun-white/70 mb-6">
              Request the full investor litepaper and pitch deck, including tokenomics and funding
              details.
            </p>

            {submitted ? (
              <div className="text-center py-10">
                <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-6 h-6 text-green-400" />
                </div>
                <h5 className="text-nasun-white font-medium mb-2">Request Received</h5>
                <p className="text-nasun-white/60 text-sm max-w-md mx-auto">
                  Thank you for your interest in Nasun. We'll review your request and be in touch
                  within 48 hours.
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="space-y-5 flex flex-col items-center"
                noValidate
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                  <div>
                    <label
                      htmlFor="investor-email"
                      className="block text-sm text-nasun-white/70 mb-1.5"
                    >
                      Email <span className="text-red-400/80">*</span>
                    </label>
                    <input
                      id="investor-email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      placeholder="you@firm.com"
                      className={inputClassName("email")}
                      autoComplete="email"
                    />
                    {errors.email ? (
                      <p className="text-xs text-red-400 mt-1">{errors.email}</p>
                    ) : (
                      <p className="text-xs text-nasun-white/40 mt-1">
                        Please use your company email address.
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="investor-firm"
                      className="block text-sm text-nasun-white/70 mb-1.5"
                    >
                      Firm / Website <span className="text-red-400/80">*</span>
                    </label>
                    <input
                      id="investor-firm"
                      type="text"
                      value={formData.firm}
                      onChange={(e) => updateField("firm", e.target.value)}
                      placeholder="e.g. Paradigm or paradigm.xyz"
                      className={inputClassName("firm")}
                      autoComplete="organization"
                    />
                    {errors.firm && <p className="text-xs text-red-400 mt-1">{errors.firm}</p>}
                  </div>
                </div>

                <ButtonV3
                  type="submit"
                  variant="nw1"
                  size="lg"
                  disabled={submitting}
                  className="w-full md:w-auto"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Submitting...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Request Materials
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </ButtonV3>
              </form>
            )}
          </OuterBox>
        </section>

        {/* ----- Explore the Ecosystem CTA ----- */}
        <section className="text-center py-4 md:py-8">
          <SectionTitle as="h4">Explore the Ecosystem</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
            <ButtonV3 variant="nw4" outline size="md" asChild className="w-full bg-nasun-nw1/10">
              <Link to="/network/nsn">
                Explore <span className="font-semibold ml-1">Network</span>
              </Link>
            </ButtonV3>
            <ButtonV3 variant="nw4" outline size="md" asChild className="w-full bg-nasun-nw1/10">
              <Link to="/ecosystem/pado">
                Explore <span className="font-semibold ml-1">Pado</span>
              </Link>
            </ButtonV3>
            <ButtonV3 variant="nw4" outline size="md" asChild className="w-full bg-nasun-nw1/10">
              <Link to="/ecosystem/baram">
                Explore <span className="font-semibold ml-1">Nasun AI</span>
              </Link>
            </ButtonV3>
            <ButtonV3 variant="nw4" outline size="md" asChild className="w-full bg-nasun-nw1/10">
              <Link to="/ecosystem/gensol/main">
                Explore <span className="font-semibold ml-1">Gen Sol</span>
              </Link>
            </ButtonV3>
          </div>
        </section>
      </div>
    </SectionLayout>
  );
};

export default InvestorsContent;
