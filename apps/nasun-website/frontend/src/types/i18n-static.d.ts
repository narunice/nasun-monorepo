import { locales } from "../lib/i18n-static/staticT";

declare global {
  namespace NasunI18n {
    type Locales = typeof locales;
    type Namespace = keyof Locales;
    
    // 단순화된 t 함수 타입 정의
    type TFunction = (key: string, options?: any) => any;
  }
}

export {};
