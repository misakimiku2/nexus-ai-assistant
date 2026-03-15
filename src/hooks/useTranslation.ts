import { useTranslation as useI18nextTranslation } from 'react-i18next';

export const useTranslation = () => {
  const { t: t_i18n, i18n } = useI18nextTranslation();
  
  const createProxy = (path: string): any => {
    const proxy: any = (...args: any[]) => {
      return (t_i18n as any)(path, ...args);
    };

    return new Proxy(proxy, {
      get(target, prop) {
        if (typeof prop === 'symbol' || prop === '$$typeof' || prop === 'then') return undefined;
        if (typeof prop === 'string') {
          if (prop === 'constructor' || prop === 'prototype' || prop === 'length') return undefined;
          if (prop === 'toString' || prop === 'valueOf') return () => t_i18n(path);
          
          const newPath = path ? `${path}.${prop}` : prop;
          
          // If the path exists and is a string, return the string directly
          // This allows t.key.subkey to be a string if it's a leaf node
          if (i18n.exists(newPath)) {
            const defaultNS = i18n.options.defaultNS || 'translation';
            const ns = typeof defaultNS === 'string' ? defaultNS : defaultNS[0];
            const value = i18n.getResource(i18n.language, ns, newPath);
            if (typeof value === 'string') {
              return t_i18n(newPath);
            }
            return createProxy(newPath);
          }
          
          return newPath;
        }
        return undefined;
      }
    });
  };

  return { t: createProxy('') };
};
