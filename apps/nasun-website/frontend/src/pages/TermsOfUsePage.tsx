import React, { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../components/layout/PageLayout";
import { SectionLayout } from "../components/layout/SectionLayout";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { PageTitle } from "../components/ui/PageTitle";
import { SectionTitle } from "../components/ui/SectionTitle";
import { AlertTriangle } from "lucide-react";

const TERMS_CONTENT = {
  title: "Terms of Use",
  lastUpdated: "Last Updated: March 3, 2026",
  disclaimer: {
    title: "IMPORTANT INVESTMENT DISCLAIMER",
    subtitle: "PLEASE READ THIS SECTION CAREFULLY. IT LIMITS THE SCOPE OF OUR RELATIONSHIP.",
    intro: "The relationship between you and Nasun is NOT an investment relationship. NFTs, rewards, tokens, and any digital assets distributed through the Nasun platform are NOT investment products and do not represent securities, profit-sharing arrangements, or any form of financial instrument.",
    header: "You acknowledge and agree that:",
    items: [
      "(i) No Investment: You are not making an investment in Nasun, the entity or individuals operating under the name Nasun, or any of its affiliates.",
      "(ii) No Profit Expectation: You acknowledge that you are not acquiring any digital asset with the expectation of profit, return, or appreciation in value derived from the managerial or entrepreneurial efforts of Nasun or any third party.",
      "(iii) No Common Enterprise: Your acquisition or use of any NFT or digital asset does not create any common enterprise between you and Nasun.",
      "(iv) No Equity: Your purchase or acquisition of NFTs, or participation in platform activities, does not create any equity interest, ownership stake, or profit-sharing right.",
      "(v) No Reliance: You are not relying on any statements, representations, or communications by Nasun regarding potential future value, utility expansion, or ecosystem growth. You expressly acknowledge that no statement, roadmap, whitepaper, social media communication, or public announcement shall constitute a promise of economic return or future value.",
      "(vi) Purpose: The Services are currently provided for experimental, community participation, and ecosystem development purposes."
    ]
  },
  sections: {
    "1": {
      "title": "1. Introduction and Acceptance",
      "content": [
        "These Terms of Use (\"Terms\") constitute a binding agreement between you (\"User,\" \"you\") and the entity or individuals operating under the name \"Nasun\" (\"Nasun,\" \"we,\" \"us\"). These Terms govern your access to and use of all products, applications, websites, smart contracts, blockchain networks, digital assets, and any other services operated by or on behalf of Nasun, whether currently existing or developed in the future (collectively, the \"Services\"). This includes, without limitation, nasun.io, the Nasun Network, and any decentralized applications, tools, or platforms we offer.",
        "By connecting your wallet, purchasing an NFT, or using any Service, you agree to be bound by these Terms. If you do not agree, you must not use the Services."
      ]
    },
    "2": {
      "title": "2. The Nasun Devnet & No Monetary Value",
      "content": [
        "2.1 Experimental Environment: You acknowledge that the Nasun Network is currently a \"Devnet\" (Development Network) operated by a limited number of nodes. It is experimental, unstable, and subject to resets, rollbacks, or complete termination without notice.",
        "2.2 Simulation Data Only: Unless explicitly stated otherwise (e.g., the Frontiers NFT collectible itself), all tokens, balances, yield rates (APY), and transaction records on the Nasun Devnet, including those within the Pado application, are SIMULATION DATA ONLY. They have ZERO real-world monetary value and cannot be exchanged for fiat currency or mainnet tokens.",
        "2.3 Data Resets: We reserve the right to reset the Devnet ledger at any time. This will erase all on-chain data, including your transaction history and balances. Nasun is not liable for any data loss associated with these resets."
      ]
    },
    "3": {
      "title": "3. Wallet, Identity, and Security",
      "content": [
        "3.1 Self-Custodial Service: Nasun Wallet is a self-custodial interface. You retain full control over your private keys and assets. We cannot access or recover your funds if you lose your private keys or seed phrases.",
        "3.2 Nasun Link (URL Transfer): The \"Nasun Link\" feature allows asset transfer via URL. You acknowledge that anyone with access to the link can claim the asset. Nasun is not responsible for losses due to link sharing, interception, expiration, or misuse.",
        "3.3 zkLogin & Third-Party Auth: Access via Web3 social login (zkLogin) depends on third-party providers (Google, Apple, etc.). Nasun is not responsible for loss of access due to third-party policy changes or outages."
      ]
    },
    "4": {
      "title": "4. Pado – Devnet Only",
      "content": [
        "4.1 Mock Trading: Pado features, including Spot/Perpetual trading, Lending, and Prediction Markets, are for testing purposes only. Profits or losses generated in Pado are simulated and strictly non-redeemable.",
        "4.2 Technical Limitations: You accept that mechanisms such as liquidation logic, oracles, and margin calculations may malfunction, be overridden, or differ significantly from a mainnet environment."
      ]
    },
    "5": {
      "title": "5. Frontiers NFT & Ownership",
      "content": [
        "5.1 Nature of Product: The Frontiers NFT is sold as a digital collectible that grants membership access to the Nasun community. As stated in the Disclaimer above, it is NOT an investment contract.",
        "5.2 Ecosystem Participation: The Frontiers NFT functions solely as a digital membership credential within the Nasun ecosystem. It does not represent any ownership interest, equity, profit-sharing right, or entitlement to future tokens or distributions.",
        "From time to time, Nasun may, at its sole discretion, introduce community initiatives or participation-based programs intended to encourage ecosystem engagement. Participation in any such initiative, if implemented, would be evaluated based on a range of factors determined by Nasun and shall not be based solely on NFT ownership.",
        "No rewards, tokens, economic benefits, or other distributions are promised, implied, or guaranteed. Any future initiatives remain subject to applicable laws and regulations. Nasun reserves the right to modify, suspend, or discontinue any such initiatives at any time without notice.",
        "5.3 License: You own the NFT token itself. Nasun retains all intellectual property rights to the underlying art, the \"GenSol\" universe, and lore. Subject to these Terms, Nasun grants you a limited, personal, non-exclusive, non-transferable, revocable, non-commercial license to display the associated artwork solely for personal use. Commercial use, merchandising, sublicensing, or derivative works are strictly prohibited unless separately authorized in writing by Nasun.",
        "5.4 Refund Policy: All NFT purchases are final and non-refundable. Due to the nature of blockchain transactions, once an NFT purchase is confirmed on-chain, it cannot be reversed, cancelled, or refunded. By purchasing an NFT through the Services or any third-party marketplace in connection with Nasun, you expressly consent to the immediate performance and delivery of digital content upon on-chain confirmation. To the extent permitted by applicable law, where a statutory right of withdrawal applies, such right may not apply once digital content has been fully delivered with your prior express consent and acknowledgment."
      ]
    },
    "6": {
      "title": "6. Prohibited Activities",
      "intro": "You agree not to engage in any of the following activities in connection with the Services:",
      "items": [
        "(i) Using bots, scripts, or automated tools to interact with the Services, manipulate rankings, or gain unfair advantages;",
        "(ii) Market manipulation, wash trading, front-running, or any form of deceptive trading activity;",
        "(iii) Using VPNs or other tools to circumvent geographic restrictions or sanctions compliance measures;",
        "(iv) Scraping, data mining, or reverse engineering any part of the Services;",
        "(v) Engaging in fraud, identity theft, or misrepresentation of any kind;",
        "(vi) Any activity that violates applicable laws or these Terms."
      ]
    },
    "7": {
      "title": "7. No Professional Advice",
      "content": [
        "Nothing in the Services constitutes investment, financial, legal, or tax advice. Nasun does not act as a fiduciary, broker, or advisor to any user. You are solely responsible for evaluating the risks and merits of using the Services and should consult qualified professionals before making any financial or legal decisions.",
        "You are solely responsible for determining and fulfilling any tax obligations arising from your use of the Services, including but not limited to the purchase, sale, or transfer of NFTs. Nasun does not provide tax advice and makes no representations regarding the tax implications of any transaction."
      ]
    },
    "8": {
      "title": "8. Assumption of Risk",
      "intro": "You understand and agree that your access to and use of the Services involves certain risks, including but not limited to:",
      "items": [
        "(i) Volatility: The market price and liquidity of blockchain-based digital assets, including NFTs acquired through third-party marketplaces, are highly volatile and may fluctuate significantly. Nasun does not control or guarantee any secondary market pricing.",
        "(ii) Irreversibility: Transactions involving NFTs or tokens may be irreversible, and losses resulting from fraudulent or accidental transactions may not be recoverable.",
        "(iii) Technology Risks: NFTs and the Devnet are subject to risks including fraud, counterfeiting, cyber-attacks, smart contract bugs, and other technological issues that may hinder access.",
        "(iv) Regulatory Uncertainty: Blockchain technology is subject to uncertain regulations which may adversely affect the Services.",
        "(v) No Advice: Nasun does not provide any investment advice or recommendations regarding NFTs. You access and use the Services entirely at your own risk."
      ]
    },
    "9": {
      "title": "9. Disclaimers (\"AS IS\" Basis)",
      "intro": "The Services, including the website, content, and NFTs, are provided on an \"AS IS\" and \"AS AVAILABLE\" basis, without warranties or conditions of any kind, either express or implied.",
      "warrantyHeader": "Nasun makes no warranty that the Site will:",
      "warranties": [
        "(i) Meet your requirements;",
        "(ii) Be available without interruption, in a timely, secure, or error-free manner;",
        "(iii) Be accurate, reliable, complete, legal, or safe."
      ],
      "liabilityHeader": "Nasun shall not be responsible or liable to you for any loss related to:",
      "liabilities": [
        "(i) User errors such as forgotten passwords, incorrect transactions, or mistyped wallet addresses;",
        "(ii) Server failures, data loss, or Devnet resets;",
        "(iii) Corrupted wallet files;",
        "(iv) Loss of NFTs or access to third-party services."
      ]
    },
    "10": {
      "title": "10. Limitation of Liability",
      "content": [
        "To the fullest extent permitted by law, Nasun shall not be liable to you or any third party for any lost profits or any indirect, consequential, exemplary, incidental, special, or punitive damages arising from these Terms or the Services.",
        "In no event shall the maximum aggregate liability of Nasun arising out of or related to these Terms, your access to or use of the website, content, NFTs, or any products exceed the greater of:"
      ],
      "limits": [
        "(a) US$100; or",
        "(b) The total amount of fees paid by you to Nasun in the twelve (12) months immediately preceding the event giving rise to the claim."
      ]
    },
    "11": {
      "title": "11. Indemnification",
      "intro": "You agree to indemnify, defend, and hold harmless Nasun and our past, present, and future employees, officers, directors, contractors, consultants, equity holders, suppliers, vendors, service providers, parent companies, subsidiaries, affiliates, agents, representatives, predecessors, successors, and assigns (collectively, \"Nasun Parties\"), from and against all actual or alleged third-party claims that are caused by, arise out of, or are related to:",
      "items": [
        "(a) Your use or misuse of the Site, Content, or NFTs;",
        "(b) Your breach of these Terms;",
        "(c) Your breach or violation of the rights of a third party."
      ]
    },
    "12": {
      "title": "12. Eligibility",
      "content": [
        "You must be at least 18 years of age to use the Services. By using the Services, you represent and warrant that you meet this age requirement.",
        "You represent that you are not located in, incorporated in, or a citizen or resident of any jurisdiction subject to comprehensive sanctions, including but not limited to North Korea (DPRK), Iran, Cuba, and Syria, or any other jurisdiction subject to comprehensive sanctions imposed by the U.S. Office of Foreign Assets Control (OFAC), the United Nations Security Council, or the European Union. You further represent that you are not listed on any sanctions list maintained by OFAC, the United Nations Security Council, the European Union, or any other applicable governmental authority."
      ]
    },
    "13": {
      "title": "13. Termination and Suspension",
      "content": [
        "Nasun reserves the right to suspend, restrict, or terminate your access to any or all of the Services at any time, at our sole discretion, with or without notice, and for any reason, including but not limited to suspected violations of these Terms or applicable law.",
        "Nasun shall not be liable to you or any third party for any suspension or termination of your access to the Services. Upon termination, all provisions of these Terms that by their nature should survive will remain in effect."
      ]
    },
    "14": {
      "title": "14. Modifications to Terms",
      "content": [
        "Nasun reserves the right to modify these Terms at any time. We will provide reasonable notice of material changes by updating the \"Last Updated\" date and, where practicable, through announcements on our website or community channels.",
        "Your continued use of the Services after any modification constitutes your acceptance of the updated Terms. If you do not agree with the changes, you must discontinue use of the Services."
      ]
    },
    "15": {
      "title": "15. Governing Law and Dispute Resolution",
      "content": [
        "These Terms and any action related thereto will be governed by and construed in accordance with the laws of the British Virgin Islands, without regard to its conflict of laws provisions.",
        "Any dispute arising out of or in connection with these Terms, including any question regarding its existence, validity, or termination, shall be referred to and finally resolved by arbitration. The seat of arbitration shall be the British Virgin Islands, and the arbitration shall be conducted in English in accordance with internationally recognized arbitration rules. Judgment upon the arbitration award may be entered in any court having jurisdiction thereof.",
        "To the fullest extent permitted by applicable law, you agree that any dispute resolution proceedings will be conducted on an individual basis only, and not as a class, consolidated, or representative action. You expressly waive any right to participate in a class action lawsuit or class-wide arbitration."
      ]
    },
    "16": {
      "title": "16. Third-Party Services and Smart Contracts",
      "content": [
        "16.1 Third-Party Services: The Services may integrate with or rely on third-party services, including but not limited to wallet providers, authentication services, blockchain networks, and analytics tools. Nasun does not control, endorse, or assume responsibility for these third-party services. Your use of third-party services is subject to their respective terms and policies. Nasun shall not be liable for any loss or damage arising from third-party service outages, policy changes, or discontinuation.",
        "16.2 Smart Contracts: The Services may involve interaction with smart contracts deployed on experimental blockchain networks. These smart contracts may not have undergone formal third-party security audits and may contain vulnerabilities, defects, or errors. You acknowledge that smart contract code is experimental and provided without any warranties. Smart contracts are immutable once deployed. You interact with smart contracts entirely at your own risk."
      ]
    },
    "17": {
      "title": "17. General Provisions",
      "content": [
        "17.1 Severability: If any provision of these Terms is found to be unlawful, void, or unenforceable, that provision shall be deemed severable and shall not affect the validity and enforceability of the remaining provisions.",
        "17.2 Entire Agreement: These Terms constitute the entire agreement between you and Nasun regarding the Services and supersede all prior agreements, representations, and understandings, whether written, oral, or implied.",
        "17.3 Waiver: The failure of Nasun to exercise or enforce any right or provision of these Terms shall not constitute a waiver of such right or provision.",
        "17.4 Assignment: Nasun may assign or transfer these Terms, and any rights and obligations hereunder, in whole or in part, without your prior consent, including in connection with a corporate restructuring, incorporation, merger, or sale of assets.",
        "17.5 Force Majeure: Nasun shall not be liable for any failure or delay in performing its obligations due to causes beyond its reasonable control, including but not limited to blockchain network failures, validator outages, cyberattacks, natural disasters, or changes in applicable law or regulation.",
        "17.6 Contact: For questions regarding these Terms, contact us at admin@nasun.io."
      ]
    }
  }
} as const;

function TermsOfUsePage() {
  const { t } = useTranslation("common");

  const disclaimer = TERMS_CONTENT.disclaimer;
  const sections = Object.entries(TERMS_CONTENT.sections);

  return (
    <PageLayout className="pt-6 md:pt-8 lg:pt-10">
      <ErrorBoundary
        fallback={
          <SectionLayout>
            <p className="text-nasun-latte">Content loading failed</p>
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
              {TERMS_CONTENT.title}
            </PageTitle>
            <p className="text-center text-gray-400 text-sm mt-2">{TERMS_CONTENT.lastUpdated}</p>

          </SectionLayout>

          {/* Investment Disclaimer - Highlighted Box */}
          <SectionLayout className="!max-w-6xl">
            <div className="p-6 md:p-8 bg-yellow-900/20 border-2 border-yellow-500/50 rounded-lg">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-yellow-500 flex-shrink-0" />
                <h3 className="text-xl md:text-2xl font-bold text-yellow-200 uppercase">
                  {disclaimer.title}
                </h3>
              </div>
              <p className="text-yellow-200/90 font-medium mb-4">{disclaimer.subtitle}</p>
              <p className="text-gray-300 leading-relaxed mb-4">{disclaimer.intro}</p>
              <p className="text-nasun-white font-medium mb-3">{disclaimer.header}</p>
              <div className="space-y-2 pl-4">
                {disclaimer.items.map((item, idx) => (
                  <p key={idx} className="text-gray-300 leading-relaxed">
                    <strong className="text-nasun-white">{item.split(":")[0]}:</strong>
                    {item.split(":").slice(1).join(":")}
                  </p>
                ))}
              </div>
            </div>
          </SectionLayout>

          {/* Terms Sections */}
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

                    {/* Content paragraphs */}
                    {section.content?.map((paragraph, idx) => (
                      <p key={idx} className="text-gray-300 leading-relaxed">
                        {paragraph}
                      </p>
                    ))}

                    {/* Items list - displayed as paragraphs since data contains (i), (ii) etc. */}
                    {section.items && (
                      <div className="space-y-2 pl-4 md:pl-6">
                        {section.items.map((item, idx) => (
                          <p key={idx} className="text-gray-300 leading-relaxed">
                            {item}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Warranty section (for section 7) */}
                    {section.warrantyHeader && (
                      <>
                        <p className="text-nasun-white font-medium mt-4">
                          {section.warrantyHeader}
                        </p>
                        <div className="space-y-2 pl-4 md:pl-6">
                          {section.warranties?.map((item, idx) => (
                            <p key={idx} className="text-gray-300 leading-relaxed">
                              {item}
                            </p>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Liability section (for section 7) */}
                    {section.liabilityHeader && (
                      <>
                        <p className="text-nasun-white font-medium mt-4">
                          {section.liabilityHeader}
                        </p>
                        <div className="space-y-2 pl-4 md:pl-6">
                          {section.liabilities?.map((item, idx) => (
                            <p key={idx} className="text-gray-300 leading-relaxed">
                              {item}
                            </p>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Limits section (for section 8) */}
                    {section.limits && (
                      <div className="space-y-2 pl-4 md:pl-6">
                        {section.limits.map((item, idx) => (
                          <p key={idx} className="text-gray-300 leading-relaxed font-medium">
                            {item}
                          </p>
                        ))}
                      </div>
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

export default React.memo(TermsOfUsePage);
