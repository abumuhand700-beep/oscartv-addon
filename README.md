# OscarTV Streams Addon

Stream-only addon for Novio/Stremio. It accepts IMDb IDs (`tt...`) and returns direct HTTP(S) stream URLs found in OscarTV API responses.

## Deploy
- Render: create a Web Service from this folder/repository.
- Build: `npm install`
- Start: `npm start`
- Environment variable (optional): `OSCAR_API=https://admin.dramaramadan.net/api`
- Install: `https://YOUR-SERVICE.onrender.com/manifest.json`

## Important
This is an initial API-compatible build. The APK statically exposes the API base and `event_videos` / `video_view`, but the exact movie/series query annotations are not recoverable from the available static extraction here. The addon therefore probes read-only lookup forms and only emits URLs it actually receives.
