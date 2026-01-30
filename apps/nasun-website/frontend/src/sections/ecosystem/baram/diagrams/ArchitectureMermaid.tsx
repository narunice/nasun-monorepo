import { useTranslation } from "react-i18next";
import { MermaidDiagram } from "./MermaidDiagram";
import userFlowSvg from "./svg/user-flow.svg?raw";

export function ArchitectureMermaid() {
  const { t } = useTranslation("baram");

  return (
    <div className="space-y-4">
      <h4 className="text-nasun-black font-semibold text-lg">
        {t("solution.detail.title")}
      </h4>
      <MermaidDiagram svg={userFlowSvg} alt="Baram User Flow Diagram" className="max-h-[600px] overflow-y-auto [&>svg]:max-w-[811px] [&>svg]:mx-auto" />
    </div>
  );
}
