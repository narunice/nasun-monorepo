import { useTranslation } from "react-i18next";

export const LanguageSwitcher = () => {
  const { i18n } = useTranslation();

  return (
    <select
      value={i18n.language}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      className="bg-transparent text-nasun-black border border-nasun-black/20 rounded-lg px-1.5 py-0.5 xl:px-2 xl:py-1 text-xs xl:text-sm hover:border-nasun-black/40 hover:text-nasun-black active:border-nasun-black/60 focus:outline-none transition-all"
      aria-label="Select language"
    >
      <option
        value="en"
        className="bg-nasun-white text-nasun-black"
      >
        English
      </option>
      <option
        value="ko"
        className="bg-nasun-white text-nasun-black"
      >
        한국어
      </option>
    </select>
  );
};
