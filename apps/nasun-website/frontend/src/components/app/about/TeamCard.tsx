import React from "react";
import { useTranslation } from "react-i18next";
import { TeamMember } from "../../../types/team.d";
import { FiLinkedin, FiGlobe, FiFilm, FiBook, FiLink, FiMail } from "react-icons/fi";
import { FaXTwitter } from "react-icons/fa6";
import { DividerBox, OuterBox } from "../../ui";

interface TeamCardProps extends TeamMember {
  className?: string;
}

const TeamCard: React.FC<TeamCardProps> = ({
  nameKey,
  positionKey,
  descriptionKey,
  imageUrl,
  emphasizedWordCount = 6,
  socialLinks,
  publications,
  filmography,
  otherLinks,
  className = "",
}) => {
  const { t } = useTranslation("team");

  const name = t(nameKey as "naru.name" | "overclocked.name");
  const positionData = t(positionKey as "naru.position" | "overclocked.position", {
    returnObjects: true,
  }) as string[];
  const positions = Array.isArray(positionData) ? positionData : [positionData];
  const description = t(descriptionKey as "naru.description" | "overclocked.description", {
    returnObjects: true,
  }) as string[];
  const descriptionArray = Array.isArray(description) ? description : [description];

  return (
    <OuterBox color="c5" className={`flex flex-col md:flex-row gap-8 md:gap-12 ${className}`}>
      {/* Left Column - Profile */}
      <div className="md:w-1/4 flex flex-col items-center md:items-start">
        {/* Profile Image */}
        <div className="relative w-full h-auto rounded-5xl overflow-hidden  mb-4">
          <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
        </div>

        {/* Name & Position */}
        <div className="text-center md:text-left mb-4">
          <h4 className="font-medium text-nasun-white">{name}</h4>
          <div className="">
            {positions.map((title: string, idx: number) => (
              <p key={`pos-${idx}`} className="text-gray-300">
                {title}
              </p>
            ))}
          </div>
        </div>

        {/* Social Links */}
        <div className="flex gap-4 mb-6 md:mb-10">
          {socialLinks?.email && (
            <a
              href={`mailto:${socialLinks.email}`}
              className="text-gray-300 hover:text-nasun-c4 transition"
            >
              <FiMail className="w-5 h-5" />
            </a>
          )}
          {socialLinks?.linkedin && (
            <a
              href={socialLinks.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-300 hover:text-nasun-c4 transition"
            >
              <FiLinkedin className="w-5 h-5" />
            </a>
          )}
          {socialLinks?.twitter && (
            <a
              href={socialLinks.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-300 hover:text-nasun-c4 transition"
            >
              <FaXTwitter className="w-5 h-5" />
            </a>
          )}
          {socialLinks?.website && (
            <a
              href={socialLinks.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-300 hover:text-nasun-c4 transition"
            >
              <FiGlobe className="w-5 h-5" />
            </a>
          )}
        </div>
      </div>

      {/* Right Column - Details */}
      <div className="md:w-3/4 space-y-6">
        {/* Bio/Description */}
        <DividerBox color="w1">
          <div className="space-y-4">
            {descriptionArray.map((paragraph: string, index: number) => {
              // 첫 번째 단락의 시작 부분만 강조
              if (index === 0) {
                const words = paragraph.split(" ");
                const emphasizedWords = words.slice(0, emphasizedWordCount).join(" ");
                const restWords = words.slice(emphasizedWordCount).join(" ");

                return (
                  <p className="text-gray-100" key={`desc-${index}`}>
                    <span className="font-medium !text-base md:!text-lg xl:!text-xl">
                      {emphasizedWords}
                    </span>{" "}
                    {restWords}
                  </p>
                );
              }

              return (
                <p className="text-gray-100" key={`desc-${index}`}>
                  {paragraph}
                </p>
              );
            })}
          </div>
        </DividerBox>

        {/* Publications & Filmography - Side by side on desktop, stacked on mobile */}
        {((publications && publications.length > 0) || (filmography && filmography.length > 0)) && (
          <div className="flex flex-col md:flex-row gap-6">
            {/* Publications */}
            {publications && publications.length > 0 && (
              <DividerBox
                color="c3"
                padding="sm"
                icon={<FiBook />}
                title="Publications"
                titleClassName="text-nasun-c3"
                className="flex-1 "
                disableHover
              >
                <ul className="space-y-1 pl-8 text-gray-300 list-disc">
                  {publications.map((pub: { label: string; url?: string }, index: number) => (
                    <li key={`pub-${index}`}>
                      {pub.url ? (
                        <a
                          href={pub.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-light hover:text-nasun-c4 transition"
                        >
                          {pub.label}
                        </a>
                      ) : (
                        pub.label
                      )}
                    </li>
                  ))}
                </ul>
              </DividerBox>
            )}

            {/* Filmography */}
            {filmography && filmography.length > 0 && (
              <DividerBox
                color="c3"
                padding="sm"
                icon={<FiFilm />}
                title="Filmography"
                titleClassName="text-nasun-c3"
                className="flex-1"
                disableHover
              >
                <ul className="space-y-1 pl-8 text-gray-300 list-disc">
                  {filmography.map((film: { label: string; url?: string }, index: number) => (
                    <li key={`film-${index}`}>
                      {film.url ? (
                        <a
                          href={film.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-light hover:text-nasun-c4 transition"
                        >
                          {film.label}
                        </a>
                      ) : (
                        film.label
                      )}
                    </li>
                  ))}
                </ul>
              </DividerBox>
            )}
          </div>
        )}

        {/* Other Links */}
        {otherLinks && otherLinks.length > 0 && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-2 text-nasun-white">
              <FiLink />
              Links
            </h4>
            <ul className="space-y-1 pl-6 text-gray-300">
              {otherLinks.map((link: { label: string; url: string }, index: number) => (
                <li key={`link-${index}`}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-nasun-c4 transition"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </OuterBox>
  );
};

export default React.memo(TeamCard);
