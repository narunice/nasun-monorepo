/**
 * Return a real 404 for build assets that no longer exist.
 *
 * public/_redirects rewrites every unmatched path to index.html with a 200, and
 * public/_headers marks everything under /assets/* immutable for a year. Together
 * they turn a single miss -- a cached page asking for a hash that was replaced,
 * or an edge that has not yet received a new deploy -- into an HTML document
 * cached under a stylesheet or script URL for a year. Browsers discard a
 * stylesheet served as text/html without an error, so the site renders
 * permanently unstyled for that client and survives reloads.
 *
 * 2026-07-20 incident: three users reported an unusable, unstyled gostop.app.
 * `GET /assets/index-DEADBEEF.css` answered 200 text/html with
 * `max-age=31536000, immutable` and `cf-cache-status: HIT`.
 *
 * Build assets are content-hashed, so an HTML response for a path under
 * /assets/ always means the asset is missing. Answering 404 with no-store keeps
 * the wrong body from being cached and lets the browser report a hard failure.
 * Routes keep the SPA fallback, so the in-app NotFound page is unaffected.
 */

interface AssetContext {
  next: () => Promise<Response>;
}

export async function onRequest(context: AssetContext): Promise<Response> {
  const response = await context.next();

  if (!(response.headers.get('content-type') ?? '').includes('text/html')) {
    return response;
  }

  return new Response('Not Found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
