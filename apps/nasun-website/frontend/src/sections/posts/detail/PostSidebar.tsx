import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Share1Icon, CheckIcon } from "@radix-ui/react-icons";

export default function PostSidebar() {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    void navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <aside className="hidden lg:block w-10 shrink-0">
      <div className="sticky top-32 flex flex-col gap-6">
        <div className="relative">
          <button
            onClick={handleCopyLink}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
              copied
                ? "bg-nasun-c4 text-white border border-nasun-c4"
                : "bg-white/5 border border-white/10 text-gray-400 hover:bg-nasun-c4/50 hover:text-white hover:border-nasun-c4"
            }`}
            title="Copy Link"
          >
            {copied ? <CheckIcon className="w-5 h-5" /> : <Share1Icon className="w-5 h-5" />}
          </button>

          {/* Copied 툴팁 */}
          <AnimatePresence>
            {copied && (
              <motion.span
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -5 }}
                transition={{ duration: 0.2 }}
                className="absolute left-12 top-1/2 -translate-y-1/2 text-sm text-nasun-c4  whitespace-nowrap"
              >
                URL copied!
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="w-px h-20 bg-gradient-to-b from-white/20 to-transparent mx-auto" />
      </div>
    </aside>
  );
}
