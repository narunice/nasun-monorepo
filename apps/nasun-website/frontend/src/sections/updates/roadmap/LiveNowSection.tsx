import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "@/components/ui/DividerBox";
import { CheckCircle, Zap } from "lucide-react";
import { SectionTitle } from "@/components/ui";

interface LiveNowCategory {
  title: string;
  items: string[];
}

interface LiveNowData {
  title: string;
  subtitle: string;
  explorerButton: string;
  nasun: LiveNowCategory;
  pado: LiveNowCategory;
  baram: LiveNowCategory;
}

const LiveItem = ({ text, delay }: { text: string; delay: number }) => (
  <motion.li
    initial={{ opacity: 0, x: -10 }}
    whileInView={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.3, delay }}
    viewport={{ once: true }}
    className="flex items-start gap-2 text-sm md:text-base"
  >
    <CheckCircle className="w-4 h-4 mt-0.5 text-green-500 flex-shrink-0" />
    <span className="text-nasun-white/85">{text}</span>
  </motion.li>
);

export const LiveNowSection = () => {
  const { t } = useTranslation("roadmap");

  const liveNow = t("liveNow", { returnObjects: true }) as LiveNowData;

  return (
    <SectionLayout className="!max-w-7xl gap-8 md:gap-10 xl:gap-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="flex items-center gap-3"
        >
          <div className="relative flex items-center justify-center w-7 h-7 mb-4">
            <Zap className="w-7 h-7 text-green-500" />
            <span className="absolute inset-0 animate-ping">
              <Zap className="w-7 h-7 text-green-500 opacity-50" />
            </span>
          </div>
          <SectionTitle as="h4" className="!mb-4">
            {liveNow.title}
          </SectionTitle>
        </motion.div>
      </div>

      {/* Nasun L1 Network */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        viewport={{ once: true }}
      >
        <DividerBox
          title={liveNow.nasun.title}
          color="nw3"
          padding="sm"
          className="!bg-gray-900"
          titleClassName="!text-nasun-nw4"
        >
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
            {liveNow.nasun.items.map((item, index) => (
              <LiveItem key={item} text={item} delay={0.3 + index * 0.05} />
            ))}
          </ul>
        </DividerBox>
      </motion.div>
    </SectionLayout>
  );
};

export default LiveNowSection;
