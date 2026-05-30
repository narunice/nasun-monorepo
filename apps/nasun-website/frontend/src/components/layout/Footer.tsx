import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
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

  const isUjuPage = location.pathname === "/uju" || location.pathname.startsWith("/uju/") || location.pathname === "/my-account" || location.pathname.startsWith("/my-account/");
  // /, /about, /dev/home use the catena dark theme with --ch-onyx (#151316)
  // as the page background. Keep the footer aligned to avoid a visible seam.
  const isDevCatenaPage =
    location.pathname === "/" ||
    location.pathname === "/about" ||
    location.pathname === "/dev/home" ||
    location.pathname === "/dev/about";
  // Archived May 2026 home keeps its original navy backdrop.
  const isArchivedHome = location.pathname === "/archive/home-may2026";
  // Pado page uses pure black (--ch-bg-page #000000); match the footer
  // so there's no visible seam at the section boundary.
  const isPadoPage = location.pathname === "/ecosystem/pado";
  // GenSol pages (main / shooter / animation / plan) use the gensol-theme
  // override --ch-bg-page #0a0f15. Match the footer to avoid a visible seam.
  const isGenSolPage = location.pathname.startsWith("/ecosystem/gensol");

  return (
    <div className={isUjuPage ? "bg-uju-bg" : isPadoPage ? "bg-black" : isGenSolPage ? "bg-[#0a0f15]" : isDevCatenaPage ? "bg-[#151316]" : isArchivedHome ? "bg-[#0b1628]" : "bg-nasun-black"}>
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
          {/* Investor & partnership contact (own row, slightly emphasized) */}
          <div className="flex justify-start items-center pb-6 md:pb-8">
            <a
              href="mailto:admin@nasun.io"
              className="inline-flex items-center gap-2 text-nasun-white/90 hover:text-white transition-colors text-sm md:text-[15px] tracking-wide"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4 md:w-[18px] md:h-[18px] opacity-80"
                aria-hidden="true"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
              <span>
                Investor & partnership · <span className="underline underline-offset-4 decoration-nasun-white/30">admin@nasun.io</span>
              </span>
            </a>
          </div>

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
