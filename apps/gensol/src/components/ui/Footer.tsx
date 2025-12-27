import React from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { IconName } from "@fortawesome/fontawesome-svg-core"
import { partnerLogos } from "../../constants/logos"
import { socialIcons } from "@/constants/socialIcons"
import GensolWordmarkRed from "@/assets/logo_images/GensolWordmarkRed.svg" // 로고 이미지 경로

// FontAwesome 아이콘 라이브러리 임포트
import { library } from "@fortawesome/fontawesome-svg-core"
import { fab } from "@fortawesome/free-brands-svg-icons"
import { FadeInUp } from "../common/FadeInUp"

// 브랜드 아이콘 추가
library.add(fab)

const Footer: React.FC = () => {
  return (
    <footer className="bg-black text-white py-10">
      <div className="max-w-screen-3xl mx-auto px-4">
        {/* 젠솔 로고 섹션 */}
        <div className="flex flex-col items-center py-10">
          <div className="py-20">
            <FadeInUp>
              <img
                src={GensolWordmarkRed}
                alt="Footer Icon"
                className="mx-auto h-9 md:h-11 lg:h-14 w-auto"
              />
            </FadeInUp>
          </div>
          <FadeInUp>
            <p className="text-gray-400 mb-6 text-center">Supported By</p>
            {/* 파트너 로고 그리드 */}
            <div className="w-full max-w-6xl mx-auto">
              <div className="flex flex-wrap justify-center gap-3 px-4 md:gap-6 md:px-12 lg:gap-8">
                {partnerLogos.map((logo) => (
                  <div
                    key={logo.id}
                    className="flex justify-center items-center p-2 md:p-4"
                  >
                    <a
                      href={logo.websiteURL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative block"
                      aria-label={`Visit ${logo.alt} website`}
                    >
                      <img
                        src={logo.darkSrc}
                        alt={logo.alt}
                        className="object-contain h-6 md:h-7 lg:h-8 w-auto"
                      />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </FadeInUp>
        </div>
        {/* 소셜 미디어 섹션 - 수정된 버전 */}
        <div className="flex flex-col md:flex-row justify-center items-center my-10 border-b border-gray-800 pb-10">
          <FadeInUp delay="0.4s">
            <h3 className="text-lg font-ddt tracking-widest font-bold py-5 pr-10">
              STAY CONNECTED
            </h3>
          </FadeInUp>

          <FadeInUp delay="0.8s">
            <div className="flex flex-wrap justify-center gap-6 md:gap-8">
              {socialIcons.map((icon) => (
                <a
                  key={icon.platform}
                  href={icon.url}
                  className="text-gray-300 hover:text-sf-blue transition-colors duration-300"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={icon.alt}
                >
                  <FontAwesomeIcon
                    icon={["fab", icon.icon as IconName]}
                    className="w-5 h-5 md:w-6 md:h-6 hover:scale-110 transition-transform"
                  />
                </a>
              ))}
            </div>
          </FadeInUp>
        </div>
        {/* 저작권 및 링크 섹션 */}
        <div className="flex flex-col md:flex-row justify-around items-center py-4">
          <FadeInUp>
            <div className="mb-4 md:mb-0 text-gray-400 text-sm">
              <p>GEN SOL and any associated logos are registered trademarks.</p>
              <p>ⓒ 2022-2025 GEN SOL. All rights reserved.</p>
            </div>
          </FadeInUp>
          <FadeInUp delay="0.6s">
            <div className="flex items-center space-x-6 text-gray-300">
              <a
                href="https://staging.gensol.io/terms-of-service/"
                className="hover:text-sf-blue text-sm"
                target="_blank"
                rel="noopener noreferrer"
              >
                Terms of Use
              </a>
              <span>|</span>
              <a
                href="https://staging.gensol.io/privacy-policy/"
                className="hover:text-sf-blue text-sm"
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy Policy
              </a>
            </div>
          </FadeInUp>
        </div>
      </div>
    </footer>
  )
}

export default Footer
