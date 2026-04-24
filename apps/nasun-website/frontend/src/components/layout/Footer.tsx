import { useTranslation } from "react-i18next";
import { socialIcons } from "../../constants/pageContent/SocialIcons";
import { IconName, library } from "@fortawesome/fontawesome-svg-core";
import { fab } from "@fortawesome/free-brands-svg-icons";
import { partnerLogos } from "../../constants/pageContent/logos";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { routesV2 } from "../../config/routesConfig";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FadeInUp } from "../ui/FadeInUp";

// 브랜드 아이콘 추가
library.add(fab);

// 파트너 로고 컴포넌트 (흑백 효과 추가)
const PartnerLogo = ({ logo }: { logo: (typeof partnerLogos)[0] }) => {
  return (
    <div className="group relative">
      <a
        href={logo.websiteURL}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative block"
        aria-label={`Visit ${logo.alt} website`}
      >
        <img
          src={logo.src}
          alt={logo.alt}
          className="object-contain w-full h-auto max-h-16 md:max-h-20
                  filter grayscale-0 contrast-75 opacity-100
                  group-hover:grayscale group-hover:opacity-90 group-hover:contrast-100 group-hover:scale-105
                  group-active:scale-95
                  transition-all ease-in-out"
        />
      </a>
    </div>
  );
};

export default function Footer() {
  const { t } = useTranslation("common");
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.scrollTo(0, 0);
    if (location.pathname !== "/") {
      navigate("/");
    }
  };

  const isHomePage = location.pathname === "/";

  return (
    <div className={isHomePage ? "bg-[#0b1628]" : "bg-nasun-black"}>
      <div>
        <div className="flex flex-col items-center ">
          <FadeInUp>
            <div className="flex-col items-center pt-6 pb-3 md:py-8 lg:py-10">
              <Link to="/" onClick={handleLogoClick} className="flex items-center justify-center">
                <img
                  src="/nasun-wordmark-white.png"
                  alt="NASUN"
                  className="h-9 md:h-[43px] lg:h-[50px] w-auto"
                />
              </Link>
            </div>
          </FadeInUp>

          <div className="w-full">
            <FadeInUp>
              <p className="text-center pb-4 max-w-5xl mx-auto">{t("footer.supportedBy")}</p>
              <div
                className="marquee-container w-full overflow-hidden"
                role="marquee"
                aria-label={t("footer.supportedBy")}
              >
                <div
                  className="flex animate-marquee hover:[animation-play-state:paused]"
                  style={{ width: "max-content" }}
                >
                  {/* Set A */}
                  <div className="flex gap-10 shrink-0 pr-10">
                    {partnerLogos.map((logo) => (
                      <div
                        key={logo.id}
                        className="flex-shrink-0 flex items-center justify-center w-[180px] md:w-[210px]"
                      >
                        <PartnerLogo logo={logo} />
                      </div>
                    ))}
                  </div>
                  {/* Set B (duplicate for seamless loop) */}
                  <div className="flex gap-10 shrink-0 pr-10" aria-hidden="true">
                    {partnerLogos.map((logo) => (
                      <div
                        key={`dup-${logo.id}`}
                        className="flex-shrink-0 flex items-center justify-center w-[180px] md:w-[210px]"
                      >
                        <PartnerLogo logo={logo} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </FadeInUp>
          </div>
        </div>
      </div>
      <FadeInUp>
        <div className="flex flex-col md:flex-row justify-center items-center py-12 md:py-16 ">
          <h3 className="font-medium mb-4 md:mb-0 md:pr-10">{t("footer.stayConnected")}</h3>
          <div className="flex justify-center items-center gap-6 md:gap-8">
            {socialIcons
              .filter((icon) => !icon.disabled)
              .map((icon) => (
                <a
                  key={icon.platform}
                  href={icon.url}
                  className="text-white hover:text-nasun-white/70 transition-all hover:scale-110"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={icon.alt}
                >
                  <FontAwesomeIcon
                    icon={["fab", icon.icon as IconName]}
                    className="w-5 h-5 md:w-6 md:h-6 hover:scale-110 transition-transform align-middle"
                  />
                </a>
              ))}
          </div>
        </div>
      </FadeInUp>

      <FadeInUp>
        <div className="max-w-8xl mx-auto p-4 md:p-6 lg:p-8 ">
          {/* 저작권 및 링크 섹션 */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-8 !text-sm">
            <div className="flex flex-col gap-2">
              {/* Copyright */}
              <p className="text-nasun-white/60 !text-sm">
                {t("footer.copyright1")} © 2023-
                {new Date().getFullYear()} {t("footer.copyright2")}
              </p>
            </div>

            <div className="flex items-center space-x-6 text-nasun-white/60">
              <a
                href={routesV2.terms.path}
                className="text-nowrap hover:text-white transition-all hover:underline underline-offset-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("footer.terms")}
              </a>
              <span className="text-nasun-white/40">|</span>
              <a
                href={routesV2.privacy.path}
                className="text-nowrap hover:text-white transition-all hover:underline underline-offset-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("footer.privacy")}
              </a>
            </div>
          </div>
        </div>
      </FadeInUp>
    </div>
  );
}
