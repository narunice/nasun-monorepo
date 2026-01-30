import { useTranslation } from "react-i18next";

const rowKeys = [
  "privacy",
  "payment",
  "audit",
  "executor",
  "compliance",
] as const;

export function ProblemDetailDiagram() {
  const { t } = useTranslation("baram");

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-nasun-black/10">
            <th className="text-left py-3 px-4 text-nasun-black/40 font-medium">
              {t("problem.detail.headers.aspect")}
            </th>
            <th className="text-left py-3 px-4 text-red-500/80 font-medium">
              {t("problem.detail.headers.traditional")}
            </th>
            <th className="text-left py-3 px-4 text-emerald-600 font-medium">
              {t("problem.detail.headers.baram")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rowKeys.map((key) => (
            <tr key={key} className="border-b border-nasun-black/[0.06]">
              <td className="py-3 px-4 text-nasun-black font-medium">
                {t(`problem.detail.rows.${key}.aspect`)}
              </td>
              <td className="py-3 px-4 text-nasun-black/40">
                {t(`problem.detail.rows.${key}.traditional`)}
              </td>
              <td className="py-3 px-4 text-emerald-600">
                {t(`problem.detail.rows.${key}.baram`)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
