import { useTranslation } from "react-i18next";
import { socialIcons } from "../../constants/pageContent/SocialIcons";
import { IconName, library } from "@fortawesome/fontawesome-svg-core";
import { fab } from "@fortawesome/free-brands-svg-icons";
import { partnerLogos } from "../../constants/pageContent/logos";
// Update the import path or export in ThemeContext if needed
import { useTheme } from "../../providers/theme/useTheme";
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
          className="object-contain w-full h-auto max-h-16 md:max-h-20 lg:max-h-24 xl:max-h-28 2xl:max-h-32
                  filter grayscale-0 contrast-75 opacity-100
                  group-hover:grayscale group-hover:opacity-90 group-hover:contrast-100 group-hover:scale-105
                  group-active:scale-95
                  transition-all ease-in-out"
          loading="lazy"
        />
      </a>
    </div>
  );
};

export default function Footer() {
  const { t } = useTranslation("common");
  const { theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.scrollTo(0, 0);
    if (location.pathname !== "/") {
      navigate("/");
    }
  };

  return (
    <div className="bg-nasun-black">
      <div>
        <div className="flex flex-col items-center ">
          <FadeInUp>
            <div className="flex-col items-center py-6 md:py-8 lg:py-10">
              <Link to="/" onClick={handleLogoClick} className="flex items-center justify-center">
                <img
                  src={theme === "dark" ? "/nasun-wordmark-white.svg" : "/nasun-wordmark-black.svg"}
                  alt="NASUN"
                  className="h-9 md:h-[43px] lg:h-[50px] w-auto transition-all ease-in-out hover:scale-105 active:scale-95"
                />
              </Link>
            </div>
          </FadeInUp>

          <div className="w-full max-w-5xl mx-auto">
            <FadeInUp>
              <p className="text-center pb-4">{t("footer.supportedBy")}</p>
              <div className="flex flex-wrap justify-center px-8 md:px-10 gap-5 lg:gap-8">
                {partnerLogos.map((logo) => (
                  <div
                    key={logo.id}
                    className="flex justify-center items-center md:px-4
                        w-[calc(50%-12px)] px-6
                        sm:w-[calc(33.333%-16px)]
                        md:w-[calc(25%-20px)]
                        lg:w-[calc(20%-24px)]
                        xl:w-[calc(12.5%-28px)]
                        2xl:w-[210px]
                        min-w-[140px] md:min-w-[175px] lg:min-w-[210px]"
                  >
                    <PartnerLogo logo={logo} />
                  </div>
                ))}
              </div>
            </FadeInUp>
          </div>
        </div>
      </div>
      <FadeInUp>
        <div className="flex flex-col md:flex-row justify-center items-center py-12 md:py-16 ">
          <h3 className="font-medium  md:pr-10">{t("footer.stayConnected")}</h3>
          <div className="flex justify-center items-center gap-6 md:gap-8">
            {socialIcons.map((icon) => (
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
          {/* AI 문구 */}
          <p className=" text-nasun-white/60 py-2 !text-sm">{t("footer.ai")}</p>
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
