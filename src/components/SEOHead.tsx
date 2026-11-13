import { useEffect } from 'react';

interface SEOHeadProps {
  title: string;
  description: string;
  structuredData?: Record<string, any>;
}

export function SEOHead({ title, description, structuredData }: SEOHeadProps) {
  useEffect(() => {
    document.title = title;

    const updateMeta = (attr: 'name' | 'property', key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    updateMeta('name', 'description', description);
    updateMeta('property', 'og:title', title);
    updateMeta('property', 'og:description', description);
    updateMeta('name', 'twitter:title', title);
    updateMeta('name', 'twitter:description', description);

    const canonicalUrl = `${window.location.origin}${window.location.pathname}`;
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl);
    updateMeta('property', 'og:url', canonicalUrl);

    const existingScript = document.getElementById('dynamic-json-ld');
    if (existingScript) existingScript.remove();
    if (structuredData) {
      const script = document.createElement('script');
      script.id = 'dynamic-json-ld';
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(structuredData);
      document.head.appendChild(script);
    }
  }, [title, description, structuredData]);

  return null;
}
