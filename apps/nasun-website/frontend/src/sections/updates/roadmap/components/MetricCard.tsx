import { motion } from "framer-motion";
import { CountingNumber } from "@/components/ui/CountingNumber";

export interface MetricCardProps {
  value: string;
  label: string;
  color: string;
  icon: React.ReactNode;
  delay: number;
}

export const MetricCard = ({ value, label, color, icon, delay }: MetricCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
    viewport={{ once: true }}
    className="text-center"
  >
    <div
      className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${color} mb-3`}
    >
      {icon}
    </div>
    <div
      className={`text-3xl md:text-4xl font-bold ${color
        .replace("bg-", "text-")
        .replace("/20", "")}`}
    >
      <CountingNumber value={value} delay={delay + 0.3} />
    </div>
    <p className="text-nasun-white/60 font-medium mt-1 text-sm md:text-base">{label}</p>
  </motion.div>
);
