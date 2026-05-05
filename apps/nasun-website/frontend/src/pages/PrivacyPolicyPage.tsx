import React, { Suspense } from "react";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { PageLayout } from "../components/layout/PageLayout";
import { SectionLayout } from "../components/layout/SectionLayout";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { PageTitle } from "../components/ui/PageTitle";
import { SectionTitle } from "../components/ui/SectionTitle";
import { AlertTriangle } from "lucide-react";

const PRIVACY_CONTENT = {
  title: "Privacy Policy",
  lastUpdated: "Last Updated: March 3, 2026",
  devnetNotice: {
    title: "Important Notice for Devnet",
    content: "Nasun currently operates on a Developer Network (\"Devnet\"). All on-chain transactions are public, and all assets (except Frontiers NFTs) are test assets with no real monetary value."
  },
  sections: {
    "1": {
      "title": "1. Introduction",
      "content": [
        "Nasun is currently operated by an unincorporated project team (\"Nasun,\" \"we,\" \"us,\" or \"our\"). For the purposes of applicable data protection laws, Nasun acts as the data controller. Upon formal incorporation, the designated legal entity will assume the role of data controller and this Policy will be updated accordingly.",
        "This Privacy Policy (\"Policy\") explains how we collect, use, and safeguard your personal data when you use all products, applications, websites, smart contracts, blockchain networks, digital assets, and any other services operated by or on behalf of Nasun, whether currently existing or developed in the future (collectively, the \"Services\")."
      ]
    },
    "2": {
      "title": "2. Information We Collect",
      "intro": "We collect minimal data necessary to provide a secure and efficient Web3 experience.",
      "subsections": [
        {
          "title": "2.1 Data You Provide Directly:",
          "items": [
            "Contact Information: Email address or social media handles (if you subscribe to newsletters or participate in community events).",
            "Authentication Data (zkLogin/OAuth): If you use zkLogin or social authentication (e.g., Google, Apple), we receive limited authentication metadata including a unique user identifier, email address, display name, and profile image URL, depending on the permissions granted by your authentication provider. We do not access your social media passwords.",
            "Twitter/X OAuth Data: If you connect your Twitter/X account (e.g., for leaderboard participation), we receive your public profile information including username, display name, profile image, and follower/following counts. We do not access your direct messages or post on your behalf without explicit consent.",
            "Wallet Information: Your public wallet address. We NEVER collect or store your private keys or seed phrases."
          ]
        },
        {
          "title": "2.2 Automatically Collected Data:",
          "items": [
            "Usage Data: Browser type, device info, pages visited, and approximate geographic location. We use Umami Analytics, a self-hosted, privacy-focused platform that derives aggregate geographic data from IP addresses but does not store raw IP addresses or track users across websites.",
            "Blockchain Data: Transaction hashes, wallet balances, and smart contract interactions which are inherently public on the Nasun ledger."
          ]
        },
        {
          "title": "2.3 Third-Party Data:",
          "items": [
            "Transaction details from third-party platforms or blockchain networks used for NFT verification and service integration."
          ]
        },
        {
          "title": "2.4 Third-Party Wallet Providers:",
          "items": [
            "When you connect a third-party wallet (e.g., MetaMask), we receive your public wallet address and network information. We do not access or store your private keys.",
            "Your use of third-party wallet providers is governed by their respective privacy policies and terms of service. Nasun disclaims any liability for data handling practices of third-party wallet providers."
          ]
        }
      ]
    },
    "3": {
      "title": "3. How We Use Your Data",
      "items": [
        "Service Delivery: To enable wallet connections, NFT minting, and platform features.",
        "Security: To detect and prevent sybil attacks, bot activity, and fraudulent transactions.",
        "Communication: To send technical updates or marketing materials (only with your consent).",
        "Compliance: To screen for sanctioned jurisdictions as required by law."
      ]
    },
    "4": {
      "title": "4. Legal Basis for Processing (EU/UK Users)",
      "intro": "Where applicable, we process personal data based on one or more of the following legal bases:",
      "items": [
        "Performance of a contract — to provide you with the Services.",
        "Legitimate interests — for security, fraud prevention, and service improvement.",
        "Consent — for marketing communications or optional features.",
        "Compliance with legal obligations — for sanctions screening and regulatory requirements."
      ]
    },
    "5": {
      "title": "5. Blockchain Transparency and Irreversibility",
      "intro": "By using Nasun, you acknowledge that on-chain data is public and permanent.",
      "items": [
        "We cannot delete, modify, or \"forget\" data recorded on the blockchain (e.g., a trade or an NFT transfer).",
        "Your public wallet address is visible to anyone using a block explorer."
      ]
    },
    "6": {
      "title": "6. Data Sharing",
      "intro": "We do not sell your personal data. We only share data with:",
      "items": [
        "Service Providers: Cloud hosting (AWS) and self-hosted analytics (Umami).",
        "Legal Authorities: When required by a valid legal request or to comply with AML/sanctions laws.",
        "Ecosystem Partners: Only with your explicit consent for specific integrations."
      ]
    },
    "7": {
      "title": "7. International Data Transfers",
      "content": [
        "Your personal data may be transferred to and processed in jurisdictions outside your country of residence, including the United States (via cloud infrastructure providers). Where required by applicable law, we rely on appropriate safeguards such as Standard Contractual Clauses or equivalent mechanisms to protect such transfers."
      ]
    },
    "8": {
      "title": "8. Cookies",
      "content": [
        "We use only essential cookies necessary for the functioning of the Services, such as session management and authentication state. We do not use tracking cookies or third-party advertising cookies.",
        "Our analytics are powered by Umami, a self-hosted platform that does not use cookies and does not track users across websites. You may manage cookie preferences through your browser settings."
      ]
    },
    "9": {
      "title": "9. Your Rights (GDPR / CCPA / PIPA)",
      "intro": "Depending on your location, you have the right to:",
      "items": [
        "Access/Portability: Request a copy of your off-chain data.",
        "Correction/Deletion: Request to fix or delete your off-chain data (e.g., email list).",
        "Restriction: Object to certain processing activities.",
        "Complaint: If you are located in the European Economic Area or the United Kingdom, you have the right to lodge a complaint with your local data protection authority."
      ],
      "note": "Note: These rights do not apply to data already written to the blockchain."
    },
    "10": {
      "title": "10. Data Retention",
      "items": [
        "Off-chain data: Retained only as long as necessary to fulfill the purposes described in this Policy, and in any event no longer than 24 months unless a longer retention period is required by law. Upon expiration of the retention period, off-chain personal data will be securely deleted or anonymized using commercially reasonable technical measures.",
        "On-chain data: Retained indefinitely due to the nature of blockchain technology."
      ]
    },
    "11": {
      "title": "11. Children's Privacy",
      "content": [
        "Our Services are not intended for individuals under 18. If we discover we have collected data from a minor, we will delete it immediately."
      ]
    },
    "12": {
      "title": "12. Changes to This Policy",
      "content": [
        "We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. We will notify you of material changes by updating the \"Last Updated\" date at the top of this Policy and, where practicable, through announcements on our website or community channels.",
        "Your continued use of the Services after any changes constitutes your acceptance of the updated Policy. Where required by applicable law, we will obtain your consent to material changes before they take effect. We encourage you to review this Policy periodically."
      ]
    },
    "13": {
      "title": "13. Contact Us",
      "content": [
        "For any privacy concerns: admin@nasun.io"
      ]
    }
  }
} as const;

const toRoman = (num: number): string => {
  const numerals = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
  return numerals[num - 1] || num.toString();
};

function PrivacyPolicyPage() {
  const { t } = useTranslation("common");

  const devnetNotice = PRIVACY_CONTENT.devnetNotice;
  const sections = Object.entries(PRIVACY_CONTENT.sections);

  return (
    <PageLayout className="pt-6 md:pt-8 lg:pt-10">
      <ErrorBoundary
        fallback={
          <SectionLayout>
            <p className="text-nasun-white">Content loading failed</p>
          </SectionLayout>
        }
      >
        <Suspense
          fallback={
            <SectionLayout className="!max-w-6xl min-h-screen">
              <p>{t("info.loading")}</p>
            </SectionLayout>
          }
        >
          {/* Header */}
          <SectionLayout className="!max-w-6xl ">
            <PageTitle as="h2" align="center" className="uppercase">
              {PRIVACY_CONTENT.title}
            </PageTitle>
            <p className="text-center text-gray-400 text-sm mt-2">
              {PRIVACY_CONTENT.lastUpdated}
            </p>

          </SectionLayout>

          {/* Devnet Notice - Highlighted Box */}
          <SectionLayout className="!max-w-6xl">
            <div className="p-6 md:p-8 bg-yellow-900/20 border-2 border-yellow-500/50 rounded-lg">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-yellow-500 flex-shrink-0" />
                <h3 className="text-xl md:text-2xl font-bold text-yellow-200 uppercase">
                  {devnetNotice.title}
                </h3>
              </div>
              <p className="text-gray-300 leading-relaxed">{devnetNotice.content}</p>
            </div>
          </SectionLayout>

          {/* Privacy Policy Sections */}
          <SectionLayout className="!max-w-6xl">
            <div className="flex flex-col gap-8 md:gap-10 lg:gap-12">
              {sections.map(([key, section]) => (
                <section key={key} className="border-b border-gray-700/50 pb-8 last:border-b-0">
                  <SectionTitle as="h4" className="mb-4 md:mb-5">
                    {section.title}
                  </SectionTitle>

                  <div className="space-y-3 md:space-y-4">
                    {/* Intro text */}
                    {section.intro && (
                      <p className="text-gray-300 leading-relaxed">{section.intro}</p>
                    )}

                    {/* Content paragraphs (for sections 1, 8, 9) */}
                    {section.content?.map((paragraph, idx) => (
                      <p key={idx} className="text-gray-300 leading-relaxed">
                        {paragraph}
                      </p>
                    ))}

                    {/* Subsections (for section 2 - Information We Collect) */}
                    {section.subsections?.map((subsection, idx) => (
                      <div key={idx} className="mt-4">
                        <p className="text-nasun-white font-medium mb-2">{subsection.title}</p>
                        <div className="space-y-2 pl-4 md:pl-6">
                          {subsection.items.map((item, itemIdx) => (
                            <p key={itemIdx} className="text-gray-300 leading-relaxed">
                              ({toRoman(itemIdx + 1)}) {item}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Items list (for sections 3, 4, 5, 6, 7) */}
                    {section.items && (
                      <div className="space-y-2 pl-4 md:pl-6">
                        {section.items.map((item, idx) => (
                          <p key={idx} className="text-gray-300 leading-relaxed">
                            ({toRoman(idx + 1)}) {item}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Note (for section 6 - Your Rights) */}
                    {section.note && (
                      <p className="text-yellow-200/90 font-medium mt-4 p-3 bg-yellow-900/10 border border-yellow-500/30 rounded">
                        {section.note}
                      </p>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </SectionLayout>
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
}

export default React.memo(PrivacyPolicyPage);
