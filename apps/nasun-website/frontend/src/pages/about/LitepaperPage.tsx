import { Link } from "react-router-dom";
import { PageLayout } from "../../components/layout/PageLayout";
import { ButtonV3 } from "@/components/ui/button-v3";

export default function LitepaperPage() {
  return (
    <PageLayout>
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-16">
        <p className="text-2xl font-semibold text-nasun-white/60 tracking-wide">Coming Soon</p>
        <div className="flex flex-col sm:flex-row gap-5">
          <ButtonV3 variant="nw1" outline size="lg" asChild className="px-10">
            <Link to="/ecosystem/pado">Explore Pado</Link>
          </ButtonV3>
          <ButtonV3 variant="nw1" outline size="lg" asChild className="px-10">
            <Link to="/ecosystem/gensol/main">Explore GenSol</Link>
          </ButtonV3>
          <ButtonV3 variant="nw1" outline size="lg" asChild className="px-10">
            <Link to="/ecosystem/baram">Explore Baram</Link>
          </ButtonV3>
        </div>
      </div>
    </PageLayout>
  );
}
