import React, { useEffect, useRef } from "react";
import {
  Bot,
  Store,
  Brain,
  Wallet,
  Share2,
  Cloud,
  ClipboardCheck,
  CheckCircle2,
  Flame,
  Database,
  Lock,
  RefreshCw,
  ArrowRight,
} from "lucide-react";

type ColorVariant = "c3" | "c4" | "c1" | "c5";

interface WorkflowItem {
  icon: React.ReactNode;
  label: string;
  highlight?: boolean;
}

interface StepData {
  number: number;
  title: string;
  subtitle: string;
  color: ColorVariant;
  workflow: WorkflowItem[];
  descriptions: string[];
}

const colorStyles: Record<
  ColorVariant,
  { text: string; border: string; bg: string; bgLight: string }
> = {
  c3: {
    text: "text-nasun-c3",
    border: "border-nasun-c3",
    bg: "bg-nasun-c3",
    bgLight: "bg-nasun-white/5",
  },
  c4: {
    text: "text-nasun-c4",
    border: "border-nasun-c4",
    bg: "bg-nasun-c4",
    bgLight: "bg-nasun-white/5",
  },
  c1: {
    text: "text-nasun-c1",
    border: "border-nasun-c1",
    bg: "bg-nasun-c1",
    bgLight: "bg-nasun-white/5",
  },
  c5: {
    text: "text-nasun-c5",
    border: "border-nasun-c5",
    bg: "bg-nasun-c5",
    bgLight: "bg-nasun-white/5",
  },
};

const steps: StepData[] = [
  {
    number: 1,
    title: "Orchestration & Hiring",
    subtitle: "The Internal Intelligence Marketplace",
    color: "c3",
    workflow: [
      { icon: <Bot className="w-9 h-9" />, label: "BrandBot" },
      { icon: <Store className="w-9 h-9" />, label: "Marketplace" },
      { icon: <Brain className="w-9 h-9" />, label: "Cinematic LLM", highlight: true },
    ],
    descriptions: [
      "Searches the Nasun marketplace for specialized models",
      "Selects a Cinematic-Style LLM as an on-chain object",
      "Initiates pay-per-inference agreement",
      "Streams stablecoin payments directly to creator",
    ],
  },
  {
    number: 2,
    title: "Real-World Execution",
    subtitle: "Bridging On-Chain Intelligence to Off-Chain Action",
    color: "c4",
    workflow: [
      { icon: <Wallet className="w-9 h-9" />, label: "Treasury" },
      { icon: <Share2 className="w-9 h-9" />, label: "Social APIs" },
      { icon: <Cloud className="w-9 h-9" />, label: "Cloud (AWS)" },
    ],
    descriptions: [
      "Uses stablecoin-native wallet for external payments",
      "Pays social media APIs (X, Meta) for ad placement",
      "Settles cloud hosting invoices automatically",
      "All executed within predefined budget constraints",
    ],
  },
  {
    number: 3,
    title: "Validation & Settlement",
    subtitle: "Outcome-Based Economics",
    color: "c1",
    workflow: [
      { icon: <ClipboardCheck className="w-9 h-9" />, label: "Validation" },
      { icon: <CheckCircle2 className="w-9 h-9" />, label: "Approval" },
      { icon: <Flame className="w-9 h-9" />, label: "Token Burn", highlight: true },
    ],
    descriptions: [
      "Decentralized validators confirm campaign success",
      "Brand safety and compliance criteria verified",
      "Payments finalized automatically upon validation",
      "Portion of fees triggers $NASUN buy-back and burn",
    ],
  },
  {
    number: 4,
    title: "Memory & Optimization",
    subtitle: "Long-Term Intelligence Management",
    color: "c5",
    workflow: [
      { icon: <Database className="w-9 h-9" />, label: "Archive" },
      { icon: <Lock className="w-9 h-9" />, label: "Cryptographic" },
      { icon: <RefreshCw className="w-9 h-9" />, label: "Optimize" },
    ],
    descriptions: [
      "Every decision cryptographically signed and recorded",
      "Complete lineage: models used, data sources, validators",
      "Auditable history for enterprise compliance",
      "Storage Fund rebate for deleted obsolete data",
    ],
  },
];

const InfographicStep: React.FC<{ step: StepData; index: number }> = ({ step, index }) => {
  const ref = useRef<HTMLDivElement>(null);
  const styles = colorStyles[step.color];

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && ref.current) {
          ref.current.classList.add("opacity-100", "translate-y-0");
          ref.current.classList.remove("opacity-0", "translate-y-8");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.2 },
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="opacity-0 translate-y-8 transition-all duration-700 ease-out h-full"
      style={{ transitionDelay: `${index * 150}ms` }}
    >
      <div className="relative rounded-2xl border-2 border-nasun-white/20 bg-nasun-gray/50 backdrop-blur-sm p-6 md:p-8 hover:shadow-lg hover:shadow-nasun-white/10 transition-shadow duration-300 h-full flex flex-col">
        {/* Step Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-nasun-white flex items-center justify-center text-nasun-black font-bold text-xl md:text-2xl shrink-0">
            {step.number}
          </div>
          <div>
            <h4 className="text-xl md:text-2xl font-bold text-nasun-white">{step.title}</h4>
            <p className="text-nasun-white/60 text-sm md:text-base">{step.subtitle}</p>
          </div>
        </div>

        {/* Workflow Icons - Centered */}
        <div className="flex items-center justify-center gap-3 md:gap-4 mb-6">
          {step.workflow.map((item, i) => (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`w-16 h-16 md:w-20 md:h-20 rounded-xl bg-nasun-white/5 border ${
                    item.highlight ? "border-nasun-scarlet" : "border-nasun-white/20"
                  } flex items-center justify-center ${
                    item.highlight ? "text-nasun-scarlet" : "text-nasun-c1"
                  } transition-transform hover:scale-105`}
                >
                  {item.icon}
                </div>
                <span className="text-xs md:text-sm text-nasun-white/50">{item.label}</span>
              </div>
              {i < step.workflow.length - 1 && (
                <ArrowRight className="w-5 h-5 text-nasun-white/30 hidden sm:block mb-6" />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Descriptions - flex-grow to push content and equalize height */}
        <div className={`${styles.bgLight} rounded-xl p-4 md:p-5 flex-grow`}>
          <ul className="space-y-2">
            {step.descriptions.map((desc, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm md:text-base text-nasun-white/80"
              >
                <span className="text-nasun-c1 font-bold mt-0.5">→</span>
                <span>{desc}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

const AgentDayInfographic: React.FC = () => {
  return (
    <section className="mt-16 md:mt-20">
      {/* Header */}
      <div className="text-center mb-10 md:mb-14">
        <h3 className="text-2xl md:text-3xl lg:text-4xl font-bold text-nasun-white mb-4">
          A Day in the Life of an Autonomous Agent
        </h3>
        <p className="text-nasun-white/60 text-lg md:text-xl">The "Autonomous Brand Manager"</p>
      </div>

      {/* Steps Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        {steps.map((step, index) => (
          <InfographicStep key={step.number} step={step} index={index} />
        ))}
      </div>

      {/* Conclusion */}
      <div className="mt-12 md:mt-16 text-center max-w-5xl mx-auto">
        <div className="p-6 md:p-8 rounded-2xl bg-gradient-to-br from-nasun-c3/10 via-nasun-c4/10 to-nasun-c5/10 border border-nasun-white/10">
          <h4 className="text-xl md:text-2xl font-bold mb-4 bg-gradient-to-r from-nasun-c3 via-nasun-c4 to-nasun-c5 bg-clip-text text-transparent">
            Why This Matters
          </h4>
          <div className="max-w-2xl mx-auto">
            <p className="text-nasun-white/80 leading-relaxed mb-4">
              This is not a demo. This is how{" "}
              <span className="text-nasun-c3 font-medium">autonomous enterprises operate</span> when
              intelligence, capital, and coordination share the same execution layer.
            </p>
            <p className="text-nasun-white/80 leading-relaxed">
              Fund the agent's treasury <span className="text-nasun-c3 font-medium">once</span>. The
              Nasun Settlement Layer handles everything else—
              <span className="text-nasun-c3 font-medium">
                autonomously, transparently, and at machine speed.
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AgentDayInfographic;
