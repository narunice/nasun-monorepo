interface PulsePointProps {
  isLeft: boolean;
  delay: number;
  duration: number;
  size: number;
}

export function PulsePoint({ isLeft, delay, duration, size }: PulsePointProps) {
  return (
    <div
      className={`absolute ${isLeft ? 'left-0' : 'right-0'} h-full flex items-center justify-center`}
    >
      <div className="relative w-3 h-3 flex items-center justify-center">
        {/* Center dot */}
        <svg
          className="absolute z-10 w-3 h-3"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 2.83 2.83"
        >
          <circle className="fill-[#2eacd6]" cx="1.42" cy="1.42" r="0.92" />
        </svg>

        {/* Pulsing circle */}
        <div
          className="absolute rounded-full border-1 border-gray-400"
          style={{
            animation: `pulse-scale ${duration}s infinite ease-out ${delay}s`,
            width: `${size}rem`,
            height: `${size}rem`,
            backgroundColor: 'rgba(46, 172, 230, 0.2)',
          }}
        />
      </div>
    </div>
  );
}

// Simplified version for mobile view
interface MobilePulsePointProps {
  delay: number;
}

export function MobilePulsePoint({ delay }: MobilePulsePointProps) {
  return (
    <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
      <svg
        className="absolute z-10 w-3 h-3"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 2.83 2.83"
      >
        <circle className="fill-[#2eacd6]" cx="1.42" cy="1.42" r="0.92" />
      </svg>
      <div
        className="absolute rounded-full border border-gray-400"
        style={{
          animation: `pulse-scale 3s infinite ease-out ${delay}s`,
          width: '2.5rem',
          height: '2.5rem',
          backgroundColor: 'rgba(46, 172, 230, 0.2)',
        }}
      />
    </div>
  );
}
