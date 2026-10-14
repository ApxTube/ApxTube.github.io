# Auralis Cloudflare Worker (secure YouTube search proxy)

This Worker keeps `YOUTUBE_API_KEY` server-side. Never place that key in `config.js`, `app.js`, HTML, or a public GitHub repository.

## Deploy from the Cloudflare dashboard (no command line needed)
1. Sign in to Cloudflare and open **Workers & Pages**: https://dash.cloudflare.com/
2. Create a Worker named `auralis-search-api`.
3. Choose **Edit code** and replace the starter code with the contents of `worker.js`, then deploy.
4. Open the Worker **Settings → Variables and Secrets**. Add a **Secret** named `YOUTUBE_API_KEY` and paste a newly created/replaced YouTube Data API v3 key. Deploy the change.
5. Add a plain-text variable `ALLOWED_ORIGINS` with your site origin only, e.g. `https://YOUR-USERNAME.github.io` (no repository path). If testing from localhost, add the exact local origin separated by a comma, e.g. `https://YOUR-USERNAME.github.io,http://localhost:8000`. Deploy.
6. Copy your Worker URL, usually `https://auralis-search-api.YOUR-SUBDOMAIN.workers.dev`.
7. In the website repository, open `config.js` and replace `https://REPLACE-WITH-YOUR-WORKER.workers.dev` with the real Worker URL. Commit the change.

## API key settings
- Create/rotate the key in Google Cloud Console and enable YouTube Data API v3.
- Restrict the key to **YouTube Data API v3** under API restrictions. Since the Worker calls Google server-to-server, do not use a browser HTTP-referrer restriction for this server-side key; use API restrictions and keep the secret in the Worker.
- The key previously pasted into chat should be considered exposed. Disable/delete it and use a replacement. Do not send the replacement to ChatGPT or commit it to GitHub.

## Endpoint
`GET /api/search?q=artist%20song&view=songs` or `view=videos`. The Worker validates allowed browser origins and forwards the request to YouTube Data API v3.

## Important
The browser-facing Worker URL is public, as it must be for a public site. Origin checks are not authentication and do not stop all non-browser abuse. Keep API restrictions enabled, monitor quota, and add stronger rate limiting if traffic grows.
