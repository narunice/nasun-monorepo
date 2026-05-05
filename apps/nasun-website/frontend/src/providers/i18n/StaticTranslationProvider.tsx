import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { getStaticT, LocaleNamespace, locales } from '../../lib/i18n-static/staticT';

interface StaticTranslationContextValue {
  t: (key: string, options?: any) => any;
  i18n: {
    language: string;
    changeLanguage: (lng: string) => Promise<void>;
  };
}

const StaticTranslationContext = createContext<StaticTranslationContextValue | undefined>(undefined);

interface StaticTranslationProviderProps {
  children: ReactNode;
  ns?: LocaleNamespace | LocaleNamespace[];
}

export function StaticTranslationProvider({ children, ns = 'common' }: StaticTranslationProviderProps) {
  const namespaces = useMemo(() => Array.isArray(ns) ? ns : [ns], [ns]);
  
  const value = useMemo(() => {
    const t = (key: string, options?: any) => {
      // 1. "ns:key" 형식인 경우 해당 네임스페이스만 검색
      if (key.includes(':')) {
        const [targetNs, targetKey] = key.split(':');
        const result = getValueByPath(locales[targetNs as LocaleNamespace], targetKey);
        if (result !== undefined) return interpolate(result, options);
        return key;
      }

      // 2. 지정된 네임스페이스들을 순서대로 검색
      for (const currentNs of namespaces) {
        const result = getValueByPath(locales[currentNs], key);
        if (result !== undefined) return interpolate(result, options);
      }

      // 3. common에서 마지막으로 검색 (지정되지 않았더라도 fallback)
      if (!namespaces.includes('common')) {
        const result = getValueByPath(locales['common'], key);
        if (result !== undefined) return interpolate(result, options);
      }

      return key;
    };

    return {
      t,
      i18n: {
        language: 'en',
        changeLanguage: async () => {},
      }
    };
  }, [namespaces]);

  return (
    <StaticTranslationContext.Provider value={value}>
      {children}
    </StaticTranslationContext.Provider>
  );
}

export function useStaticTranslation(ns?: LocaleNamespace | LocaleNamespace[]) {
  const context = useContext(StaticTranslationContext);
  const namespaces = useMemo(() => {
    if (!ns) return ['common'] as LocaleNamespace[];
    return Array.isArray(ns) ? ns : [ns];
  }, [ns]);
  
  // context가 있더라도 요청된 네임스페이스가 다를 수 있으므로 
  // 훅 레벨에서 새로운 t 함수를 제공하는 것이 안전함 (i18next useTranslation 동작)
  const t = useMemo(() => {
    return (key: string, options?: any) => {
      if (key.includes(':')) {
        const [targetNs, targetKey] = key.split(':');
        const result = getValueByPath(locales[targetNs as LocaleNamespace], targetKey);
        if (result !== undefined) return interpolate(result, options);
        return key;
      }

      for (const currentNs of namespaces) {
        const result = getValueByPath(locales[currentNs], key);
        if (result !== undefined) return interpolate(result, options);
      }

      if (!namespaces.includes('common')) {
        const result = getValueByPath(locales['common'], key);
        if (result !== undefined) return interpolate(result, options);
      }

      return key;
    };
  }, [namespaces]);

  return {
    t,
    i18n: context?.i18n || {
      language: 'en',
      changeLanguage: async () => {},
    }
  };
}

/** 보간 처리 헬퍼 */
function interpolate(result: any, options?: any): any {
  if (typeof result === "string" && options) {
    return result.replace(/\{\{(.+?)\}\}/g, (_, p1) => {
      const value = options[p1.trim()];
      return value !== undefined ? value : `{{${p1}}}`;
    });
  }
  return result;
}

/** 객체 경로 탐색 헬퍼 (staticT에서 가져옴) */
function getValueByPath(obj: any, path: string): any {
  if (!obj) return undefined;
  const keys = path.split(".");
  let current = obj;

  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  return current;
}

// 기존 i18n 객체 직접 참조(i18n.language 등)와의 호환성을 위한 기본 객체
const i18nStatic = {
  language: 'en',
  changeLanguage: async () => {},
  t: (key: string, options?: any) => {
    if (key.includes(':')) {
      const [ns, k] = key.split(':');
      return getStaticT(ns as LocaleNamespace)(k, options);
    }
    return getStaticT('common')(key, options);
  }
};

export default i18nStatic;
