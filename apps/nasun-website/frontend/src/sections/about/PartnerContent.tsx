import { useState, FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { ButtonV3 } from "@/components/ui/button-v3";
import { cn } from "@/utils/utils";
import {
  Layers,
  Server,
  Globe,
  Award,
  FileText,
  Lock,
  Eye,
  Download,
  Check,
  ArrowRight,
  Wallet,
  Wind,
  Orbit,
} from "lucide-react";
import naruImg from "@/assets/images/naru-profile.webp";
import overclockedImg from "@/assets/images/overclocked-profile.webp";

// ---------------------------------------------------------------------------
// PDF helpers (same pattern as InvestorsPage)
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
    descColor: "text-pd3",
  },
  {
    name: "Gen Sol",
    Icon: Orbit,
    descKey: "products.gensol" as const,
    boxColor: "sf1" as const,
    iconColor: "text-sf-orange",
    descColor: "text-sf-gray",
  },
  {
    name: "Baram",
    Icon: Wind,
    descKey: "products.baram" as const,
    boxColor: "br2" as const,
    iconColor: "text-br-2",
    descColor: "text-br-2",
  },
];

const HIGHLIGHTS = [
  { Icon: Layers, titleKey: "highlights.moveL1.title", descKey: "highlights.moveL1.desc" },
  { Icon: Server, titleKey: "highlights.liveDevnet.title", descKey: "highlights.liveDevnet.desc" },
  { Icon: Globe, titleKey: "highlights.korea.title", descKey: "highlights.korea.desc" },
  { Icon: Award, titleKey: "highlights.grants.title", descKey: "highlights.grants.desc" },
] as const;

const PARTICIPANT_TYPES = ["accredited", "institutional", "fund", "strategic", "builder"] as const;

const FOUNDERS = [
  {
    name: "Naru",
    title: "Nasun Lead",
    image: naruImg,
    bullets: [
      "12 Korean film classics edited/produced (Kim Ki-duk, Jung Ji-woo)",
      "Cannes \u00B7 Berlin \u00B7 Venice premieres",
      "Hallyu Film \u2192 2 SCIE papers \u2192 Web3 + AI workflows",
      "Dongguk University, Korea University Master",
    ],
  },
  {
    name: "Overclocked",
    title: "Ecosystem Lead",
    image: overclockedImg,
    bullets: [
      "Theatrical feature written/directed (Korea release)",
      "20+ years production: Microsoft, Nike, IBM",
      "UE5 C++ Gen Sol alpha. AWS infra. Web3 community builder",
      "University of Michigan English Lit.",
    ],
  },
];

const LITEPAPER_FILE = "Nasun-Litepaper-2026.pdf";

// ---------------------------------------------------------------------------
// Form types
// ---------------------------------------------------------------------------
interface FormData {
  fullName: string;
  organization: string;
  email: string;
  participantType: string;
  primaryInterest: string;
  accreditedConfirm: boolean;
}

const INITIAL_FORM: FormData = {
  fullName: "",
  organization: "",
  email: "",
  participantType: "",
  primaryInterest: "",
  accreditedConfirm: false,
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
const PartnerContent = () => {
  const { t } = useTranslation("partner");

  // Form state
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
    if (!formData.fullName.trim()) next.fullName = t("form.required");
    if (!formData.organization.trim()) next.organization = t("form.required");
    if (!formData.email.trim()) {
      next.email = t("form.required");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      next.email = t("form.invalidEmail");
    }
    if (!formData.participantType) next.participantType = t("form.required");
    if (!formData.accreditedConfirm) next.accreditedConfirm = t("form.mustConfirm");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    // TODO: Wire to backend API endpoint (e.g., API Gateway + Lambda + SES)
    // For now, simulate submission delay
    await new Promise((r) => setTimeout(r, 1200));
    console.info("[Partner] Materials request submitted:", formData);
    setSubmitting(false);
    setSubmitted(true);
  };

  const inputClassName = (field: keyof FormData) =>
    cn(INPUT_BASE, errors[field] ? INPUT_ERROR : INPUT_NORMAL);

  // Investment docs from i18n array
  const investmentDocs = t("investmentDocs", { returnObjects: true }) as string[];

  return (
    <SectionLayout className="!max-w-5xl">
      {/* ----------------------------------------------------------------- */}
      {/* Hero                                                               */}
      {/* ----------------------------------------------------------------- */}
      <PageTitle as="h2" align="center">
        {t("hero.title")}
      </PageTitle>

      <div className="text-center -mt-2 mb-6">
        <p className="text-lg md:text-xl text-nasun-white/80 max-w-3xl mx-auto leading-relaxed">
          {t("hero.subtitle")}
        </p>
      </div>

      {/* Products */}
      <div className="py-6">
        <p className="uppercase tracking-widest text-nasun-nw4 text-center mb-4">
          {t("hero.productsIntro")}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PRODUCTS.map(({ name, Icon, descKey, boxColor, iconColor, descColor }) => (
            <OuterBox key={name} color={boxColor} padding="sm" className="!border-none">
              <Icon className={cn("w-6 h-6 mb-2", iconColor)} />
              <h6 className="mb-1">{name}</h6>
              <p className={descColor}>{t(descKey)}</p>
            </OuterBox>
          ))}
        </div>
      </div>

      <p className="text-center text-base md:text-lg font-medium text-nasun-white mb-4">
        {t("hero.cta")}
      </p>

      {/* ----------------------------------------------------------------- */}
      {/* Sections                                                           */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col gap-12 md:gap-16 lg:gap-20">
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

        {/* ----- Public Materials ----- */}
        <section>
          <p className="text-[11px] uppercase tracking-[0.2em] text-nasun-nw4/60 mb-4">
            {t("materials.publicLabel")}
          </p>
          <SectionTitle as="h4">{t("materials.litepaper.title")}</SectionTitle>
          <p className="text-nasun-white/80 mb-6">{t("materials.litepaper.desc")}</p>

          <OuterBox color="nw0" padding="md">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <FileText className="w-8 h-8 text-nasun-nw4/50 flex-shrink-0" />
                <p className="text-sm text-nasun-white/60">{t("materials.litepaper.meta")}</p>
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

        {/* ----- Investment Materials (NDA-gated) ----- */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <Lock className="w-5 h-5 text-nasun-white/40" />
            <SectionTitle as="h4" className="!mb-0">
              {t("materials.investment.title")}
            </SectionTitle>
          </div>
          <p className="text-nasun-white/70 mb-6">{t("materials.investment.desc")}</p>

          <p className="text-sm text-nasun-white/50 mb-3">{t("materials.investment.ndaNote")}</p>
          <div className="flex flex-wrap gap-2">
            {investmentDocs.map((doc) => (
              <span
                key={doc}
                className="px-3 py-1.5 rounded-lg bg-nasun-white/5 border border-nasun-white/10 text-nasun-white/40 text-sm select-none"
              >
                {doc}
              </span>
            ))}
          </div>
        </section>

        {/* ----- Request Materials Form ----- */}
        <section>
          <OuterBox color="nw1" padding="lg">
            <SectionTitle as="h4">{t("form.title")}</SectionTitle>

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
                {/* Row 1: Name + Organization */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="partner-fullName"
                      className="block text-sm text-nasun-white/70 mb-1.5"
                    >
                      {t("form.fullName")}
                    </label>
                    <input
                      id="partner-fullName"
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => updateField("fullName", e.target.value)}
                      className={inputClassName("fullName")}
                      autoComplete="name"
                    />
                    {errors.fullName && (
                      <p className="text-xs text-red-400 mt-1">{errors.fullName}</p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="partner-org"
                      className="block text-sm text-nasun-white/70 mb-1.5"
                    >
                      {t("form.organization")}
                    </label>
                    <input
                      id="partner-org"
                      type="text"
                      value={formData.organization}
                      onChange={(e) => updateField("organization", e.target.value)}
                      className={inputClassName("organization")}
                      autoComplete="organization"
                    />
                    {errors.organization && (
                      <p className="text-xs text-red-400 mt-1">{errors.organization}</p>
                    )}
                  </div>
                </div>

                {/* Row 2: Email + Participant Type */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="partner-email"
                      className="block text-sm text-nasun-white/70 mb-1.5"
                    >
                      {t("form.email")}
                    </label>
                    <input
                      id="partner-email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      className={inputClassName("email")}
                      autoComplete="email"
                    />
                    {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
                  </div>
                  <div>
                    <label
                      htmlFor="partner-type"
                      className="block text-sm text-nasun-white/70 mb-1.5"
                    >
                      {t("form.participantType")}
                    </label>
                    <select
                      id="partner-type"
                      value={formData.participantType}
                      onChange={(e) => updateField("participantType", e.target.value)}
                      className={cn(inputClassName("participantType"), "appearance-none")}
                    >
                      <option value="" disabled>
                        {t("form.selectType")}
                      </option>
                      {PARTICIPANT_TYPES.map((key) => (
                        <option key={key} value={key} className="bg-nasun-black text-nasun-white">
                          {t(`form.types.${key}`)}
                        </option>
                      ))}
                    </select>
                    {errors.participantType && (
                      <p className="text-xs text-red-400 mt-1">{errors.participantType}</p>
                    )}
                  </div>
                </div>

                {/* Primary Interest */}
                <div>
                  <label
                    htmlFor="partner-interest"
                    className="block text-sm text-nasun-white/70 mb-1.5"
                  >
                    {t("form.primaryInterest")}
                  </label>
                  <textarea
                    id="partner-interest"
                    rows={3}
                    value={formData.primaryInterest}
                    onChange={(e) => updateField("primaryInterest", e.target.value)}
                    className={cn(INPUT_BASE, INPUT_NORMAL, "resize-none")}
                  />
                </div>

                {/* Accredited Investor Confirmation */}
                <label className="flex items-start gap-3 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={formData.accreditedConfirm}
                    onChange={(e) => updateField("accreditedConfirm", e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className={cn(
                      "mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-all",
                      formData.accreditedConfirm
                        ? "bg-nasun-nw1 border-nasun-nw1"
                        : errors.accreditedConfirm
                          ? "border-red-400/60 bg-nasun-black/50"
                          : "border-nasun-white/30 bg-nasun-black/50 group-hover:border-nasun-white/50",
                    )}
                  >
                    {formData.accreditedConfirm && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <span
                    className={cn(
                      "text-sm leading-relaxed",
                      errors.accreditedConfirm ? "text-red-400/80" : "text-nasun-white/70",
                    )}
                  >
                    {t("form.accreditedConfirm")}
                  </span>
                </label>
                {errors.accreditedConfirm && (
                  <p className="text-xs text-red-400 -mt-3">{errors.accreditedConfirm}</p>
                )}

                {/* Disclosure */}
                <p className="text-xs text-nasun-white/40 leading-relaxed">
                  {t("form.disclosure")}
                </p>

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
                      Submitting...
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

        {/* ----- Founders ----- */}
        <section>
          <SectionTitle as="h4">{t("founders.title")}</SectionTitle>
          <div className="space-y-6">
            {FOUNDERS.map((founder) => (
              <OuterBox
                key={founder.name}
                color="nw0"
                padding="md"
                className="flex flex-col md:flex-row gap-6"
              >
                {/* Photo */}
                <div className="md:w-1/5 flex-shrink-0">
                  <div className="w-32 h-32 md:w-full md:h-auto rounded-2xl overflow-hidden">
                    <img
                      src={founder.image}
                      alt={founder.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                {/* Bio */}
                <div className="md:w-4/5">
                  <h5 className="font-medium text-nasun-white mb-3">
                    {founder.name}{" "}
                    <span className="text-nasun-nw4 font-normal">| {founder.title}</span>
                  </h5>
                  <ul className="space-y-1.5">
                    {founder.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="flex items-start gap-2.5 text-nasun-white/80 text-sm"
                      >
                        <span className="text-nasun-nw1 mt-0.5 flex-shrink-0">&middot;</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </OuterBox>
            ))}
          </div>

          <div className="text-center mt-8">
            <ButtonV3 variant="nw1" outline size="md" asChild>
              <Link to="/about/founders">Full Founder Profiles</Link>
            </ButtonV3>
          </div>
        </section>
      </div>
    </SectionLayout>
  );
};

export default PartnerContent;
