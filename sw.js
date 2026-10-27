/* Wease service worker: keeps the app working offline.
   It only caches the app's own files, the Google Fonts and the tag-reading library.
   Music files are never fetched or cached here: they live in IndexedDB on the device. */
const VERSION='wease-v33';
const SHELL=['./','./index.html','./style.css','./app.js','./manifest.json',
  './icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
const LIB='https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js';
const CROSS=['fonts.googleapis.com','fonts.gstatic.com','cdnjs.cloudflare.com'];

self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(VERSION);
    await c.addAll(SHELL);
    try{c.put(LIB,await fetch(LIB,{mode:'no-cors'}))}catch(err){}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    for(const k of await caches.keys())if(k.startsWith('wease-')&&k!==VERSION)await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET')return;
  const u=new URL(r.url);
  if(u.origin===location.origin){
    // app files: try the network first so updates show up, fall back to the cache when offline
    // cache:'no-cache' asks the server every time, so a stale browser copy never hides an update
    e.respondWith(fetch(r,{cache:'no-cache'}).then(res=>{
      if(res.ok){const copy=res.clone();caches.open(VERSION).then(c=>c.put(r,copy))}
      return res;
    }).catch(async()=>(await caches.match(r,{ignoreSearch:true}))||
      (r.mode==='navigate'?caches.match('./index.html'):Response.error())));
  }else if(CROSS.includes(u.hostname)){
    // fonts and the tag library never change at a given URL: cache first
    e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{
      if(res.ok||res.type==='opaque'){const copy=res.clone();caches.open(VERSION).then(c=>c.put(r,copy))}
      return res;
    })));
  }
});
