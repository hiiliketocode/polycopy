# Why the app doesn’t load in Huddlekit / Ruttl (and how to fix it)

## What we tried

1. **frame-ancestors** – We allow embedding from:
   - `https://app.huddlekit.com`, `https://huddlekit.com`
   - `https://web.ruttl.com`, `https://ruttl.com`
   - Set in both `proxy.ts` and `vercel.json`.

2. **No localhost in production** – `getAppBaseUrl()` and API routes use the production URL in prod so the app never requests localhost when embedded.

It still doesn’t load (nav bar only, or “Loading…” forever). Below is the likely cause and what to do.

---

## Cause: many of these tools use a **proxy**, not a direct iframe

### How “link + view page” usually works

From public docs and URL patterns:

- **Ruttl**  
  - Uses a **proxy**: the iframe `src` is something like  
    `https://live--https--your-site.proxy.ruttl.com/`  
  - So the **document origin** in the iframe is **`proxy.ruttl.com`**, not your app’s domain.
  - Ruttl’s server fetches your site and re-serves it from their domain.

- **Huddlekit**  
  - Described as “proxy/embed” and “share a link” with no script on your site.  
  - So they likely also load your URL via **their** server and serve it from their origin (or a similar proxy pattern).

### Why that breaks the app

1. **Your CSP doesn’t apply to what the browser sees**  
   - The browser’s request goes to **their** URL (e.g. `proxy.ruttl.com`), not to `polycopy.app`.  
   - The response (and any CSP) the browser sees is from the **feedback tool’s server**.  
   - So your `frame-ancestors` (and other headers) on `polycopy.app` only apply when someone loads `polycopy.app` directly. They don’t control the response when the content is served from `proxy.ruttl.com` (or Huddlekit’s equivalent).  
   - Fixing our headers can’t fix a “refused to frame” that comes from **their** response. If the tool strips or replaces headers when proxying, that’s on their side.

2. **Relative URLs break under the proxy**  
   - In the iframe, the page’s origin is the **proxy** (e.g. `proxy.ruttl.com`).  
   - So:
     - `<script src="/_next/static/...">` → `https://proxy.ruttl.com/_next/static/...`
     - `fetch('/api/...')` → `https://proxy.ruttl.com/api/...`
   - Unless the tool **rewrites** every link/script/api URL in HTML and in JS and proxies those requests to your real backend, your app never talks to your real server.  
   - Many tools only fetch the initial HTML (and maybe some assets). They don’t do a full transparent reverse-proxy for all `/api/*` and `/_next/*`.  
   - Result: you can get the first paint (e.g. nav) and then “Loading…” forever because:
     - API calls go to the proxy and get 404/wrong host, or  
     - Scripts/assets don’t load correctly, or  
     - Cookies/session are for `polycopy.app`, not the proxy origin, so auth fails.

3. **Chrome “connection blocked … local network”**  
   - If the **proxy** (or something in the page when served from the proxy) triggers a request to localhost/private network, Chrome can block it.  
   - That’s separate from frame-ancestors; it’s Private Network Access. Our app already avoids localhost in prod; the remaining risk is the tool’s own proxy or scripts.

So: **when the tool uses a proxy, our headers and our URL are not the main thing the browser is loading. The “page not loading” is mostly due to proxy architecture (origin + relative URLs + cookies), not only CSP.**

---

## How to confirm

In the browser, when the feedback tool shows your “page”:

1. **What is the iframe `src`?**  
   - Open DevTools → Elements, select the iframe that should show your app.  
   - If `src` is something like `https://….proxy.ruttl.com/` or `https://….huddlekit.com/...` (not `https://polycopy.app/...`), then the content is **proxied** and the above applies.

2. **What is the document origin?**  
   - In the iframe, open Console and run:  
     `location.origin`  
   - If it’s the tool’s domain (e.g. `https://proxy.ruttl.com`), then relative URLs and cookies are as described above.

3. **What do the network and console say?**  
   - Network: look for failed requests to `/api/...` or `/_next/...` (wrong host or 404).  
   - Console: look for CSP errors, CORS, or “connection blocked” / “local network” messages.

---

## What actually works

### Option A: Use a tool that **does not proxy** (direct iframe to your URL)

- The iframe `src` must be **your** URL (e.g. `https://polycopy.app/...`).  
- Then the document origin is `polycopy.app`, our `frame-ancestors` and cookies apply, and `/api` and `/_next` stay on your domain.  
- We already allow `app.huddlekit.com`, `huddlekit.com`, `web.ruttl.com`, `ruttl.com` in `frame-ancestors`. If a tool truly loads `polycopy.app` in the iframe (no proxy), it should work as long as their parent origin is in that list.

If a vendor says “we load your URL in an iframe”, ask explicitly:  
**“Is the iframe `src` my URL, or a URL on your domain that fetches my site?”**  
If it’s the latter, it’s a proxy and you’ll hit the issues above.

### Option B: Use a **browser extension** on your live URL (no iframe)

- You open **your** app in a normal tab (e.g. `https://polycopy.app`).  
- The tool (e.g. Marker.io, BugHerd) runs as an extension and overlays comments on the same tab.  
- No iframe, no proxy, no frame-ancestors or relative-URL issues.  
- This is the most reliable for “live page + comments” when the link-based tools keep failing.

### Option C: Use the tool’s **screenshot / static capture** flow

- Ruttl and others offer “capture screenshot” or “upload image” when the live page doesn’t load.  
- You get comments on a static image, not on the live app. No proxy, no loading issues.

---

## Summary

| Cause | What we did | Why it might not fix “not loading” |
|--------|-------------|------------------------------------|
| frame-ancestors blocking embed | Allow Huddlekit/Ruttl in CSP + vercel.json | If the tool **proxies** your site, the browser never loads `polycopy.app`; it loads the tool’s URL, so our CSP isn’t the one in effect. |
| App requesting localhost in prod | getAppBaseUrl() and no localhost in prod | Reduces risk; if the **proxy** or their page triggers a local request, Chrome can still block. |
| Relative URLs / API under proxy | N/A (app not designed to run under another origin) | Under a proxy, `/api` and `/_next` go to the proxy; without full URL rewriting and backend proxying by the tool, the app can’t work. |

**Recommendation:** Prefer a tool that either (1) loads your URL **directly** in the iframe (no proxy), or (2) uses a **browser extension** on your live URL. Fallback: use the tool’s **screenshot/capture** flow so you’re not depending on the proxy at all.
