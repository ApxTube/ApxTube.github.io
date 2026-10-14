# Auralis — Music Discovery Web App

A responsive, dark music and anime discovery website with separate Songs, Videos, and Anime sections, mood shortcuts, liked tracks, recent plays, an embedded YouTube player, and an AniList-powered anime catalog.

## Secure live search setup
Auralis is a static frontend plus a small Cloudflare Worker proxy. The YouTube Data API key belongs only in the Worker secret named `YOUTUBE_API_KEY`; never put it in public frontend files.

1. Deploy `cloudflare-worker/worker.js` as a Cloudflare Worker. Detailed no-command-line instructions are in `cloudflare-worker/README.md`.
2. In Worker Settings → Variables and Secrets, add secret `YOUTUBE_API_KEY` using a newly generated YouTube Data API v3 key.
3. Set `ALLOWED_ORIGINS` to your exact GitHub Pages origin, e.g. `https://YOUR-USERNAME.github.io` (no repository path).
4. Replace the placeholder URL in `config.js` with your deployed Worker URL and commit that change to GitHub.
5. Enable YouTube Data API v3 in Google Cloud and restrict the key to that API. Keep the key secret in Cloudflare.

The key previously pasted into chat should be considered exposed; disable it and create a replacement. Do not paste the replacement into chat or GitHub.

## Anime catalog and episode guide
The Anime sidebar uses the public AniList GraphQL API at `https://graphql.anilist.co`; no API key or paid subscription is required for the basic catalog. It loads trending/search results, cover art, synopsis, genres, ratings, episode counts, and related prequel/sequel entries where available.

Episode buttons use the existing YouTube search Worker to search for a possible official episode upload, then display results in the existing YouTube player. Search results are not automatically verified as rights-holder uploads, so choose official channels when available. AniList provides metadata, not episode video files. This project does not scrape or integrate unofficial streaming sites such as ToonStream/MultiMovies, and it cannot promise that every episode is available to watch.

## Run locally
For local frontend testing, run `python -m http.server 8000` from this folder and open `http://localhost:8000`. Add `http://localhost:8000` to the Worker `ALLOWED_ORIGINS` variable if you want search to work locally.

## Playback limitations
Auralis uses the official YouTube embedded player. Some videos cannot play on external sites because their owners disable embedding or YouTube imposes other restrictions. No website can force restricted uploads to play. This project does not download/rip YouTube audio.

## Files
- `index.html`, `styles.css`, `app.js`: frontend
- `config.js`: public Worker URL only (never a key)
- `cloudflare-worker/worker.js`: secure API proxy
- `cloudflare-worker/wrangler.toml`: optional CLI deployment config
- `assets/logo.svg`: logo
