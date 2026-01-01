import { FadeInUp } from '@/components/common/FadeInUp';
import { PulsePoint } from './PulsePoint';

interface TagItemProps {
  data: string | string[];
  position: { x: string; y: string };
  index: number;
  delay: number;
  duration: number;
  size: number;
}

export function TagItem({ data, position, index, delay, duration, size }: TagItemProps) {
  const isEven = index % 2 === 1; // Even index tags are on the right

  return (
    <div
      className="absolute text-center transform -translate-x-1/2 -translate-y-1/2 flex items-center"
      style={{
        left: position.x,
        top: position.y,
        width: 'auto',
        maxWidth: '300px',
        flexDirection: isEven ? 'row-reverse' : 'row',
      }}
    >
      <FadeInUp delay="0.6s">
        {/* Pulse point - left tags have it on right, right tags have it on left */}
        <PulsePoint isLeft={isEven} delay={delay} duration={duration} size={size} />

        <div className={`${isEven ? 'ml-6' : 'mr-6'}`}>
          {Array.isArray(data) ? (
            <div className="space-y-1 p-3 rounded-lg">
              <p className="text-left">{data[0]}</p>
              {data.slice(1).map((item, i) => (
                <p key={i} className="text-left">
                  {item}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-left p-3 rounded-lg">{data}</p>
          )}
        </div>
      </FadeInUp>
    </div>
  );
}
