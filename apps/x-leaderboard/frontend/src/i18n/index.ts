import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import leaderboardEn from '../assets/locales/en/leaderboard.json';
import leaderboardKo from '../assets/locales/ko/leaderboard.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { leaderboard: leaderboardEn },
      ko: { leaderboard: leaderboardKo },
    },
    fallbackLng: 'en',
    defaultNS: 'leaderboard',
    ns: ['leaderboard'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
  });

export default i18n;
