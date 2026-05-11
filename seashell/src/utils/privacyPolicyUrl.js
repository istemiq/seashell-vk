/**
 * Абсолютный URL статической страницы public/privacy.html после деплоя на VK Hosting.
 */
export function getPrivacyPolicyPageUrl() {
  if (typeof window === 'undefined') return '';
  try {
    const { origin, pathname } = window.location;
    const lastSlash = pathname.lastIndexOf('/');
    const base = lastSlash >= 0 ? pathname.slice(0, lastSlash + 1) : '/';
    return `${origin}${base}privacy.html`;
  } catch {
    return '';
  }
}
