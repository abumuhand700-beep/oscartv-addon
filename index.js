const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 10000;
const API = (process.env.OSCAR_API || "https://admin.dramaramadan.net").replace(/\/+$/, "");

const manifest = {
  id: "community.oscartv.streams",
  version: "0.2.0",
  name: "OscarTV Streams",
  description: "OscarTV stream source",
  logo: "https://oscartv.app/favicon.ico",
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  resources: ["stream"]
};

app.get("/manifest.json", (_, res) => res.json(manifest));

const isUrl = x => typeof x === "string" && /^https?:\/\//i.test(x);
const cleanId = id => decodeURIComponent(id || "").split(":")[0].trim();

function collectUrls(x, out = []) {
  if (!x) return out;
  if (Array.isArray(x)) { x.forEach(v => collectUrls(v, out)); return out; }
  if (typeof x !== "object") return out;

  for (const k of [
    "streamUrl","streamURL","stream_url","videoUrl","video_url","fileUrl","file_url",
    "watchUrl","watch_url","url","link","src","source"
  ]) {
    if (isUrl(x[k])) out.push({ url:x[k], data:x });
  }
  Object.values(x).forEach(v => {
    if (v && typeof v === "object") collectUrls(v, out);
  });
  return out;
}

async function get(path, params) {
  try {
    const r = await axios.get(API + path, {
      params,
      timeout: 15000,
      validateStatus: s => s >= 200 && s < 500,
      headers: { "User-Agent": "OscarTV/1.1.5" }
    });
    if (r.status >= 200 && r.status < 300) return r.data;
  } catch (_) {}
  return null;
}

async function resolve(imdb, type) {
  const moviePaths = [
    "/api/movies/view.php",
    "/api/movies/show.php"
  ];
  const seriesPaths = [
    "/api/series/view.php",
    "/api/series/show.php"
  ];
  const paths = type === "series" ? seriesPaths : moviePaths;

  // The APK contains imdb_id, imdbId and movie/series identifiers.
  const paramSets = [
    { imdb_id: imdb },
    { imdbId: imdb },
    { external_id: imdb },
    { externalId: imdb },
    { imdb: imdb }
  ];

  for (const path of paths) {
    for (const params of paramSets) {
      const data = await get(path, params);
      if (!data) continue;

      const urls = collectUrls(data);
      if (urls.length) return urls;

      // If the item response exposes an internal id, ask the watch-links endpoint.
      const ids = [];
      (function findIds(x) {
        if (!x || typeof x !== "object") return;
        if (Array.isArray(x)) return x.forEach(findIds);
        for (const k of ["id","movie_id","series_id","episode_id"]) {
          if (x[k] !== undefined && x[k] !== null) ids.push({k, v:x[k]});
        }
        Object.values(x).forEach(v => { if (v && typeof v === "object") findIds(v); });
      })(data);

      for (const id of ids.slice(0, 5)) {
        const watchParams = [
          { id: id.v },
          { [`${id.k}`]: id.v }
        ];
        for (const wp of watchParams) {
          const w = await get("/api/watch_links/", wp);
          const wu = collectUrls(w);
          if (wu.length) return wu;
        }
      }
    }
  }
  return [];
}

app.get("/stream/:type/:id.json", async (req, res) => {
  const type = req.params.type === "series" ? "series" : "movie";
  const imdb = cleanId(req.params.id);

  if (!/^tt\d+$/i.test(imdb)) return res.json({ streams: [] });

  const urls = await resolve(imdb, type);
  const seen = new Set();
  const streams = [];

  for (const item of urls) {
    if (!seen.has(item.url)) {
      seen.add(item.url);
      streams.push({
        name: "OscarTV",
        title: "OscarTV",
        url: item.url,
        behaviorHints: { notWebReady: false }
      });
    }
  }
  res.json({ streams });
});

app.get("/", (_, res) => res.type("text").send("OscarTV Streams Addon v0.2.0"));
app.listen(PORT, () => console.log(`OscarTV addon listening on ${PORT}; API=${API}`));
