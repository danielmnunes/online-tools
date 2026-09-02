import type { APIRoute } from 'astro';

/**
 * Generated rather than kept in public/ because the Sitemap directive has to
 * be an absolute URL — crawlers ignore a relative one — and the absolute URL
 * depends on SITE_URL, which differs between the workers.dev address and any
 * custom domain added later.
 */
export const GET: APIRoute = ({ site }) => {
  const lines = ['User-agent: *', 'Allow: /'];

  if (site) {
    lines.push('', `Sitemap: ${new URL('sitemap-index.xml', site).href}`);
  }

  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
