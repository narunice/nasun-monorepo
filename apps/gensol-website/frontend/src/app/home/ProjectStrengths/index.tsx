import { FadeIn } from '@/components/common/FadeIn';
import { FadeInUp } from '@/components/common/FadeInUp';
import { homeContent } from '@/constants/pageContent/homeContent';
import AerioHeadTurning from '@/assets/videos/AerioHeadTurning.webm';
import '@/style/homePage.css';

import { RedCircle } from './RedCircle';
import { TagItem } from './TagItem';
import { MobileTagRow } from './MobileTagRow';
import { desktopTags, mobileTagRows } from './tagsData';

const gradientOverlay = {
  background:
    'linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0) 20%, rgba(0, 0, 0, 0) 80%, rgba(0, 0, 0, 1) 100%)',
};

export default function ProjectStrengthsSection() {
  return (
    <section className="flex relative w-full lg:min-h-screen overflow-hidden items-center justify-center">
      {/* Desktop View */}
      <div className="hidden lg:flex w-full h-full">
        <FadeIn delay="0s">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          >
            <source src={AerioHeadTurning} type="video/webm" />
          </video>
        </FadeIn>

        <div className="absolute inset-0" style={gradientOverlay} />

        <RedCircle delay={0} />
        <RedCircle delay={12} />

        {desktopTags.map((tag, index) => (
          <TagItem key={index} {...tag} />
        ))}

        <div className="absolute flex flex-row w-full px-[5%] justify-between top-1/2 transform -translate-y-1/2">
          <FadeInUp>
            <h3 className="!text-sf-blue">{homeContent.projectStrengths.title1}</h3>
          </FadeInUp>
          <FadeInUp>
            <h3 className="!text-sf-blue">{homeContent.projectStrengths.title2}</h3>
          </FadeInUp>
        </div>
      </div>

      {/* Mobile View */}
      <div className="flex flex-col lg:hidden w-full h-full">
        <div className="relative w-auto h-[85svh] overflow-hidden">
          <FadeIn>
            <video autoPlay loop muted playsInline className="absolute w-full h-full object-cover">
              <source src={AerioHeadTurning} type="video/webm" />
            </video>
          </FadeIn>
          <div className="absolute top-2/3 bottom-0 left-0 right-0 pointer-events-none bg-gradient-to-b from-transparent via-black/50 to-black" />
          <div className="absolute inset-0" style={gradientOverlay} />
          <RedCircle delay={0} />
          <RedCircle delay={12} />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 pt-8 pb-20 space-y-9">
          <FadeInUp>
            <div className="flex flex-col items-center">
              <h3 className="!text-sf-blue text-center">{homeContent.projectStrengths.title1}</h3>
              <h3 className="!text-sf-blue text-center">{homeContent.projectStrengths.title2}</h3>
            </div>
          </FadeInUp>

          {mobileTagRows.map((row, index) => (
            <MobileTagRow key={index} {...row} />
          ))}
        </div>
      </div>
    </section>
  );
}
