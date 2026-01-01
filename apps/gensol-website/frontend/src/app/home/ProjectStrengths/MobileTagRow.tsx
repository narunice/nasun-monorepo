import { FadeInUp } from '@/components/common/FadeInUp';
import { MobilePulsePoint } from './PulsePoint';

interface MobileTagRowProps {
  leftTag: string[];
  rightTag: string | string[];
  delay: string;
  pulseDelay: number;
}

export function MobileTagRow({ leftTag, rightTag, delay, pulseDelay }: MobileTagRowProps) {
  return (
    <div className="relative w-full h-auto flex items-center justify-center">
      <FadeInUp delay={delay}>
        <div className="flex items-center justify-center gap-4 max-w-full px-1">
          {/* Left text */}
          <div className="text-right max-w-[290px] flex-1">
            {leftTag.map((tag, index) => (
              <p key={index}>{tag}</p>
            ))}
          </div>

          {/* Pulse point */}
          <MobilePulsePoint delay={pulseDelay} />

          {/* Right text */}
          <div className="text-left max-w-[290px] flex-1">
            {Array.isArray(rightTag) ? (
              rightTag.map((tag, index) => <p key={index}>{tag}</p>)
            ) : (
              <p>{rightTag}</p>
            )}
          </div>
        </div>
      </FadeInUp>
    </div>
  );
}
