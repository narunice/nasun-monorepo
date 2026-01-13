import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "../../../../components/ui/DividerBox";
import { PageTitle } from "../../../../components/ui/PageTitle";
import { SectionTitle } from "../../../../components/ui/SectionTitle";

const StrategyOverviewV2 = () => {
  return (
    <SectionLayout className="!max-w-6xl">
      {/* Page Title */}
      <PageTitle className="normal-case flex flex-col items-center">
        <span>NASUN: A Unified Vision</span>
        <span className="font-normal text-xl/tight md:text-2xl/tight lg:text-3xl/tight tracking-wide text-nasun-white ">
          for the Next Era of Creation
        </span>
      </PageTitle>

      <div className="flex flex-col gap-6 md:gap-8 lg:gap-10">
        {/* Section 1: The Core Challenge */}
        <section>
          <SectionTitle as="h4" className=" ">
            1. The Core Challenge: Creation Without Value Accrual
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4 ">
            <p>We live in an age of unprecedented creation.</p>
            <p>
              AI tools, social platforms, and global connectivity allow millions of people to
              create, share, and collaborate instantly. Yet despite this explosion of activity, very
              little lasting value is being created, economically, culturally, or socially.
            </p>
            <p>
              Stories, worlds, and ideas are launched every day, but most vanish as quickly as they
              appear.
            </p>

            <DividerBox color="w1" padding="sm">
              <ul className="space-y-4 ">
                <li className="">
                  <strong className="text-nasun-c1 ">The Attention Trap:</strong> Content is
                  produced, consumed, and forgotten in seconds.
                </li>
                <li>
                  <strong className="text-nasun-c1">The Meaning Gap:</strong> AI makes content
                  infinite, but meaning and value increasingly scarce.
                </li>
                <li>
                  <strong className="text-nasun-c1">The Extraction Model:</strong> Creators, fans,
                  and professionals pour energy into platforms, but rarely share in long-term
                  ownership or outcomes.
                </li>
              </ul>
            </DividerBox>

            <p>
              The issue is not creativity.
              <br />
              It is <strong className="text-nasun-white">continuity</strong>.
            </p>
            <p>
              And without continuity,{" "}
              <strong className="text-nasun-white">value cannot accrue</strong>.
            </p>
            <p>
              What’s missing is a way for global communities to build enduring intellectual property
              together and to share in the value as those worlds grow into games, films,
              applications, and financial systems.
            </p>
          </div>
        </section>

        {/* Section 2: Our Solution */}
        <section>
          <SectionTitle as="h4" className=" ">
            2. Our Solution: The Nasun Framework
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>Nasun is a platform for coordinated creation at global scale.</p>
            <p>
              We treat technology, AI, social media, and Web3, as a unified stack designed to guide
              a project from a spark of an idea to a living, global IP.
            </p>
            <p>
              Rather than optimizing for empty views or speculation, Nasun is built to help
              communities create meaningful work together and ensure that ownership and value flow
              back to the community.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 mt-2 md:mt-3 lg:mt-4">
            <DividerBox
              color="n1"
              className=""
              titleClassName="!text-nasun-c1"
              title="I. Turning Fleeting Energy into Persistent Value"
            >
              <div className="space-y-4 text-nasun-white/90 text-lg font-light">
                <p>Today, creative energy is scattered across feeds, chats, and platforms.</p>
                <p>
                  Nasun provides a framework where creators, fans, and professionals collaborate
                  around shared IPs designed to evolve over time. Every contribution, creative,
                  technical, or financial, builds toward something that lasts.
                </p>
                <p>
                  Whether it’s an expansive science-fiction universe like Gen Sol or a unified
                  financial rail like Pado, contributions are not lost to the feed. They compound.
                </p>
                <p>When an IP succeeds, the people who helped build it share in that success.</p>
              </div>
            </DividerBox>

            <DividerBox
              color="n1"
              titleClassName="!text-nasun-c1"
              title="II. The Network as an Economic Backbone"
            >
              <div className="space-y-4 text-nasun-white/90 text-lg font-light">
                <p>
                  To support this kind of collaboration, ownership must be clear, composable, and
                  enforceable.
                </p>
                <p>
                  The Nasun Network serves as the economic backbone for shared creation. Built using
                  the Move programming language, it allows us to track contributions, attribution,
                  and ownership at a granular level across creative and financial work alike.
                </p>
                <p>
                  When an IP succeeds through a game release, film, or financial service, value
                  flows transparently back to the community that created it, not to a centralized
                  intermediary.
                </p>
                <p>
                  Blockchain infrastructure exists here for one reason: to make shared ownership
                  real.
                </p>
              </div>
            </DividerBox>

            <DividerBox
              color="n1"
              titleClassName="!text-nasun-c1"
              title="III. A Seamless, Human-First Experience"
            >
              <div className="space-y-4 text-nasun-white/90 text-lg font-light">
                <p>We believe technology should feel invisible.</p>
                <p>
                  Participants engage through stories, culture, and familiar platforms, while the
                  underlying systems quietly handle coordination, attribution, and value flow.
                </p>
                <ul className="list-disc pl-6 space-y-2 marker:text-nasun-c1">
                  <li>
                    <strong className="text-nasun-white">Social Media</strong> acts as our discovery
                    and cultural engine
                  </li>
                  <li>
                    <strong className="text-nasun-white">Generative AI</strong> accelerates
                    production and synthesis
                  </li>
                  <li>
                    <strong className="text-nasun-white">The Nasun Network</strong> serves as the
                    shared vault and consensus layer
                  </li>
                </ul>
                <p>
                  The result is an experience that feels natural to creators and fans alike, while
                  remaining transparent and fair beneath the surface.
                </p>
              </div>
            </DividerBox>
          </div>
        </section>

        {/* Section 3: Built by Creators */}
        <section>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4 ">
            3. Built by Creators, Not Just Engineers
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>Nasun did not begin as a technical experiment.</p>
            <p>
              It grew out of real production work, on film sets, in editing rooms, and inside
              studios where stories are refined, teams are aligned, and finished work must meet
              professional standards.
            </p>
            <p>
              Our founders bring a rare combination of cinematic storytelling and systems
              engineering. Our lead, Naru, is a professional filmmaker who has served as head editor
              and producer on seminal South Korean films recognized at Cannes, Berlin, and Venice.
              Our ecosystem lead, Overclocked, brings over 20 years of experience in media
              production and hands-on Unreal Engine 5 development.
            </p>
            <p>
              We’ve lived the challenges of creative production firsthand: managing complexity,
              coordinating contributors, protecting creative intent, and delivering real outcomes.
            </p>
            <p>Nasun exists because existing systems failed to support this work at scale.</p>
          </div>
        </section>

        {/* Section 4: The Coordination Pipeline */}
        <section>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4 ">
            4. The Coordination Pipeline: From Signal to Consensus
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>
              Nasun treats on-chain consensus as the final step in a broader human process, not the
              starting point.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2 md:mt-3 lg:mt-4">
            <DividerBox color="c1" className="" titleClassName="" title="1. Signal Aggregation">
              <p className="text-nasun-white/90 text-lg font-light">
                AI systems assist in identifying ideas, themes, and creative directions that show
                sustained resonance across the community.
              </p>
            </DividerBox>
            <DividerBox color="c1" className="" titleClassName="" title="2. Open Collaboration">
              <p className="text-nasun-white/90 text-lg font-light">
                Creative development unfolds in public, with ideas evolving through discussion,
                experimentation, and feedback.
              </p>
            </DividerBox>
            <DividerBox color="c1" className="" titleClassName="" title="3. Proposal Formation">
              <p className="text-nasun-white/90 text-lg font-light">
                High-signal outcomes are refined into actionable proposals, supported by AI-assisted
                synthesis while preserving human authorship and review.
              </p>
            </DividerBox>
            <DividerBox color="c1" className="" titleClassName="" title="4. On-Chain Execution">
              <p className="text-nasun-white/90 text-lg font-light">
                Final decisions are executed through the Nasun layer, making outcomes verifiable,
                enforceable, and transparent.
              </p>
            </DividerBox>
          </div>
          <div className="mt-8 text-nasun-white/90 leading-relaxed text-lg md:text-xl font-light">
            <p>
              By separating discovery, collaboration, and execution, Nasun enables coordination at
              scale without sacrificing decentralization or accountability.
            </p>
          </div>
        </section>

        {/* Section 5: Why Now */}
        <section>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4 ">
            5. Why Now: The Relevance Era
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>
              By the end of 2025, hundreds of millions of people will hold digital assets. Yet most
              experience crypto only as speculation.
            </p>
            <p>
              The problem is not awareness.
              <br />
              It is <strong className="text-nasun-white">relevance</strong>.
            </p>
            <p>
              As AI accelerates creation and power centralizes across platforms, communities need
              systems that allow them to create, decide, and own together, visibly and credibly.
            </p>
            <p>
              Nasun is not focused on launching hundreds of disposable applications. We are building
              a small number of world-class experiences that invite participation, reward
              contribution, and endure.
            </p>
            <p>
              The strongest communities in history were formed by shared stories and shared work.
            </p>
            <p>
              Nasun is the infrastructure that allows the next ones to be built, together, in
              public, and with ownership that lasts.
            </p>
          </div>
        </section>
      </div>
    </SectionLayout>
  );
};

export default StrategyOverviewV2;
