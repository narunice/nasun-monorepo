import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { SectionLayout } from "../../../layout/SectionLayout";
import { OuterBox } from "../../../ui/OuterBox";
import { DividerBox } from "../../../ui/DividerBox";
import { Button } from "../../../ui/button";
import { CheckCircle, Zap, ExternalLink } from "lucide-react";

interface LiveNowCategory {
  title: string;
  items: string[];
}

interface LiveNowData {
  title: string;
  subtitle: string;
  explorerButton: string;
  nasun: LiveNowCategory;
}

const LiveItem = ({ text, delay }: { text: string; delay: number }) => (
  <motion.li
    initial={{ opacity: 0, x: -10 }}
    whileInView={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.3, delay }}
    viewport={{ once: true }}
    className="flex items-start gap-2 text-sm md:text-base"
  >
    <CheckCircle className="w-4 h-4 mt-0.5 text-nasun-c3 flex-shrink-0" />
    <span className="text-nasun-white/85">{text}</span>
  </motion.li>
);

export const LiveNowSection = () => {
  const { t } = useTranslation("roadmap");

  const liveNow = t("liveNow", { returnObjects: true }) as LiveNowData;

  return (
    <SectionLayout className="!max-w-7xl gap-8 md:gap-10 xl:gap-12">
      <OuterBox color="c5" className="">
        {/* Header row with title and button */}
        <div className="flex items-start justify-between gap-4">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="flex items-center gap-3"
          >
            <h4 className="font-bold tracking-wide">{liveNow.title}</h4>
            <div className="relative">
              <Zap className="w-6 h-6 text-nasun-c3" />
              <span className="absolute inset-0 animate-ping">
                <Zap className="w-6 h-6 text-nasun-c3 opacity-50" />
              </span>
            </div>
          </motion.div>
        </div>
        <div className="flex flex-row justify-between items-center mb-2">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            viewport={{ once: true }}
            className="text-nasun-white/60 text-sm"
          >
            {liveNow.subtitle}
          </motion.p>
          <Button variant="c3" size="sm" asChild>
            <a href="https://explorer.devnet.nasun.io/" target="_blank" rel="noopener noreferrer">
              {liveNow.explorerButton}
              <ExternalLink className="w-3 h-3 ml-1.5" />
            </a>
          </Button>
        </div>

        {/* NASUN L1 Network */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          viewport={{ once: true }}
        >
          <DividerBox title={liveNow.nasun.title} color="w1" padding="sm" className="">
            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
              {liveNow.nasun.items.map((item, index) => (
                <LiveItem key={item} text={item} delay={0.3 + index * 0.05} />
              ))}
            </ul>
          </DividerBox>
        </motion.div>
      </OuterBox>
    </SectionLayout>
  );
};

export default LiveNowSection;
