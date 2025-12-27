export const GRANTS_LIST = [
  {
    date: "September 2025",
    event: "Selected for <2025 Web3 Game Audition> program by BIPA, receiving 7 million KRW.",
  },
  {
    date: "November 2024",
    event:
      "Won Grand Prize at <2024 Contents Company Accelerating Demo Day> by Busan Information Industry Promotion Agency (BIIPA), awarded 5 million KRW.",
  },
  {
    date: "September 2024",
    event:
      "Selected for <2024 Game Contents Multi-Boosting Support> program by BIIPA, receiving services worth 13 million KRW.",
  },
  {
    date: "August 2024",
    event: "Selected for <2024 Contents Startup Accelerating Support> program by BIIPA.",
  },
  {
    date: "July 2024",
    event:
      "Selected for <2024 B-CON Startup Commercialization Support> program by BIIPA (animation series 'Specter Heist'), receiving 12.5 million KRW prototype production grant.",
  },
  {
    date: "July 2024",
    event:
      "Selected for <2024 Contents Company Global Marketing Support> program by BIIPA (sci-fi universe 'Gensol'), receiving 10 million KRW global marketing grant.",
  },
  {
    date: "May 2024",
    event:
      "Selected for <SME IP Capacity Enhancement> program by Busan Intellectual Property Center, supported for 1 trademark application.",
  },
  {
    date: "October 2023",
    event:
      "Won Grand Prize (BIIPA President Award) at <4th ICT Business Model Idea Competition> by National IT Industry Promotion Agency, awarded 2 million KRW.",
  },
  {
    date: "September 2023",
    event:
      "Selected for <2023 B-CON Startup Commercialization Support> program by BIIPA (animation series 'Specter Heist'), receiving 9 million KRW for prototype and branding.",
  },
  {
    date: "August 2023",
    event:
      "Selected for <K-Contents Innovation Growth Guarantee: Global> financial support program by Korea Creative Content Agency, receiving 100 million KRW loan guarantee.",
  },
  {
    date: "November 2022",
    event:
      "Completed <2022 Gyeongnam CKL New Startup Program> by Gyeongnam Culture & Arts Foundation.",
  },
  {
    date: "August 2022",
    event: "Company incorporation.",
  },
  {
    date: "March 2022",
    event:
      "Selected for <Touchpoint> program by German non-profit IOTA Foundation's Web3 ecosystem acceleration, receiving technical/marketing/community building support.",
  },
] as const;

// 타입 정의 (필요시)
export type HistoryItem = (typeof GRANTS_LIST)[number];
