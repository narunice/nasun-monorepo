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
    <CheckCircle className="w-4 h-4 mt-0.5 text-green-500 flex-shrink-0" />
    <span className="text-nasun-white/85">{text}</span>
  </motion.li>
);

export const LiveNowSection = () => {
  const { t } = useTranslation("roadmap");

  const liveNow = t("liveNow", { returnObjects: true }) as LiveNowData;

  return (
    <SectionLayout className="!max-w-7xl gap-8 md:gap-10 xl:gap-12">
      <OuterBox color="n1" className="bg-nasun-c6/40">
        {/* Header with pulse animation */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="flex items-center gap-3 mb-2"
        >
          <div className="relative">
            <Zap className="w-6 h-6 text-green-500" />
            <span className="absolute inset-0 animate-ping">
              <Zap className="w-6 h-6 text-green-500 opacity-50" />
            </span>
          </div>
          <h4 className="font-bold text-green-500 tracking-wide">{liveNow.title}</h4>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          viewport={{ once: true }}
          className="text-nasun-white/60 text-sm mb-6"
        >
          {liveNow.subtitle}
        </motion.p>

        {/* NASUN L1 Network */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          viewport={{ once: true }}
        >
          <DividerBox
            title={liveNow.nasun.title}
            color="c5"
            rightAction={
              <Button variant="c4" size="xs" asChild>
                <a
                  href="https://explorer.devnet.nasun.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {liveNow.explorerButton}
                  <ExternalLink className="w-3 h-3 ml-1.5" />
                </a>
              </Button>
            }
          >
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
