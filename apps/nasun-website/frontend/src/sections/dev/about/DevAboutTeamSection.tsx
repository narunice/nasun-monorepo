import ChSection from "../home/ChSection";
import FadeInUp from "../home/FadeInUp";
import naruPortrait from "@/assets/images/profile-naru.png";
import overclockedPortrait from "@/assets/images/profile-overclocked.png";

type Member = {
  name: string;
  role: string;
  bio: string;
  portrait: string;
};

const MEMBERS: Member[] = [
  {
    name: "Naru",
    role: "Founder and Protocol Lead",
    bio: "Architect of the Nasun runtime, a Move-based L1 built on Mysticeti, and author of the core onchain systems and production infrastructure layer. Her background in clinical psychology and research on online behavior and identity formation informs Nasun's behavioral scoring systems. She is first author on two peer-reviewed SCIE-indexed papers in mental health. Prior decade in the Korean film industry across productions shown at Cannes, Berlin, and Venice.",
    portrait: naruPortrait,
  },
  {
    name: "Overclocked",
    role: "Founder and Ecosystem Lead",
    bio: "Owns product strategy, market research, and community growth, including the cohort-acquisition systems that produced the devnet's verified-tester base without paid acquisition. Active in crypto since 2017 across DAO operations and community building. Background directing commercial and broadcast productions for Microsoft, Nike, and IBM, plus operating a 100+ employee retail business. BA from the University of Michigan.",
    portrait: overclockedPortrait,
  },
];

export default function DevAboutTeamSection() {
  return (
    <ChSection innerClassName="ch-about-team" fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-3 items-center text-center">
        <span className="ch-eyebrow">04 / Team</span>
        <h2 className="ch-display">
          <span className="ch-accent-pado">Team</span>
        </h2>
      </FadeInUp>

      <div className="ch-team-grid">
        {MEMBERS.map((m, i) => (
          <FadeInUp
            key={m.name}
            delayMs={150 + i * 150}
            className="ch-team-card"
          >
            <div className="ch-team-card-portrait">
              <img
                src={m.portrait}
                alt={`${m.name} portrait`}
                loading="lazy"
              />
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
            </div>
          </FadeInUp>
        ))}
      </div>
    </ChSection>
  );
}
