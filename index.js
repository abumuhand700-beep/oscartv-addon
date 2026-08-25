const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 10000;
const API = (process.env.OSCAR_API || 'https://admin.dramaramadan.net/api/').replace(/\/$/, '') + '/';
const CINEMETA = 'https://v3-cinemeta.strem.io/meta';
const APP_VERSION = process.env.OSCAR_APP_VERSION || '1.1.5';

const http = axios.create({ timeout: 12000, headers: { 'User-Agent': 'OscarTV/1.1.5' } });

app.get('/manifest.json', (req, res) => res.json({
  id: 'community.oscartv.streams', version: '0.3.0', name: 'OscarTV Streams',
  description: 'OscarTV stream source for Novio/Stremio',
  logo: 'https://oscartv.app/favicon.ico',
  types: ['movie','series'], idPrefixes: ['tt'],
  resources: [{ name:'stream', types:['movie','series'], idPrefixes:['tt'] }]
}));

function obj(v) { return v && typeof v === 'object' ? v : {}; }
function arr(v) { return Array.isArray(v) ? v : []; }
function text(v) { return v == null ? '' : String(v); }
function deepValues(root, keys) {
  const wanted = new Set(keys.map(k => k.toLowerCase()));
  const out = [];
  const seen = new Set();
  function walk(x) {
    if (!x || typeof x !== 'object' || seen.has(x)) return;
    seen.add(x);
    for (const [k,v] of Object.entries(x)) {
      if (wanted.has(k.toLowerCase()) && v != null) out.push(v);
      if (v && typeof v === 'object') walk(v);
    }
  }
  walk(root); return out;
}
function first(root, keys) { return deepValues(root, keys)[0]; }
function unwrap(data) {
  if (!data) return data;
  for (const k of ['data','result','item','movie','series','episode']) {
    if (data && data[k] != null) return data[k];
  }
  return data;
}
function normalizeList(data) {
  data = unwrap(data);
  for (const k of ['items','results','movies','series','episodes']) if (Array.isArray(data?.[k])) return data[k];
  if (Array.isArray(data)) return data;
  return [];
}
function validUrl(s) {
  try { const u = new URL(String(s)); return /^https?:$/.test(u.protocol) ? u.toString() : null; } catch { return null; }
}
function extractUrls(root) {
  const keys = ['streamUrl','stream_url','videoUrl','video_url','watchUrl','watch_url','url','file','src','link','playUrl','play_url','hls','dash','m3u8','mp4'];
  const vals = deepValues(root, keys);
  const urls = [];
  for (const v of vals) {
    if (Array.isArray(v)) { for (const x of v) { const u=validUrl(x); if(u) urls.push(u); } }
    else { const u=validUrl(v); if(u) urls.push(u); }
  }
  return [...new Set(urls)];
}
function titleOf(x) { return text(first(x,['titleEn','title','nameEn','name','titleAr','nameAr'])); }
function yearOf(x) { const y=first(x,['releaseYear','year','release_year','first_air_date','releaseDate','release_date']); return parseInt(String(y||'').slice(0,4),10)||0; }
function imdbOf(x) { return text(first(x,['imdbId','imdb_id','imdb'])); }
function idOf(x) { return first(x,['id','movieId','movie_id','seriesId','series_id','episodeId','episode_id']); }
function score(item, name, year, imdb) {
  let s=0, t=titleOf(item).toLowerCase(), n=name.toLowerCase();
  if (imdb && imdbOf(item) === imdb) s += 1000;
  if (t === n) s += 500; else if (t.includes(n)||n.includes(t)) s += 150;
  if (year && yearOf(item) === year) s += 100;
  return s;
}
async function cinemeta(type,id) {
  const r=await http.get(`${CINEMETA}/${type}/${encodeURIComponent(id)}.json`);
  return obj(r.data?.meta);
}
async function api(path, params={}) {
  const r=await http.get(API+path.replace(/^\//,''), { params });
  return r.data;
}
async function findMovie(imdb) {
  const meta=await cinemeta('movie',imdb); const name=meta.name||''; const year=parseInt(meta.year||0,10)||0;
  const data=await api('movies/', {page:1,limit:30,search:name,app_version:APP_VERSION,has_links:1});
  const list=normalizeList(data).sort((a,b)=>score(b,name,year,imdb)-score(a,name,year,imdb));
  return list[0] || null;
}
async function findSeries(imdb) {
  const meta=await cinemeta('series',imdb); const name=meta.name||''; const year=parseInt(meta.year||0,10)||0;
  const data=await api('series/', {page:1,limit:30,search:name,app_version:APP_VERSION});
  const list=normalizeList(data).sort((a,b)=>score(b,name,year,imdb)-score(a,name,year,imdb));
  return list[0] || null;
}
function makeStreams(urls, title) {
  return urls.map((url,i)=>({ name:'OscarTV', title:title || `OscarTV #${i+1}`, url, behaviorHints:{notWebReady:true} }));
}
async function movieStreams(imdb) {
  const m=await findMovie(imdb); if(!m) return [];
  const id=idOf(m); if(id==null) return extractUrls(m).map(u=>({name:'OscarTV',title:titleOf(m),url:u}));
  let detail;
  try { detail=unwrap(await api('movies/show.php',{id,country:'sa'})); } catch { detail=m; }
  return makeStreams(extractUrls(detail), titleOf(detail)||titleOf(m));
}
async function seriesStreams(imdb,season,episode) {
  const s=await findSeries(imdb); if(!s) return [];
  const sid=idOf(s); if(sid==null) return [];
  let detail; try { detail=unwrap(await api('series/show.php',{id:sid})); } catch { detail=s; }
  let seasonId=null;
  const candidates=deepValues(detail,['seasons','season']);
  for(const c of candidates.flatMap(x=>Array.isArray(x)?x:[x])) {
    const n=parseInt(String(first(c,['seasonNumber','season_number','number','season'])||''),10);
    if(n===season) { seasonId=idOf(c); break; }
  }
  if(seasonId==null) seasonId=first(detail,['seasonId','season_id']);
  if(seasonId==null) return [];
  const eps=normalizeList(await api('episodes/',{season_id:seasonId,page:1,per_page:100,sort:'episode_number'}));
  let ep=eps.find(e=>parseInt(String(first(e,['episodeNumber','episode_number','number'])||''),10)===episode);
  if(!ep) return [];
  const eid=idOf(ep); let detailEp=ep;
  try { if(eid!=null) detailEp=unwrap(await api('episodes/show.php',{id:eid})); } catch {}
  let urls=extractUrls(detailEp);
  if(eid!=null) { try { const wl=unwrap(await api('watch_links/',{episode_id:eid})); urls.push(...extractUrls(wl)); } catch {} }
  return makeStreams([...new Set(urls)], `${titleOf(s)} S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}`);
}

app.get('/stream/:type/:id.json', async (req,res)=>{
  try {
    const type=req.params.type, raw=decodeURIComponent(req.params.id).replace(/\.json$/,'');
    let streams=[];
    if(type==='movie' && /^tt\d+$/.test(raw)) streams=await movieStreams(raw);
    else if(type==='series' && /^tt\d+:\d+:\d+$/.test(raw)) { const [imdb,s,e]=raw.split(':'); streams=await seriesStreams(imdb,parseInt(s),parseInt(e)); }
    res.json({streams});
  } catch(e) { console.error('stream error',e.response?.status,e.response?.data||e.message); res.json({streams:[]}); }
});
app.get('/',(req,res)=>res.json({ok:true,service:'OscarTV Streams',api:API}));
app.listen(PORT,()=>console.log(`OscarTV addon listening on ${PORT}; API=${API}`));
