// src/constants/team.ts
import { TeamMember } from "../../types/team.d";
import naru from "../../assets/images/profile-naru.png";
import overclocked from "../../assets/images/profile-overclocked.png";

export const TEAM_MEMBERS: TeamMember[] = [
  {
    id: "1",
    nameKey: "naru.name",
    positionKey: "naru.position",
    descriptionKey: "naru.description", // i18n 키로 변경
    emphasizedWordCount: 5, // "Head editor and producer on"
    imageUrl: naru,
    socialLinks: {
      email: "naru@nasun.io",
      twitter: "https://x.com/Nasun_io",
    },
    publications: [
      {
        label: "European Journal of Psychotraumatology (2024)",
        url: "https://doi.org/10.1080/20008066.2024.2429268",
      },
      { label: "Psychiatry Investigation (2018)", url: "https://doi.org/10.30773/pi.2017.12.03" },
      {
        label: "BioPsychoSocial Medicine (2020)",
        url: "https://doi.org/10.1186/s13030-020-00181-z",
      },
    ],
    filmography: [
      {
        label: "KOFIC Database",
        url: "https://www.kobis.or.kr/kobis/business/mast/peop/searchPeoplePrintList.do?peopleCd=10051553&p_gubun=undefined",
      },
      { label: "IMDB Database", url: "https://www.imdb.com/name/nm3783450/?ref_=fn_all_nme_1" },
    ],
    otherLinks: [],
  },
  {
    id: "2",
    nameKey: "overclocked.name",
    positionKey: "overclocked.position",
    descriptionKey: "overclocked.description", // i18n 키로 변경
    emphasizedWordCount: 5, // "20+ years in film, television,"
    imageUrl: overclocked,
    socialLinks: {
      email: "overclocked@nasun.io",
      twitter: "https://x.com/overclocksalmon",
    },
    publications: [],
    filmography: [],
    otherLinks: [],
  },
];
