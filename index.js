const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;
const API = (process.env.OSCAR_API || 'https://admin.dramaramadan.net/api').replace(/\/$/, '');

const manifest = {
  id: 'community.oscartv.streams',
  version: '0.1.0',
  name: 'OscarTV Streams',
  description: 'OscarTV stream source for Novio/Stremio',
  logo: 'https://oscartv.app/favicon.ico',
  types: ['movie','series'],
  idPrefixes: ['tt'],
  resources: [{ name:'stream', types:['movie','series'], idPrefixes:['tt'] }]
};

app.get('/manifest.json', (req,res)=>res.json(manifest));

function cleanId(id){ return decodeURIComponent(id||'').split(':')[0].trim(); }
function first(obj, keys){ for(const k of keys){ if(obj && obj[k] != null && obj[k] !== '') return obj[k]; } }
function walk(obj, out=[]){
  if(!obj) return out;
  if(Array.isArray(obj)){ for(const x of obj) walk(x,out); return out; }
  if(typeof obj !== 'object') return out;
  const u=first(obj,['streamUrl','streamURL','stream_url','url','fileUrl','file_url','videoUrl','video_url']);
  if(typeof u==='string' && /^https?:\/\//i.test(u)) out.push({url:u,obj});
  for(const v of Object.values(obj)) if(v && typeof v==='object') walk(v,out);
  return out;
}

async function get(url, params){
  try { const r=await axios.get(url,{params,timeout:12000,validateStatus:s=>s<500}); if(r.status>=200&&r.status<300) return r.data; } catch(e) {}
  return null;
}

async function lookup(imdb, type){
  // The APK exposes the API base plus event_videos/video_view; movie/series lookup
  // varies by backend version, so try the non-destructive query forms used by the app.
  const attempts=[];
  const common=[
    {imdbId:imdb},{imdb:imdb},{externalId:imdb},{query:imdb},{searchQuery:imdb}
  ];
  const roots = type==='series'
    ? ['series','shows','tv','movies']
    : ['movies','movie','films'];
  for(const root of roots) for(const p of common) attempts.push(`${API}/${root}`,p);
  for(const [url,p] of attempts){
    const data=await get(url,p);
    if(data){ const hits=walk(data); if(hits.length) return {data,hits}; }
  }
  return null;
}

app.get('/stream/:type/:id.json', async (req,res)=>{
  const type=req.params.type==='series'?'series':'movie';
  const id=cleanId(req.params.id);
  if(!/^tt\d+$/i.test(id)) return res.json({streams:[]});
  const result=await lookup(id,type);
  if(!result) return res.json({streams:[]});
  const streams=[];
  for(const h of result.hits){
    if(!streams.some(x=>x.url===h.url)) streams.push({
      name:'OscarTV',
      title:'OscarTV',
      url:h.url,
      behaviorHints:{notWebReady:false}
    });
  }
  res.json({streams});
});

app.get('/',(req,res)=>res.type('text').send('OscarTV Streams Addon'));
app.listen(PORT,()=>console.log(`OscarTV addon listening on ${PORT}; API=${API}`));
