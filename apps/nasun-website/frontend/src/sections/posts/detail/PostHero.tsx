import { motion } from "framer-motion";
import { ArrowLeftIcon, CalendarIcon } from "@radix-ui/react-icons";
import DOMPurify from "dompurify";
import { Title } from "@/components/ui/Title";

// Hero Background Image
import heroBg from "@/assets/images/brigitte-elsner-aWkXoJCde4A-unsplash.webp";
const HERO_BG_IMAGE = heroBg;

interface PostHeroProps {
  title: string;
  date: string;
  onBack: () => void;
  backButtonText: string;
}

export default function PostHero({ title, date, onBack, backButtonText }: PostHeroProps) {
  return (
    <div className="relative w-full min-h-28 md:min-h-32 flex flex-col justify-end overflow-hidden">
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center z-0 animate-slow-zoom"
        style={{ backgroundImage: `url(${HERO_BG_IMAGE})` }}
      />
      {/* Dark Overlay for Text Readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-nasun-black/20 via-nasun-black/60 to-nasun-black z-10" />

      {/* Hero Content */}
      <div className="relative z-20 pt-24 md:pt-28 pb-6 md:pb-10 px-4">
        <div className="max-w-5xl mx-auto text-center md:text-left">
          <button
            onClick={onBack}
            className="inline-flex items-center text-nasun-nw1 hover:text-nasun-nw4 transition-colors mb-6 text-xs md:text-sm lg:text-base uppercase tracking-[0.2em] font-medium"
          >
            <ArrowLeftIcon className="mr-2 w-4 h-4" /> {backButtonText}
          </button>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Title
              as="h3"
              className="font-semibold text-white leading-snug"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(title) }}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex items-center gap-2 text-gray-400 text-sm md:text-base"
          >
            <CalendarIcon /> {date}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
