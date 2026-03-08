import { useState, FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { ButtonV3 } from "@/components/ui/button-v3";
import { ButtonV2 } from "@/components/ui/button-v2";
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
    descKey: "products.pado" as const,
    boxColor: "pd0" as const,
    iconColor: "text-pado-1",
  },
  {
    name: "Gen Sol",
    Icon: Orbit,
    descKey: "products.gensol" as const,
    boxColor: "sf1" as const,
    iconColor: "text-sf-orange",
  },
  {
    name: "Baram",
    Icon: Wind,
    descKey: "products.baram" as const,
    boxColor: "br2" as const,
    iconColor: "text-br-2",
  },
];

const HIGHLIGHTS = [
  { Icon: Layers, titleKey: "highlights.moveL1.title", descKey: "highlights.moveL1.desc" },
  { Icon: Server, titleKey: "highlights.liveDevnet.title", descKey: "highlights.liveDevnet.desc" },
  { Icon: Globe, titleKey: "highlights.korea.title", descKey: "highlights.korea.desc" },
  { Icon: Scale, titleKey: "highlights.regulation.title", descKey: "highlights.regulation.desc" },
] as const;

const LITEPAPER_FILE = "Nasun-Litepaper-2026.pdf";

// ---------------------------------------------------------------------------
// Form types
// ---------------------------------------------------------------------------
interface FormData {
  email: string;
  firm: string;
}

const INITIAL_FORM: FormData = {
  email: "",
  firm: "",
};

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
  const { t } = useTranslation("dev-investors");

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
      next.email = t("form.required");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      next.email = t("form.invalidEmail");
    }
    if (!formData.firm.trim()) next.firm = t("form.required");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const formId = import.meta.env.VITE_FORMSPREE_INVESTOR_FORM_ID;
    if (!formId) {
      toast.error(t("form.errorMessage"));
      console.error("[Investors] VITE_FORMSPREE_INVESTOR_FORM_ID is not configured");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`https://formspree.io/f/${formId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          email: formData.email,
          firm: formData.firm,
        }),
      });

      if (!res.ok) throw new Error(`Formspree error: ${res.status}`);
      setSubmitted(true);
    } catch (err) {
      console.error("[Investors] Form submission failed:", err);
      toast.error(t("form.errorMessage"));
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
        NASUN
      </PageTitle>

      <div className="text-center -mt-2 mb-6">
        <p className="text-xl md:text-2xl font-medium text-nasun-white tracking-wide">
          {t("hero.subtitle")}
        </p>
      </div>

      <p className="text-center text-nasun-white/80 text-base md:text-lg leading-relaxed max-w-3xl mx-auto mb-8">
        {t("hero.summary")}
      </p>

      {/* ----------------------------------------------------------------- */}
      {/* Sections                                                           */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col gap-12 md:gap-16 lg:gap-20">
        {/* ----- Products ----- */}
        <section>
          <p className="uppercase tracking-widest text-nasun-nw4 text-center mb-4 text-sm">
            {t("products.intro")}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PRODUCTS.map(({ name, Icon, descKey, boxColor, iconColor }) => (
              <OuterBox key={name} color={boxColor} padding="sm" className="!border-none">
                <Icon className={cn("w-6 h-6 mb-2", iconColor)} />
                <h6 className="mb-1 font-bold text-nasun-white">{name}</h6>
                <p className="text-nasun-white/70 text-sm">{t(descKey)}</p>
              </OuterBox>
            ))}
          </div>
        </section>

        {/* ----- Highlights ----- */}
        <section>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {HIGHLIGHTS.map(({ Icon, titleKey, descKey }) => (
              <OuterBox key={titleKey} color="nw0" padding="sm" className="text-center">
                <Icon className="w-6 h-6 text-nasun-nw1 mx-auto mb-2" />
                <h6 className="font-bold text-nasun-white mb-1">{t(titleKey)}</h6>
                <p className="text-xs md:text-sm text-nasun-white/60">{t(descKey)}</p>
              </OuterBox>
            ))}
          </div>
        </section>

        {/* ----- Public Litepaper ----- */}
        <section>
          <p className="text-[11px] uppercase tracking-[0.2em] text-nasun-nw4/60 mb-4">
            {t("litepaper.label")}
          </p>
          <SectionTitle as="h4">{t("litepaper.title")}</SectionTitle>
          <p className="text-nasun-white/80 mb-6">{t("litepaper.desc")}</p>

          <OuterBox color="nw1" padding="md">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <FileText className="w-8 h-8 text-nasun-nw4/50 flex-shrink-0" />
                <p className="text-sm text-nasun-white/60">{t("litepaper.meta")}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <ButtonV3 variant="nw1" outline size="sm" onClick={() => viewPdf(LITEPAPER_FILE)}>
                  <Eye className="w-4 h-4 mr-1.5" />
                  {t("actions.view")}
                </ButtonV3>
                <ButtonV3
                  variant="nw1"
                  outline
                  size="sm"
                  onClick={() => downloadPdf(LITEPAPER_FILE)}
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  {t("actions.download")}
                </ButtonV3>
              </div>
            </div>
          </OuterBox>
        </section>

        {/* ----- Investor Request Form ----- */}
        <section>
          <OuterBox color="nw0" padding="lg">
            <SectionTitle as="h4">{t("form.title")}</SectionTitle>
            <p className="text-nasun-white/70 mb-6">{t("form.desc")}</p>

            {submitted ? (
              <div className="text-center py-10">
                <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-6 h-6 text-green-400" />
                </div>
                <h5 className="text-nasun-white font-medium mb-2">{t("form.successTitle")}</h5>
                <p className="text-nasun-white/60 text-sm max-w-md mx-auto">
                  {t("form.successMessage")}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                {/* Row 1: Email + Firm */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="investor-email"
                      className="block text-sm text-nasun-white/70 mb-1.5"
                    >
                      {t("form.email")} <span className="text-red-400/80">*</span>
                    </label>
                    <input
                      id="investor-email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      placeholder={t("form.emailPlaceholder")}
                      className={inputClassName("email")}
                      autoComplete="email"
                    />
                    {errors.email && (
                      <p className="text-xs text-red-400 mt-1">{errors.email}</p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="investor-firm"
                      className="block text-sm text-nasun-white/70 mb-1.5"
                    >
                      {t("form.firm")} <span className="text-red-400/80">*</span>
                    </label>
                    <input
                      id="investor-firm"
                      type="text"
                      value={formData.firm}
                      onChange={(e) => updateField("firm", e.target.value)}
                      placeholder={t("form.firmPlaceholder")}
                      className={inputClassName("firm")}
                      autoComplete="organization"
                    />
                    {errors.firm && (
                      <p className="text-xs text-red-400 mt-1">{errors.firm}</p>
                    )}
                  </div>
                </div>

                {/* Submit */}
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
                      {t("form.submitting")}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      {t("form.submit")}
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
          <SectionTitle as="h4">{t("cta.title")}</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
            <ButtonV2
              variant="nasun-network"
              size="md"
              asChild
              className="w-full !from-[#496c9c80] !to-[#a2c5d880] hover:!from-[#496c9c] hover:!to-[#a2c5d8] hover:shadow-lg transition-all duration-300"
            >
              <Link to="/network/nsn">
                Explore <span className="font-semibold ml-1">Network</span>
              </Link>
            </ButtonV2>
            <ButtonV2
              variant="pado"
              size="md"
              asChild
              className="w-full !from-[#1a8cbc80] !to-[#5ee1e480] hover:!from-[#1a8cbc] hover:!to-[#5ee1e4] hover:shadow-lg transition-all duration-300"
            >
              <Link to="/ecosystem/pado">
                Explore <span className="font-semibold ml-1">Pado</span>
              </Link>
            </ButtonV2>
            <ButtonV2
              variant="baram"
              size="md"
              asChild
              className="w-full !from-[#5e9e5c80] !to-[#a2d4a080] hover:!from-[#5e9e5c] hover:!to-[#a2d4a0] hover:shadow-lg transition-all duration-300"
            >
              <Link to="/ecosystem/baram">
                Explore <span className="font-semibold ml-1">Baram</span>
              </Link>
            </ButtonV2>
            <ButtonV2
              variant="sf-orange"
              size="md"
              asChild
              className="w-full !from-[#f0534080] !to-[#f5826e80] hover:!from-[#f05340] hover:!to-[#f5826e] hover:shadow-lg transition-all duration-300"
            >
              <Link to="/ecosystem/gensol/main">
                Explore <span className="font-semibold ml-1">Gen Sol</span>
              </Link>
            </ButtonV2>
          </div>
        </section>
      </div>
    </SectionLayout>
  );
};

export default InvestorsContent;
