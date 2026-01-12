import { useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, useInView } from "framer-motion";
import { SectionLayout } from "../../../layout/SectionLayout";
import { OuterBox } from "../../../ui/OuterBox";
import { PageTitle } from "../../../ui/PageTitle";
import { Trophy, Calendar, Users } from "lucide-react";
import { useFollowerCount } from "../../../../hooks/useFollowerCount";
import grantsData from "../../../../assets/locales/en/grants.json";

// Counting animation component
interface CountingNumberProps {
  value: string;
  duration?: number;
  delay?: number;
}

const CountingNumber = ({ value, duration = 1.5, delay = 0 }: CountingNumberProps) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const [displayValue, setDisplayValue] = useState("0");

  // Parse numeric value and suffix (e.g., "10+" → { num: 10, suffix: "+" })
  const match = value.match(/^(\d+)(.*)$/);
  const targetNum = match ? parseInt(match[1], 10) : 0;
  const suffix = match ? match[2] : "";

  useEffect(() => {
    if (!isInView) return;

    const startTime = performance.now() + delay * 1000;
    let animationFrame: number;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;

      if (elapsed < 0) {
        animationFrame = requestAnimationFrame(animate);
        return;
      }

      const progress = Math.min(elapsed / (duration * 1000), 1);
      // Ease out cubic for smoother deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentNum = Math.floor(easeOut * targetNum);

      setDisplayValue(currentNum.toString());

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        setDisplayValue(targetNum.toString());
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrame);
  }, [isInView, targetNum, duration, delay]);

  return (
    <span ref={ref}>
      {displayValue}
      {suffix}
    </span>
  );
};

interface MetricCardProps {
  value: string;
  label: string;
  color: string;
  icon: React.ReactNode;
  delay: number;
}

const MetricCard = ({ value, label, color, icon, delay }: MetricCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
    viewport={{ once: true }}
    className="text-center"
  >
    <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${color} mb-3`}>
      {icon}
    </div>
    <div
      className={`text-3xl md:text-4xl font-bold ${color
        .replace("bg-", "text-")
        .replace("/20", "")}`}
    >
      <CountingNumber value={value} delay={delay + 0.3} />
    </div>
    <p className="text-nasun-white/60 font-medium mt-1 text">{label}</p>
  </motion.div>
);

export const RoadmapIntroSection = () => {
  const { t } = useTranslation("roadmap");
  const { count: followerCount } = useFollowerCount();

  // grants.json에서 실제 awards 수를 가져옴
  const grantsCount = useMemo(() => {
    try {
      return grantsData.grants?.list?.length || 10;
    } catch {
      return 10; // 폴백 값
    }
  }, []);

  // 2023년 시작점 기준 현재까지의 년수 계산
  const yearsBuilding = useMemo(() => {
    const startYear = 2023;
    const currentYear = new Date().getFullYear();
    return currentYear - startYear + 1;
  }, []);

  // Twitter 팔로워 수 (실제 값만 표시, 없으면 0)
  const communityCount = followerCount ?? 0;

  const metrics = [
    {
      value: `${grantsCount}+`,
      label: t("metrics.awards"),
      color: "bg-nasun-c4/20",
      icon: <Trophy className="w-6 h-6 text-nasun-c4" />,
      delay: 0,
    },
    {
      value: `${yearsBuilding}`,
      label: t("metrics.years"),
      color: "bg-nasun-c3/20",
      icon: <Calendar className="w-6 h-6 text-nasun-c3" />,
      delay: 0.1,
    },
    {
      value: `${communityCount}+`,
      label: t("metrics.community"),
      color: "bg-nasun-c1/20",
      icon: <Users className="w-6 h-6 text-nasun-c1" />,
      delay: 0.2,
    },
  ];

  return (
    <SectionLayout className="!max-w-6xl gap-8 md:gap-10 xl:gap-12">
      <PageTitle as="h2" align="center">
        {t("title")}
      </PageTitle>

      <OuterBox color="n1" className="bg-nasun-c6/40">
        {/* Heading */}
        <div className="text-left mb-6 md:mb-8">
          <h4 className="font-medium text-nasun-white -mb-1">{t("intro.heading")}</h4>
          <h5 className="font-medium text-nasun-c1">{t("intro.subheading")}</h5>
        </div>

        {/* Description */}
        <p className="text-nasun-white/80 leading-relaxed">{t("intro.description")}</p>

        {/* Metrics */}
        <div className="mt-6 pt-4 md:pt-6 lg:pt-8 xl:pt-10 border-t border-nasun-white/10">
          <div className="grid grid-cols-3 gap-4 md:gap-8">
            {metrics.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </div>
        </div>
      </OuterBox>
    </SectionLayout>
  );
};

export default RoadmapIntroSection;
