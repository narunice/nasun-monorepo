import { library } from "@fortawesome/fontawesome-svg-core";
import { fab } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ChSection from "../home/ChSection";
import FadeInUp from "../home/FadeInUp";
import naruPortrait from "@/assets/images/profile-naru.png";
import overclockedPortrait from "@/assets/images/profile-overclocked.png";

library.add(fab);

type RefLink = { short: string; full: string; url: string };

type Member = {
  name: string;
  role: string;
  bio: string;
  portrait: string;
  xHandle: string;
  xUrl: string;
  publications?: RefLink[];
  filmography?: RefLink[];
};

const MEMBERS: Member[] = [
  {
    name: "Naru",
    role: "Founder and Protocol Lead",
    bio: "Architect of the Nasun runtime, a Move-based L1 built on Mysticeti, and author of the core onchain systems and production infrastructure layer. Her background in clinical psychology and research on the biopsychosocial impacts of social media and disasters informs Nasun's behavioral scoring systems. She is first author on two peer-reviewed SCIE-indexed papers in mental health. Prior decade in the Korean film industry across productions shown at Cannes, Berlin, and Venice.",
    portrait: naruPortrait,
    xHandle: "@Naru010110",
    xUrl: "https://x.com/Naru010110",
    publications: [
      {
        short: "EJPT '24",
        full: "European Journal of Psychotraumatology (2024)",
        url: "https://doi.org/10.1080/20008066.2024.2429268",
      },
      {
        short: "PI '18",
        full: "Psychiatry Investigation (2018)",
        url: "https://doi.org/10.30773/pi.2017.12.03",
      },
      {
        short: "BPSM '20",
        full: "BioPsychoSocial Medicine (2020)",
        url: "https://doi.org/10.1186/s13030-020-00181-z",
      },
    ],
    filmography: [
      {
        short: "KOFIC",
        full: "Korean Film Council Database",
        url: "https://www.kobis.or.kr/kobis/business/mast/peop/searchPeoplePrintList.do?peopleCd=10051553&p_gubun=undefined",
      },
      {
        short: "IMDB",
        full: "IMDB Database",
        url: "https://www.imdb.com/name/nm3783450/?ref_=fn_all_nme_1",
      },
    ],
  },
  {
    name: "Overclocked",
    role: "Founder and Ecosystem Lead",
    bio: "Owns product strategy, market research, and community growth, including the cohort-acquisition systems that produced the devnet's verified-tester base without paid acquisition. Active in crypto since 2017 across DAO operations and community building. Background directing commercial and broadcast productions for Microsoft, Nike, and IBM, plus operating a 100+ employee retail business. BA from the University of Michigan.",
    portrait: overclockedPortrait,
    xHandle: "@overclocksalmon",
    xUrl: "https://x.com/overclocksalmon",
  },
];

function RefRow({ label, items }: { label: string; items: RefLink[] }) {
  return (
    <div className="ch-team-card-refs">
      <span className="ch-team-card-refs-label">{label}</span>
      <span className="ch-team-card-refs-list">
        {items.map((item, idx) => (
          <span key={item.url}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ch-team-card-refs-link"
              title={item.full}
            >
              {item.short}
            </a>
            {idx < items.length - 1 ? (
              <span className="ch-team-card-refs-sep" aria-hidden="true">
                {" · "}
              </span>
            ) : null}
          </span>
        ))}
      </span>
    </div>
  );
}

export default function DevAboutTeamSection() {
  return (
    <ChSection innerClassName="ch-about-team" fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-3 items-center text-center">
        <span className="ch-eyebrow">04 / Team</span>
        <h2 className="ch-display">Team</h2>
      </FadeInUp>

      <div className="ch-team-grid">
        {MEMBERS.map((m, i) => (
          <FadeInUp
            key={m.name}
            delayMs={150 + i * 150}
            className="ch-team-card"
          >
            <div className="ch-team-card-portrait-col">
              <div className="ch-team-card-portrait">
                <img
                  src={m.portrait}
                  alt={`${m.name} portrait`}
                  loading="lazy"
                />
              </div>
              <a
                href={m.xUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ch-team-card-x"
                aria-label={`${m.name} on X (${m.xHandle})`}
              >
                <FontAwesomeIcon
                  icon={["fab", "x-twitter"]}
                  className="ch-team-card-x-icon"
                />
                <span className="ch-team-card-x-handle">{m.xHandle}</span>
              </a>
            </div>
            <div className="ch-team-card-body">
              <div className="ch-team-card-head">
                <span className="ch-team-card-index">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="ch-team-card-id">
                  <h3 className="ch-team-card-name">{m.name}</h3>
                  <p className="ch-team-card-role">{m.role}</p>
                </div>
              </div>
              <p className="ch-body ch-team-card-bio">{m.bio}</p>
              {m.publications && m.publications.length > 0 ? (
                <RefRow label="Publications" items={m.publications} />
              ) : null}
              {m.filmography && m.filmography.length > 0 ? (
                <RefRow label="Filmography" items={m.filmography} />
              ) : null}
            </div>
          </FadeInUp>
        ))}
      </div>
    </ChSection>
  );
}
