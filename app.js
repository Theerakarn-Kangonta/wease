'use strict';
/* Wease: a local music player. Audio files never leave the device:
   they are kept in IndexedDB and played through blob: URLs. */

const $=id=>document.getElementById(id);
/* two players so songs can overlap at the change-over (crossfade).
   `audio` is always the one playing the current song; the other one is idle or fading out the last song. */
const players=[$('audio'),$('audio2')];
let audio=players[0];
const onAudio=(type,fn)=>players.forEach(el=>el.addEventListener(type,e=>{if(el===audio)fn(e)}));
const APP_V='v33'; // keep equal to VERSION in sw.js (shown in the Playback sheet)
const coll=new Intl.Collator('th',{numeric:true,sensitivity:'base'});
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=s=>{if(!isFinite(s))return'0:00';s=Math.floor(s);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const newId=()=>Date.now()+'-'+Math.random().toString(36).slice(2,7);

/* icon paths (24x24) */
const I={
  play:'M8 5v14l11-7z', pause:'M6 5h4v14H6zm8 0h4v14h-4z',
  more:'M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  grip:'M4 9h16v2H4zm0 4h16v2H4z',
  plAdd:'M14 10H3v2h11v-2zm0-4H3v2h11V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM3 16h7v-2H3v2z',
  del:'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  minus:'M7 11v2h10v-2H7zm5-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
  up:'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
  down:'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z',
  edit:'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  note:'M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z',
  folder:'M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z',
  lib:'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
  check:'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  plus:'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  vol:'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z',
  eq:'M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z',
  image:'M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
  share:'M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h3v2H6v11h12V10h-3V8h3a2 2 0 0 1 2 2z',
  addBox:'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H5V5h14v14zm-8-2h2v-4h4v-2h-4V7h-2v4H7v2h4z',
  arrow:'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
};
const ico=p=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${p}"/></svg>`;

/* tiny element builder: h('button',{class:'x',onclick:fn},'text') */
function h(tag,attrs={},...kids){
  const e=document.createElement(tag);
  for(const[k,v]of Object.entries(attrs)){
    if(v==null||v===false)continue;
    if(k==='html')e.innerHTML=v;
    else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);
    else if(k==='class')e.className=v;
    else e.setAttribute(k,v===true?'':v);
  }
  for(const c of kids.flat())if(c!=null&&c!==false)e.append(c);
  return e;
}
function toast(m){const t=$('toast');t.textContent=m;t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(()=>t.hidden=true,2200)}
const setFill=el=>{const p=((el.value-el.min)/(el.max-el.min)*100||0);el.style.setProperty('--p',p+'%');
  if(el.classList.contains('bip')){el.style.setProperty('--a',Math.min(p,50)+'%');el.style.setProperty('--b',Math.max(p,50)+'%')}};

/* ---------- state ---------- */
let tracks=[];               // {id,name,added,title,artist,cover,blob}
const byId=new Map();
let playlists=[];            // {id,name,ids:[trackId],created}
let view='all';              // what the list shows: 'all' or a playlist id
let queueView='all';         // which list playback is running through
let queue=[], order=[];      // track ids: queue = list order, order = actual play order (shuffled or not)
let curId=null, url=null, db=null;
const RATES=[0.5,0.75,1,1.25,1.5,1.75,2];
const prefs={shuffle:false,repeat:0,sortAll:'added',sortList:'custom',rate:1,volume:1,view:'all',lastId:'',lastView:'all',
  eqOn:false,eq:[0,0,0,0,0],eqPreset:'flat',eqProfiles:[],songEq:{},xfade:6};
const XFADE=6; // crossfade is just On/Off; when on, songs overlap by up to 6 s
const IOS=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const canVolume=(()=>{try{const a=document.createElement('audio');a.volume=.5;return Math.abs(a.volume-.5)<.01}catch(e){return false}})();
const canFolder='webkitdirectory' in document.createElement('input')&&!IOS;

function savePrefs(){try{localStorage.setItem('lm-prefs',JSON.stringify(prefs))}catch(e){}}
function loadPrefs(){
  try{const p=JSON.parse(localStorage.getItem('lm-prefs')||'{}');
    if(p&&typeof p==='object')for(const k in prefs)if(k in p&&typeof p[k]===typeof prefs[k])prefs[k]=p[k]}catch(e){}
  if(![0,1,2].includes(prefs.repeat))prefs.repeat=0;
  if(!RATES.includes(prefs.rate))prefs.rate=1;
  prefs.xfade=prefs.xfade?XFADE:0;
  prefs.volume=Math.min(1,Math.max(0,prefs.volume));
  if(!Array.isArray(prefs.eq)||prefs.eq.length!==5||prefs.eq.some(x=>typeof x!=='number'||!isFinite(x)))prefs.eq=[0,0,0,0,0];
  prefs.eq=prefs.eq.map(x=>Math.max(-12,Math.min(12,Math.round(x))));
  const okGains=g=>Array.isArray(g)&&g.length===5&&g.every(x=>typeof x==='number'&&isFinite(x));
  prefs.eqProfiles=Array.isArray(prefs.eqProfiles)?prefs.eqProfiles.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&okGains(p.gains)):[];
  if(!prefs.songEq||typeof prefs.songEq!=='object'||Array.isArray(prefs.songEq))prefs.songEq={};
}

/* ---------- storage (IndexedDB) ---------- */
function openDB(){return new Promise(res=>{try{
  const r=indexedDB.open('local-music',4);
  r.onupgradeneeded=()=>{const d=r.result;
    if(!d.objectStoreNames.contains('tracks'))d.createObjectStore('tracks',{keyPath:'id'});
    if(!d.objectStoreNames.contains('playlists'))d.createObjectStore('playlists',{keyPath:'id'});
    // user edits (title, artist, picture, thumbnail) live apart from the audio, so a song's record
    // with its audio file is written once and never rewritten (Safari can break a re-saved audio file)
    if(!d.objectStoreNames.contains('edits'))d.createObjectStore('edits',{keyPath:'id'});
    if(!d.objectStoreNames.contains('waves'))d.createObjectStore('waves',{keyPath:'id'})};   // waveform per song
  r.onsuccess=()=>{const d=r.result;d.onversionchange=()=>d.close();res(d)};
  r.onerror=r.onblocked=()=>res(null);
}catch(e){res(null)}})}
function dbAll(s){return new Promise(res=>{if(!db)return res([]);try{const q=db.transaction(s).objectStore(s).getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>res([])}catch(e){res([])}})}
function dbPut(s,v){return new Promise(res=>{if(!db)return res(false);try{const tx=db.transaction(s,'readwrite');tx.objectStore(s).put(v);tx.oncomplete=()=>res(true);tx.onerror=tx.onabort=()=>res(false)}catch(e){res(false)}})}
function dbDel(s,id){try{db&&db.transaction(s,'readwrite').objectStore(s).delete(id)}catch(e){}}
function dbClear(s){try{db&&db.transaction(s,'readwrite').objectStore(s).clear()}catch(e){}}
const savePl=p=>dbPut('playlists',p);
function dbGet(s,id){return new Promise(res=>{if(!db)return res(null);try{const q=db.transaction(s).objectStore(s).get(id);q.onsuccess=()=>res(q.result||null);q.onerror=()=>res(null)}catch(e){res(null)}})}
const EDIT_FIELDS=['title','artist','cover','thumb','lyrics'];
/* save only the editable details; never the audio */
function saveEdits(t){const e={id:t.id};for(const k of EDIT_FIELDS)e[k]=t[k]==null?null:t[k];return dbPut('edits',e)}

/* ---------- metadata ---------- */
function readTags(file){return new Promise(res=>{
  const base=file.name.replace(/\.[^.]+$/,'');
  let guess={title:base,artist:''};
  const m=base.match(/^(.+?)\s+-\s+(.+)$/); if(m)guess={artist:m[1],title:m[2]};
  if(!window.jsmediatags)return res({...guess,cover:null});
  try{jsmediatags.read(file,{onSuccess:({tags})=>{
      let cover=null;
      if(tags.picture){try{const d=tags.picture.data;let s='';for(let i=0;i<d.length;i++)s+=String.fromCharCode(d[i]);
        cover='data:'+tags.picture.format+';base64,'+btoa(s)}catch(e){}}
      let ly=tags.lyrics;if(ly&&typeof ly==='object')ly=ly.lyrics;
      res({title:String(tags.title||guess.title),artist:String(tags.artist||guess.artist),cover,lyrics:typeof ly==='string'&&ly.trim()?ly:null});
    },onError:()=>res({...guess,cover:null})})}catch(e){res({...guess,cover:null})}
})}

const AUDIO_RE=/\.(mp3|m4a|aac|wav|ogg|oga|flac|opus)$/i;
const isAudio=f=>AUDIO_RE.test(f.name)||(f.type||'').startsWith('audio/');
function addTrackObj(t){if(!t.added)t.added=parseInt(t.id,10)||0;tracks.push(t);byId.set(t.id,t)}

async function addFiles(list){
  const target=view==='all'?null:pl(view);
  const all=[...list],baseOf=n=>String(n).replace(/\.[^./]+$/,'').toLowerCase();
  const libs=all.filter(f=>LIB_RE.test(f.name));
  if(libs.length){for(const f of libs)await importLibrary(f);if(all.length===libs.length)return}
  const lrcs=new Map(all.filter(f=>/\.lrc$/i.test(f.name)).map(f=>[baseOf(f.name),f]));
  const files=all.filter(isAudio)
    .sort((a,b)=>coll.compare(a.webkitRelativePath||a.name,b.webkitRelativePath||b.name));
  if(!files.length&&lrcs.size){   // only .lrc files: attach them to songs already in the library
    let n=0;for(const t of tracks){const f=lrcs.get(baseOf(t.name));if(f){try{t.lyrics=await f.text();saveEdits(t);n++}catch(e){}}}
    updLyrBtn();renderLyrics();toast(n?'Added lyrics to '+n+(n===1?' song':' songs'):'No songs match these lyric files');return;
  }
  if(!files.length){toast('No music files found');return}
  const have=new Map(tracks.map(t=>[t.name+'|'+(t.blob&&t.blob.size),t.id]));
  const ids=[];let added=0,saved=0,skipped=0;
  toast('Adding…');
  for(const f of files){
    const key=f.name+'|'+f.size;
    if(have.has(key)){skipped++;ids.push(have.get(key));continue}
    const tag=await readTags(f);
    Object.assign(tag,await coverSet(tag.cover));
    const lf=lrcs.get(baseOf(f.name));if(lf)try{tag.lyrics=await lf.text()}catch(e){}
    const t={id:newId(),name:f.name,added:Date.now(),...tag,blob:f};
    addTrackObj(t);have.set(key,t.id);ids.push(t.id);added++;
    if(await dbPut('tracks',t))saved++;
    if(files.length>8&&added%5===0)toast('Adding… '+(added+skipped)+'/'+files.length);
  }
  if(target){for(const id of ids)if(!target.ids.includes(id))target.ids.push(id);savePl(target)}
  afterChange();
  analyzeLibrary();
  if(saved<added)toast('Some songs could not be saved. Storage may be full');
  else toast(added?'Added '+added+(added===1?' song':' songs'):'Already in your library');
  if(added&&saved===added&&navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
  if(!curId&&tracks.length){startQueue(view);if(order.length)load(order[0],false)}
}

/* ---------- library backup file (.wease) ----------
   One file with every song, its details, playlists and EQ profiles, so the whole library can be
   kept in Drive and brought back on any phone. Layout: "WEASE1" + header length (4 bytes) + JSON header
   + the audio files back to back (the header says where each one starts). Stays on the device. */
const LIB_MAGIC='WEASE1',LIB_RE=/\.wease$/i;
function exportLibrary(){
  if(!tracks.length){toast('No songs to export');return}
  let off=0;const parts=[];
  const list=tracks.filter(t=>t.blob).map(t=>{
    const w=waveMem.get(t.id);
    const r={id:t.id,name:t.name,added:t.added,title:t.title,artist:t.artist,cover:t.cover||null,thumb:t.thumb||null,
      lyrics:t.lyrics||null,type:t.blob.type||'',off,size:t.blob.size,wave:w?Array.from(w):null,bpm:waveBpm.get(t.id)||0};
    off+=t.blob.size;parts.push(t.blob);return r});
  const head=new TextEncoder().encode(JSON.stringify({app:'Wease',v:1,made:Date.now(),tracks:list,
    playlists:playlists.map(p=>({id:p.id,name:p.name,ids:p.ids,created:p.created})),
    eqProfiles:prefs.eqProfiles,songEq:prefs.songEq}));
  const len=new Uint8Array(4);new DataView(len.buffer).setUint32(0,head.length,true);
  const d=new Date(),day=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const file=new File([LIB_MAGIC,len,head,...parts],'Wease library '+day+'.wease',{type:'application/octet-stream'});
  const download=()=>{const u=URL.createObjectURL(file),a=h('a',{href:u,download:file.name});
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000)};
  // the share sheet lets the phone save straight to Files / Google Drive; otherwise download it
  if(navigator.canShare&&navigator.canShare({files:[file]}))
    navigator.share({files:[file],title:'Wease library'}).catch(e=>{if(e&&e.name!=='AbortError')download()});
  else download();
}
async function importLibrary(f){
  let head;
  try{
    const b=new Uint8Array(await f.slice(0,10).arrayBuffer());
    if(new TextDecoder().decode(b.slice(0,6))!==LIB_MAGIC)throw 0;
    const n=new DataView(b.buffer).getUint32(6,true);
    head=JSON.parse(await f.slice(10,10+n).text());head.start=10+n;
    if(!Array.isArray(head.tracks))throw 0;
  }catch(e){toast("This isn't a Wease library file");return}
  const have=new Map(tracks.map(t=>[t.name+'|'+(t.blob&&t.blob.size),t.id]));
  const idMap=new Map();let added=0,saved=0,done=0;const total=head.tracks.length;
  toast('Importing…');
  for(const r of head.tracks){
    done++;
    if(!r||typeof r.name!=='string'||!(r.size>=0))continue;
    const key=r.name+'|'+r.size;
    if(have.has(key)){idMap.set(r.id,have.get(key));continue}
    let blob;
    // copy the bytes out so the saved song doesn't depend on the backup file staying around
    try{blob=new Blob([await f.slice(head.start+r.off,head.start+r.off+r.size).arrayBuffer()],{type:r.type||''})}catch(e){continue}
    const id=typeof r.id==='string'&&!byId.has(r.id)?r.id:newId();
    const str=v=>typeof v==='string'&&v?v:null;
    const t={id,name:r.name,added:r.added||Date.now(),title:String(r.title||r.name),artist:String(r.artist||''),
      cover:str(r.cover),thumb:str(r.thumb),lyrics:str(r.lyrics),blob};
    addTrackObj(t);have.set(key,id);idMap.set(r.id,id);added++;
    if(await dbPut('tracks',t))saved++;
    if(Array.isArray(r.wave)&&r.wave.length){const p=Uint8Array.from(r.wave);waveMem.set(id,p);if(r.bpm)waveBpm.set(id,r.bpm);dbPut('waves',{id,p,bpm:r.bpm||0})}
    if(total>8&&done%5===0)toast('Importing… '+done+'/'+total);
  }
  // playlists: same playlist (or same name) gets the missing songs, others are created
  for(const q of Array.isArray(head.playlists)?head.playlists:[]){
    if(!q||typeof q.name!=='string')continue;
    const ids=(Array.isArray(q.ids)?q.ids:[]).map(i=>idMap.get(i)).filter(Boolean);
    const p=pl(q.id)||playlists.find(x=>x.name===q.name);
    if(p){for(const i of ids)if(!p.ids.includes(i))p.ids.push(i);savePl(p)}
    else{const n={id:typeof q.id==='string'?q.id:'p'+newId(),name:q.name,ids:[...new Set(ids)],created:q.created||Date.now()};playlists.push(n);savePl(n)}
  }
  for(const e of Array.isArray(head.eqProfiles)?head.eqProfiles:[])
    if(e&&typeof e.id==='string'&&typeof e.name==='string'&&Array.isArray(e.gains)&&e.gains.length===5&&e.gains.every(x=>typeof x==='number'&&isFinite(x))&&!prefs.eqProfiles.some(x=>x.id===e.id))prefs.eqProfiles.push(e);
  const keys=new Set(['flat',...Object.keys(PRESETS),...prefs.eqProfiles.map(x=>x.id)]);
  if(head.songEq&&typeof head.songEq==='object')for(const[k,v]of Object.entries(head.songEq)){
    const id=idMap.get(k);if(id&&typeof v==='string'&&keys.has(v)&&!prefs.songEq[id])prefs.songEq[id]=v}
  savePrefs();afterChange();analyzeLibrary();
  if(saved<added)toast('Some songs could not be saved. Storage may be full');
  else toast(added?'Imported '+added+(added===1?' song':' songs'):'Already in your library');
  if(added&&navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
  if(!curId&&tracks.length){startQueue(view);if(order.length)load(order[0],false)}
}

/* ---------- views, sorting, playlists ---------- */
const pl=id=>playlists.find(p=>p.id===id);
const sortKey=v=>v==='all'?'sortAll':'sortList';
const SORTS={custom:'Custom',added:'Oldest',recent:'Newest',title:'Title',artist:'Artist'};
function sortIds(ids,s){
  const a=ids.slice(),g=id=>byId.get(id);
  if(s==='title')a.sort((x,y)=>coll.compare(g(x).title,g(y).title));
  else if(s==='artist')a.sort((x,y)=>(!g(x).artist)-(!g(y).artist)||coll.compare(g(x).artist,g(y).artist)||coll.compare(g(x).title,g(y).title));
  else if(s==='added')a.sort((x,y)=>g(x).added-g(y).added);
  else if(s==='recent')a.sort((x,y)=>g(y).added-g(x).added);
  return a; // 'custom' keeps playlist order
}
function viewIds(v){
  const p=v==='all'?null:pl(v);
  const ids=p?p.ids.filter(id=>byId.has(id)):tracks.map(t=>t.id);
  return sortIds(ids,prefs[sortKey(v)]);
}
function createPlaylist(name,ids=[]){
  const p={id:'p'+newId(),name,ids:[...ids],created:Date.now()};
  playlists.push(p);savePl(p);return p;
}
function deletePlaylist(p){
  playlists=playlists.filter(x=>x!==p);dbDel('playlists',p.id);
  if(view===p.id)setView('all');
  afterChange();toast('Playlist deleted');
}
function setView(id){
  view=id;prefs.view=id;savePrefs();render();
  $('listwrap').scrollTop=0;
  const b=$('tabs').querySelector('[aria-pressed="true"]');
  if(b){const box=$('tabs');box.scrollLeft=b.offsetLeft-box.clientWidth/2+b.offsetWidth/2}
}

/* ---------- queue ---------- */
function shuffled(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function rebuildOrder(reshuffle){
  if(!prefs.shuffle){order=queue.slice();return}
  if(reshuffle||!order.length){
    order=shuffled(queue);
    const k=order.indexOf(curId);if(k>0){order.splice(k,1);order.unshift(curId)}
    return;
  }
  // keep the current shuffle, drop removed songs, slot new songs in somewhere after the current one
  const inQ=new Set(queue);order=order.filter(id=>inQ.has(id));
  const have=new Set(order),ci=order.indexOf(curId);
  for(const id of queue)if(!have.has(id)){const k=ci+1+Math.floor(Math.random()*(order.length-ci));order.splice(k,0,id)}
}
function startQueue(v){queueView=v;queue=viewIds(v);rebuildOrder(true)}
function refreshQueue(){if(queueView!=='all'&&!pl(queueView))queueView='all';queue=viewIds(queueView);rebuildOrder(false)}
function afterChange(){refreshQueue();render()}

/* ---------- list ---------- */
function renderTabs(){
  const box=$('tabs'),x=box.scrollLeft;box.replaceChildren();
  const tab=(id,name)=>h('button',{type:'button',class:'tab','aria-pressed':String(view===id),title:name,onclick:()=>setView(id)},name);
  box.append(tab('all','All'),...playlists.map(p=>tab(p.id,p.name)),
    h('button',{type:'button',class:'tab new','aria-label':'New playlist',html:ico(I.plus),onclick:newPlaylistFlow}));
  box.scrollLeft=x;
}
function render(){
  if(view!=='all'&&!pl(view))view='all';
  const p=view==='all'?null:pl(view);
  renderTabs();
  const ids=viewIds(view);
  const q=$('q').value.trim().toLowerCase();
  const canDrag=!!p&&prefs.sortList==='custom'&&!q&&ids.length>1;
  const ol=$('list'),frag=document.createDocumentFragment();
  for(const id of ids){
    const t=byId.get(id);
    if(q&&!(t.title+' '+t.artist+' '+t.name+' '+(t.lyrics||'')).toLowerCase().includes(q))continue;
    frag.append(h('li',{'data-id':id,html:
      `<button class="main" type="button"><span class="thumb">${t.cover?`<img src="${esc(t.thumb||t.cover)}" alt="" loading="lazy" decoding="async">`:ico(I.note)}<span class="eq"><i></i><i></i><i></i></span></span>`+
      `<span class="meta"><span class="lt">${esc(t.title)}</span><span class="la">${esc(t.artist||'Unknown artist')}</span></span></button>`+
      (canDrag?`<span class="grip" role="img" aria-label="Drag to reorder">${ico(I.grip)}</span>`:'')+
      `<button class="more" type="button" aria-label="Options for ${esc(t.title)}">${ico(I.more)}</button>`}));
  }
  ol.replaceChildren(frag);
  ol.classList.toggle('drag',canDrag);
  const shown=ol.children.length,searching=ids.length>0&&!shown;
  $('empty').hidden=shown>0;
  $('emptyT').hidden=!searching;$('emptyT').textContent=searching?'No songs found':'';
  $('emptyBtn').hidden=searching;
  $('player').hidden=!curId;
  markPlaying();
}
function markPlaying(state){
  const playing=typeof state==='boolean'?state:!audio.paused;
  for(const li of $('list').children){
    const on=li.dataset.id===curId;
    li.classList.toggle('on',on);li.classList.toggle('playing',on&&playing);
    const m=li.querySelector('.main');on?m.setAttribute('aria-current','true'):m.removeAttribute('aria-current');
  }
}

$('list').addEventListener('click',e=>{
  const li=e.target.closest('li');if(!li||e.target.closest('.grip'))return;
  const id=li.dataset.id;
  if(e.target.closest('.more'))return trackMenu(id);
  if(id===curId)return togglePlay();
  playFrom(id);
});
$('list').addEventListener('pointerdown',e=>{const g=e.target.closest('.grip');if(g)startDrag(e,g.closest('li'),g)});

/* drag to reorder (playlist, custom order). Only neighbours move in the DOM so pointer capture is kept. */
function startDrag(e,li,grip){
  if(e.button>0)return;
  e.preventDefault();
  try{grip.setPointerCapture(e.pointerId)}catch(_){}
  const ol=$('list'),box=$('listwrap'),r0=li.getBoundingClientRect(),grab=e.clientY-r0.top,half=r0.height/2;
  let y=e.clientY,raf=0,moved=false;
  li.classList.add('dragging');ol.classList.add('dragging');
  const place=()=>{
    li.style.transform='';
    const mid=y-grab+half;
    let p=li.previousElementSibling,n=li.nextElementSibling;
    while(p){const r=p.getBoundingClientRect();if(mid<r.top+r.height/2){ol.insertBefore(p,li.nextElementSibling);moved=true;p=li.previousElementSibling}else break}
    while(n){const r=n.getBoundingClientRect();if(mid>r.top+r.height/2){ol.insertBefore(n,li);moved=true;n=li.nextElementSibling}else break}
    li.style.transform=`translateY(${y-grab-li.getBoundingClientRect().top}px)`;
  };
  const loop=()=>{
    const b=box.getBoundingClientRect();let d=0;
    if(y>b.bottom-48)d=Math.min(14,(y-b.bottom+48)/3);else if(y<b.top+48)d=-Math.min(14,(b.top+48-y)/3);
    if(d){box.scrollTop+=d;place()}
    raf=requestAnimationFrame(loop);
  };
  const mv=ev=>{y=ev.clientY;place()};
  const up=()=>{
    cancelAnimationFrame(raf);
    grip.removeEventListener('pointermove',mv);grip.removeEventListener('pointerup',up);grip.removeEventListener('pointercancel',up);
    li.style.transform='';li.classList.remove('dragging');ol.classList.remove('dragging');
    if(!moved)return;
    const p=pl(view);
    if(p){p.ids=[...ol.children].map(x=>x.dataset.id);savePl(p)}
    afterChange();
  };
  grip.addEventListener('pointermove',mv);grip.addEventListener('pointerup',up);grip.addEventListener('pointercancel',up);
  raf=requestAnimationFrame(loop);
}

function removeTrack(id){
  const t=byId.get(id);if(!t)return;
  dbDel('tracks',id);dbDel('edits',id);dbDel('waves',id);waveMem.delete(id);tracks=tracks.filter(x=>x!==t);byId.delete(id);
  for(const p of playlists)if(p.ids.includes(id)){p.ids=p.ids.filter(x=>x!==id);savePl(p)}
  if(prefs.songEq[id]){delete prefs.songEq[id];savePrefs()}
  if(id===curId){
    const k=order.indexOf(id);
    refreshQueue();audio.pause();curId=null;
    const nxt=order[Math.min(Math.max(k,0),order.length-1)];
    nxt?load(nxt,false):resetNP();
  }else refreshQueue();
  render();
}
function clearAll(){
  dbClear('tracks');dbClear('edits');dbClear('waves');waveMem.clear();audio.pause();tracks=[];byId.clear();
  for(const p of playlists){p.ids=[];savePl(p)}
  prefs.songEq={};savePrefs();
  resetNP();afterChange();toast('All songs deleted');
}
function resetNP(){
  curId=null;
  $('npTitle').textContent=$('npArtist').textContent='';
  $('disc').innerHTML='<div class="label"></div>';audio.removeAttribute('src');
  if(url){URL.revokeObjectURL(url);url=null}
  $('cur').textContent=$('dur').textContent='0:00';wavePeaks=null;waveFor=null;drawWave();
  $('player').hidden=true;setBackdrop(null);
}

/* ---------- sheets (bottom dialogs) ---------- */
const sheet=$('sheet');
function openSheet(title,nodes,sub=''){
  $('sheetTitle').textContent=title;$('sheetSub').textContent=sub;$('sheetSub').hidden=!sub;
  $('sheetBody').replaceChildren(...nodes.filter(Boolean));
  if(!sheet.open){if(sheet.showModal)sheet.showModal();else sheet.setAttribute('open','')}
  $('sheetBody').scrollTop=0;
}
function closeSheet(){if(sheet.open){if(sheet.close)sheet.close();else sheet.removeAttribute('open')}}
$('sheetClose').onclick=closeSheet;
sheet.addEventListener('click',e=>{if(e.target===sheet)closeSheet()});
const act=(icon,label,fn,cls='',extra={})=>h('button',{type:'button',class:'act '+cls,html:ico(icon)+'<span>'+esc(label)+'</span>',onclick:fn,...extra});
const acts=items=>h('div',{class:'acts'},items);
const chips=(opts,cur,on)=>h('div',{class:'chips'},opts.map(([v,l])=>h('button',{type:'button',class:'chip','aria-pressed':String(v===cur),onclick:e=>{
  for(const c of e.currentTarget.parentNode.children)c.setAttribute('aria-pressed','false');
  e.currentTarget.setAttribute('aria-pressed','true');on(v)}},l)));
function confirmSheet(title,okLabel,onOk){
  openSheet(title,[h('div',{class:'sheet-ft'},
    h('button',{type:'button',class:'btn',onclick:closeSheet},'Cancel'),
    h('button',{type:'button',class:'btn danger',onclick:()=>{closeSheet();onOk()}},okLabel))]);
}
function nameSheet(title,init,onOk,ph='Playlist name'){
  const inp=h('input',{class:'field',type:'text',value:init,maxlength:60,placeholder:ph,'aria-label':ph,autocomplete:'off',enterkeyhint:'done'});
  const form=h('form',{class:'grp',onsubmit:e=>{e.preventDefault();const v=inp.value.trim();if(!v){inp.focus();return}closeSheet();onOk(v)}},
    inp,h('div',{class:'sheet-ft'},h('button',{type:'button',class:'btn',onclick:closeSheet},'Cancel'),h('button',{type:'submit',class:'btn primary'},'Save')));
  openSheet(title,[form]);
  setTimeout(()=>{inp.focus();inp.select()},60);
}

function openAdd(){
  const p=view==='all'?null:pl(view);
  // only one way in (e.g. iPhone): open the phone's own picker right away, it already lists Files, Google Drive, etc.
  if(!(p&&tracks.length)&&!canFolder){$('files').click();return}
  openSheet(p?p.name:'Add songs',[acts([
    p&&tracks.length&&act(I.lib,'From library',()=>pickFromLibrary(p)),
    act(I.note,'Choose files',()=>{closeSheet();$('files').click()}),
    canFolder&&act(I.folder,'Choose folder',()=>{closeSheet();$('folder').click()}),
  ])]);
}

function trackMenu(id){
  const t=byId.get(id);if(!t)return;
  const p=view==='all'?null:pl(view);
  let up=null,down=null;
  if(p&&prefs.sortList==='custom'){
    const ids=p.ids.filter(x=>byId.has(x)),i=ids.indexOf(id);
    const mv=d=>{[ids[i],ids[i+d]]=[ids[i+d],ids[i]];p.ids=ids;savePl(p);closeSheet();afterChange()};
    up=act(I.up,'Move up',()=>mv(-1),'',{disabled:i<=0});
    down=act(I.down,'Move down',()=>mv(1),'',{disabled:i>=ids.length-1});
  }
  const isPlaying=id===curId&&!audio.paused;
  openSheet(t.title,[acts([
    act(isPlaying?I.pause:I.play,isPlaying?'Pause':'Play',()=>{closeSheet();id===curId?togglePlay():playFrom(id)}),
    act(I.edit,'Edit details',()=>editSong(id)),
    act(I.plAdd,'Add to playlist',()=>playlistPicker([id])),
    soundRow(id),
    up,down,
    p&&act(I.minus,'Remove from playlist',()=>{p.ids=p.ids.filter(x=>x!==id);savePl(p);closeSheet();afterChange()}),
    act(I.del,'Delete song',()=>confirmSheet('Delete “'+t.title+'”?','Delete',()=>removeTrack(id)),'danger'),
  ])],t.artist||'Unknown artist');
}

/* edit a song's title, artist and picture */
/* centre-crop any image URL to a square JPEG data URL of at most `size` px */
function imgToSquare(src,size,q=0.85){return new Promise((res,rej)=>{
  const im=new Image();
  im.onload=()=>{try{
    const s=Math.min(im.naturalWidth,im.naturalHeight),out=Math.min(size,s),c=document.createElement('canvas');
    c.width=c.height=out;const x=c.getContext('2d');x.imageSmoothingQuality='high';
    x.drawImage(im,(im.naturalWidth-s)/2,(im.naturalHeight-s)/2,s,s,0,0,out,out);
    res(c.toDataURL('image/jpeg',q));
  }catch(e){rej(e)}};
  im.onerror=()=>rej(new Error('bad image'));
  im.src=src;
})}
async function squareImage(file,size){
  const u=URL.createObjectURL(file);
  try{return await imgToSquare(u,size)}finally{URL.revokeObjectURL(u)}
}
/* covers: player picture max 512 px, plus a tiny thumbnail for the list so scrolling stays light */
async function coverSet(src){
  if(!src)return{cover:null,thumb:null};
  try{const cover=src.length>120000?await imgToSquare(src,512):src;return{cover,thumb:await imgToSquare(cover,128,0.8)}}
  catch(e){return{cover:src,thumb:null}}
}
function editSong(id,toLyrics){
  const t=byId.get(id);if(!t)return;
  let cover=t.cover||null;
  const pick=h('input',{type:'file',accept:'image/*',class:'vh',tabindex:'-1','aria-hidden':'true'});
  const pic=h('button',{type:'button',class:'cover-edit','aria-label':'Change picture',onclick:()=>pick.click()});
  const rm=h('button',{type:'button',class:'linkbtn',onclick:()=>{cover=null;draw()}},'Remove picture');
  const draw=()=>{pic.innerHTML=cover?`<img src="${esc(cover)}" alt="">`:ico(I.image);rm.hidden=!cover};
  pick.addEventListener('change',async e=>{
    const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;
    try{cover=await squareImage(f,512);draw()}catch(_){toast("Can't use this picture")}
  });
  const ti=h('input',{class:'field',type:'text',value:t.title,maxlength:150,placeholder:'Title','aria-label':'Title',autocomplete:'off'});
  const ar=h('input',{class:'field',type:'text',value:t.artist||'',maxlength:150,placeholder:'Artist','aria-label':'Artist',autocomplete:'off'});
  const ly=h('textarea',{class:'field area',rows:7,placeholder:'Paste lyrics here. Lines with times like [01:23.45] will follow the song.','aria-label':'Lyrics'});ly.value=t.lyrics||'';
  const lyPick=h('input',{type:'file',accept:'.lrc,.txt,text/plain',class:'vh',tabindex:'-1','aria-hidden':'true'});
  lyPick.addEventListener('change',async e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;try{ly.value=await f.text()}catch(_){toast("Can't read this file")}});
  const form=h('form',{class:'grp',onsubmit:async e=>{
      e.preventDefault();
      t.title=ti.value.trim()||t.title;t.artist=ar.value.trim();t.lyrics=ly.value.trim()||null;
      if(cover!==t.cover)Object.assign(t,await coverSet(cover));
      closeSheet();render();if(id===curId){showNowPlaying(t);updLyrBtn();renderLyrics()}
      toast(await saveEdits(t)?'Saved':'Saved until you close the app');
    }},
    h('div',{class:'cover-row'},pic,h('div',{class:'cover-acts'},
      h('button',{type:'button',class:'btn',onclick:()=>pick.click()},'Choose picture'),rm)),
    pick,
    h('h4',{},'Title'),ti,
    h('h4',{},'Artist'),ar,
    h('h4',{},'Lyrics'),ly,
    h('button',{type:'button',class:'linkbtn',style:'align-self:flex-start',onclick:()=>lyPick.click()},'Import .lrc or .txt file'),lyPick,
    h('div',{class:'sheet-ft'},h('button',{type:'button',class:'btn',onclick:closeSheet},'Cancel'),h('button',{type:'submit',class:'btn primary'},'Save')));
  openSheet('Edit details',[form]);
  if(toLyrics)setTimeout(()=>{ly.scrollIntoView({block:'center'});ly.focus()},120);
  draw();
}

/* per-song sound profile */
function soundRow(id){
  const k=songProfile(id);
  const b=act(I.eq,'Sound',()=>soundPicker(id),'nav');b.append(h('span',{class:'navv'},k?profile(k).name:'Default'));
  return b;
}
function soundPicker(id){
  const t=byId.get(id);if(!t)return;
  const cur=songProfile(id)||'';
  const row=(k,name)=>{
    const b=act(I.eq,name,()=>{setSongProfile(id,k||null);closeSheet();toast(k?'“'+name+'” set for this song':'Using default EQ')},'check');
    b.append(h('span',{class:'ck',html:k===cur?ico(I.check):''}));b.setAttribute('aria-pressed',String(k===cur));
    return b;
  };
  openSheet('Sound',[acts([row('','Default'),...allProfiles().map(([k,n])=>row(k,n))])],t.title);
}

function playlistPicker(ids){
  const rows=playlists.map(p=>{
    const has=()=>ids.every(id=>p.ids.includes(id));
    const b=act(I.lib,p.name,()=>{
      if(has())p.ids=p.ids.filter(x=>!ids.includes(x));else for(const id of ids)if(!p.ids.includes(id))p.ids.push(id);
      savePl(p);mark();afterChange();
    },'check');
    const ck=h('span',{class:'ck'});b.append(ck);
    const mark=()=>{const on=has();b.setAttribute('aria-pressed',String(on));ck.innerHTML=on?ico(I.check):''};
    mark();return b;
  });
  openSheet('Add to playlist',[
    acts([...rows,act(I.plus,'New playlist',()=>nameSheet('New playlist','',name=>{createPlaylist(name,ids);afterChange();toast('Added to “'+name+'”')}))]),
    playlists.length&&h('div',{class:'sheet-ft'},h('button',{type:'button',class:'btn primary',onclick:closeSheet},'Done')),
  ]);
}

function newPlaylistFlow(){
  nameSheet('New playlist','',name=>{
    const p=createPlaylist(name);setView(p.id);
    if(tracks.length)pickFromLibrary(p);
  });
}

/* the ⋯ menu next to the tabs: sort + list actions */
function libMenu(){
  const p=view==='all'?null:pl(view),k=sortKey(view);
  const keys=p?['custom','added','recent','title','artist']:['added','recent','title','artist'];
  openSheet(p?p.name:'All songs',[
    h('section',{class:'grp'},h('h4',{},'Sort by'),chips(keys.map(x=>[x,SORTS[x]]),prefs[k],v=>{prefs[k]=v;savePrefs();afterChange()})),
    p?acts([
      act(I.play,'Play playlist',()=>{closeSheet();const ids=viewIds(view);
        if(!ids.length)return openAdd();
        playFrom(prefs.shuffle?ids[Math.floor(Math.random()*ids.length)]:ids[0])}),
      tracks.length>0&&act(I.lib,'Add from library',()=>pickFromLibrary(p)),
      act(I.edit,'Rename',()=>nameSheet('Rename playlist',p.name,n=>{p.name=n;savePl(p);render()})),
      act(I.del,'Delete playlist',()=>confirmSheet('Delete “'+p.name+'”?','Delete',()=>deletePlaylist(p)),'danger'),
    ]):acts([
      tracks.length>0&&act(I.share,'Export library',()=>{closeSheet();exportLibrary()}),
      act(I.down,'Import library',()=>{closeSheet();$('files').click()}),
      tracks.length>0&&act(I.del,'Delete all songs',()=>confirmSheet('Delete all songs?','Delete all',clearAll),'danger'),
    ]),
  ]);
}

function pickFromLibrary(p){
  const ids=sortIds(tracks.map(t=>t.id),prefs.sortAll),chosen=new Set();
  const q=h('input',{class:'field',type:'search',placeholder:'Search','aria-label':'Search songs'});
  const box=h('div',{class:'picklist'});
  const ok=h('button',{type:'button',class:'btn primary',disabled:true,onclick:()=>{
    for(const id of ids)if(chosen.has(id)&&!p.ids.includes(id))p.ids.push(id);
    savePl(p);closeSheet();afterChange();toast('Added '+chosen.size+(chosen.size===1?' song':' songs'));
  }},'Add');
  const upd=()=>{ok.disabled=!chosen.size;ok.textContent=chosen.size?'Add '+chosen.size:'Add'};
  const draw=()=>{
    const s=q.value.trim().toLowerCase();box.replaceChildren();
    for(const id of ids){
      const t=byId.get(id);if(s&&!(t.title+' '+t.artist+' '+t.name).toLowerCase().includes(s))continue;
      const inPl=p.ids.includes(id);
      box.append(h('label',{class:'pick'+(inPl?' dim':'')},
        h('input',{type:'checkbox',checked:inPl||chosen.has(id),disabled:inPl,onchange:e=>{e.target.checked?chosen.add(id):chosen.delete(id);upd()}}),
        h('span',{class:'meta'},h('span',{class:'lt'},t.title),h('span',{class:'la'},t.artist||'Unknown artist'))));
    }
    if(!box.children.length)box.append(h('p',{class:'sub2'},'No songs found'));
  };
  q.addEventListener('input',draw);draw();
  openSheet(p.name,[tracks.length>8&&q,box,
    h('div',{class:'sheet-ft'},h('button',{type:'button',class:'btn',onclick:closeSheet},'Cancel'),ok)]);
}

/* ---------- search ---------- */
function openSearch(){$('brand').hidden=$('topAct').hidden=true;$('searchBar').hidden=false;$('q').focus()}
function closeSearch(){$('q').value='';$('searchBar').hidden=true;$('brand').hidden=$('topAct').hidden=false;render()}
$('searchBtn').onclick=openSearch;
$('searchClose').onclick=closeSearch;
$('q').addEventListener('input',render);
$('q').addEventListener('keydown',e=>{if(e.key==='Escape')closeSearch()});

/* ---------- playback ---------- */
function playFrom(id){wakeAudio();queueView=view;queue=viewIds(view);curId=id;rebuildOrder(true);load(id,true)}
function load(id,play){
  const t=byId.get(id);if(!t)return;
  endMix();mixSkip=null;arrangedFor=null;
  curId=id;lastLoad=Date.now();goodPos=0;
  if(url)URL.revokeObjectURL(url);
  url=URL.createObjectURL(t.blob);audio.src=url;applyRate();applyEq();
  if(play)audio.play().catch(()=>setPlayingUI());   // start the sound first
  showNowPlaying(t);
  play?setPlayingUI(true):markPlaying();             // show "playing" right away, before iPhone confirms
  // the rest can wait a frame so the tap feels instant
  requestAnimationFrame(()=>{if(curId!==id)return;updTune();showWave(id);arrangeNext();peekWave(nextAuto());prefs.lastId=id;prefs.lastView=queueView;savePrefs()});
}
/* title, artist and picture in the player and on the lock screen */
function showNowPlaying(t){
  $('npTitle').textContent=t.title;$('npArtist').textContent=t.artist||'Unknown artist';
  $('disc').innerHTML=t.cover?`<img src="${esc(t.cover)}" alt="">`:'<div class="label"></div>';
  $('disc').classList.toggle('spin',!audio.paused);
  $('player').hidden=false;setBackdrop(t);updLyrBtn();renderLyrics();
  if('mediaSession' in navigator){try{navigator.mediaSession.metadata=new MediaMetadata({title:t.title,artist:t.artist||'',album:'Wease',artwork:t.cover?[{src:t.cover,sizes:'512x512'}]:[]})}catch(e){}}
}
function step(dir,auto){
  if(!order.length){if(!tracks.length)return;startQueue(view)}
  if(!order.length)return;
  let k=order.indexOf(curId);
  if(k<0)return load(order[0],true);
  k+=dir;
  if(k>=order.length){
    if(prefs.repeat===1)k=0;
    else{if(auto)load(order[0],false);return}   // end of list: go back to the start, paused
  }
  if(k<0)k=prefs.repeat===1?order.length-1:0;
  load(order[k],true);
}
function togglePlay(){
  if(!tracks.length){openAdd();return}
  wakeAudio();
  if(!curId){startQueue(view);return load(order[0],true)}
  if(audio.paused){setPlayingUI(true);audio.play().catch(()=>setPlayingUI())}
  else{audio.pause();setPlayingUI(false)}
}
// state: true/false to show it before the browser confirms (iPhone can take a moment), or nothing = real state
function setPlayingUI(state){
  const p=typeof state==='boolean'?state:!audio.paused;
  $('playIcon').innerHTML=`<path d="${p?I.pause:I.play}"/>`;$('play').setAttribute('aria-label',p?'Pause':'Play');
  const d=$('disc');d.classList.toggle('spin',p);
  if('mediaSession' in navigator)try{navigator.mediaSession.playbackState=p?'playing':'paused'}catch(e){}
  markPlaying(p);
}
function updPos(){try{if('mediaSession' in navigator&&navigator.mediaSession.setPositionState&&isFinite(audio.duration)&&audio.duration>0)
  navigator.mediaSession.setPositionState({duration:audio.duration,playbackRate:audio.playbackRate||1,position:Math.min(audio.currentTime,audio.duration)})}catch(e){}}

/* speed */
function applyRate(el=audio){try{el.defaultPlaybackRate=prefs.rate;el.playbackRate=prefs.rate;el.preservesPitch=true}catch(e){}}

/* equalizer + volume through Web Audio.
   The audio graph is only built once the user turns the EQ on (or moves volume on iPhone, where
   audio.volume is ignored), so plain playback keeps the simplest path. Once built it stays for the session. */
const BANDS=[{f:60,t:'lowshelf',l:'60 Hz'},{f:230,t:'peaking',l:'230 Hz'},{f:910,t:'peaking',l:'910 Hz'},{f:3600,t:'peaking',l:'3.6 kHz'},{f:14000,t:'highshelf',l:'14 kHz'}];
const PRESETS={flat:['Flat',[0,0,0,0,0]],bass:['Bass',[7,4,0,0,0]],vocal:['Vocal',[-2,-1,3,4,1]],treble:['Treble',[0,0,0,4,7]],
  rock:['Rock',[5,2,-2,3,5]],pop:['Pop',[-1,2,4,2,-1]],acoustic:['Acoustic',[3,1,1,2,3]]};
let ac=null,eqFilters=[],preGain=null,outGain=null;
const elGain=new Map();   // each player has its own gain, used for crossfades
const needGraph=()=>prefs.xfade>0||prefs.eqOn||Object.keys(prefs.songEq).length>0||(!canVolume&&prefs.volume<1);

/* EQ profiles = built-in presets + profiles the user saved. A song can have its own profile,
   which overrides the default EQ while that song plays. */
function profile(k){
  if(PRESETS[k])return{name:PRESETS[k][0],gains:PRESETS[k][1]};
  const p=prefs.eqProfiles.find(x=>x.id===k);return p?{name:p.name,gains:p.gains}:null;
}
const allProfiles=()=>[...Object.entries(PRESETS).map(([k,[n]])=>[k,n]),...prefs.eqProfiles.map(p=>[p.id,p.name])];
const songProfile=id=>{const k=id&&prefs.songEq[id];return k&&profile(k)?k:null};
function activeEq(){const k=songProfile(curId);return k?{on:true,gains:profile(k).gains,key:k}:{on:prefs.eqOn,gains:prefs.eq,key:null}}
function setSongProfile(id,k){
  if(k)prefs.songEq[id]=k;else delete prefs.songEq[id];
  savePrefs();if(k)wakeAudio();if(id===curId)applyEq();updTune();
}
function saveProfile(name,gains){const p={id:'u'+newId(),name,gains:[...gains]};prefs.eqProfiles.push(p);savePrefs();return p.id}
function deleteProfile(k){
  prefs.eqProfiles=prefs.eqProfiles.filter(p=>p.id!==k);
  for(const id in prefs.songEq)if(prefs.songEq[id]===k)delete prefs.songEq[id];
  if(prefs.eqPreset===k)prefs.eqPreset='custom';
  savePrefs();applyEq();updTune();
}
function buildGraph(){
  if(ac)return true;
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;
  const srcs=[];
  try{
    // 'playback' asks for a bigger audio buffer: music no longer skips when the screen is busy (e.g. scrolling)
    try{ac=new AC({latencyHint:'playback'})}catch(_){ac=new AC()}
    for(const el of players)srcs.push(ac.createMediaElementSource(el));
    preGain=ac.createGain();outGain=ac.createGain();
    eqFilters=BANDS.map(b=>{const f=ac.createBiquadFilter();f.type=b.t;f.frequency.value=b.f;if(b.t==='peaking')f.Q.value=1.1;return f});
    const chain=[preGain,...eqFilters,outGain,ac.destination];
    for(let i=0;i<chain.length-1;i++)chain[i].connect(chain[i+1]);
    srcs.forEach((sn,i)=>{const g=ac.createGain();sn.connect(g);g.connect(preGain);elGain.set(players[i],g)});
    ac.onstatechange=()=>{if(ac.state!=='running'&&ac.state!=='closed'&&!audio.paused)resumeSoon()};
    if(canVolume)players.forEach(el=>el.volume=1);
    applyEq();restoreVolume();
    return true;
  }catch(e){
    elGain.clear();
    if(ac)for(const sn of srcs)try{sn.connect(ac.destination)}catch(_){}   // never leave the player silent
    return srcs.length>0;
  }
}
/* call from a tap (play, next…): builds the graph if wanted and wakes it up */
function wakeAudio(){setAudioSession();if(needGraph())buildGraph();if(ac&&ac.state!=='running')ac.resume().catch(()=>{});unlockSpare()}
/* iPhone only lets a player start by itself later if it was started once from a tap: do that with a moment of silence */
let spareReady=false;
function unlockSpare(){
  if(spareReady||!prefs.xfade)return;spareReady=true;
  const el=players.find(p=>p!==audio);if(el.getAttribute('src'))return;
  const n=800,b=new DataView(new ArrayBuffer(44+n*2)),w=(o,t)=>[...t].forEach((c,i)=>b.setUint8(o+i,c.charCodeAt(0)));
  w(0,'RIFF');b.setUint32(4,36+n*2,true);w(8,'WAVEfmt ');b.setUint32(16,16,true);b.setUint16(20,1,true);b.setUint16(22,1,true);
  b.setUint32(24,8000,true);b.setUint32(28,16000,true);b.setUint16(32,2,true);b.setUint16(34,16,true);w(36,'data');b.setUint32(40,n*2,true);
  const u=URL.createObjectURL(new Blob([b.buffer],{type:'audio/wav'}));el.src=u;
  el.play().then(()=>el.pause()).catch(()=>{}).finally(()=>{if(el.getAttribute('src')===u){el.removeAttribute('src');try{el.load()}catch(e){}}URL.revokeObjectURL(u)});
}
/* iPhone may pause the audio engine for a moment when the app goes to the background or the screen locks.
   Wake it up once, a little later, instead of fighting the system in a tight loop. */
let resumeTimer=0;
function resumeSoon(n=0){
  if(resumeTimer||!ac)return;
  // a few tries, further apart each time (iOS often refuses the first one)
  resumeTimer=setTimeout(()=>{resumeTimer=0;if(ac.state==='running'||audio.paused)return;
    ac.resume().catch(()=>{}).then(()=>{if(ac.state!=='running'&&n<3)resumeSoon(n+1)})},[250,1000,2000,4000][n]);
}
document.addEventListener('visibilitychange',()=>{if(ac&&ac.state!=='running'&&!audio.paused)ac.resume().catch(()=>{})});
/* Tell Safari this page plays music (not short sound effects): it then keeps audio going in the
   background and on the lock screen, and ignores the silent switch, like a music app. */
function setAudioSession(){try{if(navigator.audioSession&&navigator.audioSession.type!=='playback')navigator.audioSession.type='playback'}catch(e){}}
function applyEq(){
  if(!ac||!eqFilters.length)return;
  const a=activeEq(),g=a.on?a.gains:[0,0,0,0,0];
  eqFilters.forEach((f,i)=>f.gain.value=g[i]);
  preGain.gain.value=Math.pow(10,-Math.max(0,...g)*0.6/20);   // leave headroom so boosts don't distort
}
function setOutVolume(v){
  if(outGain){outGain.gain.value=v;return}
  if(canVolume)try{audio.volume=v}catch(e){}
}
function restoreVolume(){setOutVolume(prefs.volume)}

function openEq(){
  const sliders=[],vals=[];
  const sw=h('button',{type:'button',class:'switch',role:'switch','aria-checked':String(prefs.eqOn),'aria-label':'Equalizer on'});
  let bands=null;
  const setOn=on=>{prefs.eqOn=on;sw.setAttribute('aria-checked',String(on));if(bands)bands.classList.toggle('off',!on);if(on){buildGraph();wakeAudio()}applyEq();updTune();savePrefs()};
  sw.onclick=()=>setOn(!prefs.eqOn);
  const sync=()=>{prefs.eq.forEach((v,i)=>{sliders[i].value=v;setFill(sliders[i]);vals[i].textContent=(v>0?'+':'')+v})};
  const pre=chips(allProfiles(),prefs.eqPreset,k=>{prefs.eqPreset=k;prefs.eq=[...profile(k).gains];sync();setOn(true);foot()});
  const rows=BANDS.map((b,i)=>{
    const r=h('input',{type:'range',class:'bip',min:-12,max:12,step:1,value:prefs.eq[i],'aria-label':b.l,
      oninput:e=>{prefs.eq[i]=+e.target.value;
        if(prefs.eqPreset!=='custom'){prefs.eqPreset='custom';for(const c of pre.children)c.setAttribute('aria-pressed','false');foot()}
        sync();if(!prefs.eqOn)setOn(true);else{applyEq();savePrefs()}}});
    const v=h('span',{class:'vv'});sliders.push(r);vals.push(v);
    return h('div',{class:'eqrow'},h('span',{class:'eqf'},b.l),r,v);
  });
  /* buttons: Delete (a saved profile is selected) · Save (sliders were moved) · Use for this song */
  const ft=h('div',{class:'sheet-ft'});
  const useForSong=()=>{
    const t=byId.get(curId);if(!t)return;
    const assign=k=>{setSongProfile(curId,k);toast('“'+profile(k).name+'” set for this song');openEq()};
    if(prefs.eqPreset==='custom')nameSheet('Save profile','',n=>{const k=saveProfile(n,prefs.eq);prefs.eqPreset=k;savePrefs();assign(k)},'Profile name');
    else assign(prefs.eqPreset);
  };
  const foot=()=>{
    const k=prefs.eqPreset,mine=prefs.eqProfiles.some(p=>p.id===k);
    ft.replaceChildren(...[
      mine&&h('button',{type:'button',class:'btn',onclick:()=>confirmSheet('Delete “'+profile(k).name+'”?','Delete',()=>{deleteProfile(k);openEq()})},'Delete'),
      k==='custom'&&h('button',{type:'button',class:'btn',onclick:()=>nameSheet('Save profile','',n=>{prefs.eqPreset=saveProfile(n,prefs.eq);savePrefs();openEq();toast('Saved “'+n+'”')},'Profile name')},'Save'),
      curId&&songProfile(curId)!==k&&h('button',{type:'button',class:'btn primary',onclick:useForSong},'Use for this song'),
    ].filter(Boolean));
  };
  const sk=songProfile(curId);
  openSheet('Equalizer',[
    sk&&h('div',{class:'songeq'},h('span',{},'This song: ',h('b',{},profile(sk).name)),
      h('button',{type:'button',class:'linkbtn',onclick:()=>{setSongProfile(curId,null);openEq()}},'Remove')),
    h('div',{class:'eqtop'},h('h4',{},sk?'Default for other songs':'On'),sw),
    pre,
    bands=h('div',{class:'grp eqbands'+(prefs.eqOn?'':' off')},rows),
    ft,
  ]);
  sync();foot();
}

/* sleep timer: minutes > 0, or -1 = stop when this song ends */
let sleepMode=0,sleepEnd=0,sleepTimer=null;
function setSleep(m){
  sleepMode=m;sleepEnd=m>0?Date.now()+m*60000:0;
  clearInterval(sleepTimer);sleepTimer=sleepEnd?setInterval(checkSleep,1000):null;
  restoreVolume();updTune();
}
function checkSleep(){
  if(!sleepEnd)return;
  const left=sleepEnd-Date.now();
  if(left<=0){audio.pause();setSleep(0);return}
  if(left<10000&&!audio.paused)setOutVolume(prefs.volume*left/10000); // gentle fade-out over the last 10 s
  updTune();
}
/* the tune button shows the sleep countdown (or speed) when something is set */
function updTune(){
  const left=sleepEnd?Math.max(0,Math.ceil((sleepEnd-Date.now())/1000)):0;
  const txt=sleepEnd?fmt(left):sleepMode===-1?'End':prefs.rate!==1?prefs.rate+'×':'';
  $('tuneTxt').textContent=txt;$('tuneTxt').hidden=!txt;
  $('tuneBtn').classList.toggle('active',!!txt||activeEq().on);
  const st=$('sleepStatus');
  if(st){st.textContent=sleepEnd?fmt(left):'';st.hidden=!sleepEnd}
}

function openPlayback(){
  const vol=h('section',{class:'grp'},h('h4',{},'Volume'),
    h('div',{class:'volrow',html:ico(I.vol)},
      h('input',{type:'range',min:0,max:100,value:Math.round(prefs.volume*100),'aria-label':'Volume',
        oninput:e=>{prefs.volume=e.target.value/100;if(!canVolume)wakeAudio();restoreVolume();setFill(e.target);$('volVal').textContent=e.target.value+'%'},onchange:savePrefs}),
      h('span',{class:'vv',id:'volVal'},Math.round(prefs.volume*100)+'%')));
  const sk=songProfile(curId),dp=profile(prefs.eqPreset);
  const eqName=sk?profile(sk).name:prefs.eqOn?(dp?dp.name:'Custom'):'Off';
  const eqBtn=act(I.eq,'Equalizer',openEq,'nav');eqBtn.append(h('span',{class:'navv'},eqName));
  const xsw=h('button',{type:'button',class:'switch',role:'switch','aria-checked':String(!!prefs.xfade),'aria-label':'Crossfade',
    onclick:()=>{prefs.xfade=prefs.xfade?0:XFADE;xsw.setAttribute('aria-checked',String(!!prefs.xfade));savePrefs();if(prefs.xfade)wakeAudio();else endMix()}});
  openSheet('Playback',[
    h('section',{class:'grp'},h('h4',{},'Sleep timer ',h('span',{id:'sleepStatus',class:'tune-txt',style:'color:var(--accent)'})),
      chips([[0,'Off'],[15,'15 min'],[30,'30 min'],[45,'45 min'],[60,'1 hr'],[90,'1.5 hr'],[-1,'End of song']],sleepMode,setSleep)),
    h('section',{class:'grp'},h('h4',{},'Speed'),
      chips(RATES.map(r=>[r,r+'×']),prefs.rate,v=>{prefs.rate=v;applyRate();updTune();savePrefs();updPos()})),
    h('div',{class:'eqtop'},h('h4',{},'Crossfade'),xsw),
    vol,
    acts([eqBtn]),
    h('button',{type:'button',class:'linkbtn',style:'align-self:center',
      onclick:()=>{toast('Updating…');setTimeout(()=>location.reload(),300)}},'Wease '+APP_V+' · Check for update'),
  ]);
  const r=$('sheetBody').querySelector('input[type=range]');if(r)setFill(r);
  updTune();
}
$('tuneBtn').onclick=openPlayback;

/* ---------- events ---------- */
onAudio('play',()=>{setPlayingUI();if(ac&&ac.state!=='running')ac.resume().catch(()=>{})});
onAudio('pause',()=>{endMix();setPlayingUI();if(sleepMode===0)restoreVolume()});
onAudio('loadedmetadata',()=>{$('dur').textContent=fmt(audio.duration);applyRate();updPos()});
onAudio('ratechange',updPos);
onAudio('seeked',updPos);
onAudio('timeupdate',()=>{
  if(!audio.paused)lastTick=Date.now();
  if(audio.currentTime>0)goodPos=audio.currentTime;
  if(!scrubbing)$('cur').textContent=fmt(audio.currentTime);
  syncLyrics();
  if(!scrubbing&&audio.duration)setWaveProgress(audio.currentTime/audio.duration);
  checkSleep();maybeMix();
});
onAudio('ended',()=>{
  if(sleepMode===-1){setSleep(0);return}
  if(prefs.repeat===2){audio.currentTime=0;audio.play().catch(()=>{});return}
  step(1,true);
});
/* if a song breaks mid-play (e.g. the browser dropped its file), reload it from storage once and carry on */
let lastTick=0,recovering=null,goodPos=0;
/* load the current song again from storage and continue at pos */
async function reloadCurrent(pos,resume){
  const id=curId,t=byId.get(id);if(!t)return false;
  const rec=await dbGet('tracks',id);
  if(curId!==id)return true;
  if(rec&&rec.blob&&rec.blob.size)t.blob=rec.blob;else return false;
  if(url)URL.revokeObjectURL(url);
  url=URL.createObjectURL(t.blob);audio.src=url;applyRate();
  audio.addEventListener('loadedmetadata',()=>{
    if(curId!==id)return;                                // user already moved to another song
    try{audio.currentTime=pos}catch(e){}
    if(resume)audio.play().catch(()=>setPlayingUI());
  },{once:true});
  return true;
}
onAudio('playing',()=>{lastTick=Date.now();if(recovering===curId)setTimeout(()=>{if(!audio.paused)recovering=null},3000)});
onAudio('error',async()=>{
  if(!curId||!audio.getAttribute('src'))return;
  const id=curId,t=byId.get(id);
  if(recovering===id||!t){toast("Can't play this file");return}
  recovering=id;
  const resume=Date.now()-lastTick<4000;
  if(!await reloadCurrent(goodPos,resume)){setPlayingUI();toast("Can't play this file. Try adding it again.")}
});
/* Watchdog. iPhone can silently stop the sound (audio engine paused by a call, Siri, a notification,
   the lock screen…) while the page still thinks it is playing: button shows pause, timer frozen.
   Every second, check the clock really moves; if it is stuck: 1) wake the audio engine,
   2) reload the song at the same spot, 3) give up honestly: show Play so one tap starts it again. */
let wdPos=-1,wdSince=0,wdTries=0;
setInterval(()=>{
  if(audio.paused||audio.ended||audio.seeking||scrubbing||!curId){wdSince=0;wdTries=0;wdPos=-1;return}
  const t=audio.currentTime;
  if(t!==wdPos){wdPos=t;wdSince=0;wdTries=0;return}
  if(!wdSince){wdSince=Date.now();return}
  if(Date.now()-wdSince<2500)return;
  wdSince=Date.now();wdTries++;
  if(wdTries===1&&ac&&ac.state!=='running'){ac.resume().catch(()=>{});return}
  if(wdTries<=2){reloadCurrent(goodPos||t,true);return}
  audio.pause();setPlayingUI(false);wdTries=0;
},1000);

/* ---------- crossfade ----------
   Near the end of a song the next one starts on the spare player and the two overlap: the old one
   fades out while the new one fades in (equal-power curves, so the loudness stays even).
   Silence at the end of a song and at the start of the next is skipped, using the saved waveform. */
const QUIET=31;   // waveform level (0-255) counted as silence: about 5% of the song's loudest part
let xf=null,mixing=null,mixSkip=null;   // xf = old player fading out; mixing = song being started
function loudEdges(id){   // where the sound really starts and ends, as fractions of the song
  const p=waveMem.get(id);if(!p)return[0,1];
  let a=0,b=p.length-1;while(a<b&&p[a]<QUIET)a++;while(b>a&&p[b]<QUIET)b--;
  return[a/p.length,(b+1)/p.length];
}
function peekWave(id){if(id&&!waveMem.has(id))dbGet('waves',id).then(r=>{if(r&&!waveMem.has(id)){waveMem.set(id,r.p||null);if(r.bpm)waveBpm.set(id,r.bpm)}})}
function nextAuto(){   // the song that will play next by itself, or null
  if(prefs.repeat===2||sleepMode===-1||!order.length)return null;
  const k=order.indexOf(curId);if(k<0)return null;
  const nx=k+1<order.length?order[k+1]:prefs.repeat===1?order[0]:null;
  return nx===curId?null:nx;
}
const FADE_IN=new Float32Array(64).map((_,i)=>Math.pow(Math.sin(i/63*Math.PI/2),2));   // slow start, smooth finish
/* When to bring in the next song. The current song always plays at full volume until its sound ends, so the
   last words are never cut. The next song starts fading in at the cue: after the last sung line (synced lyrics),
   after the last loud part (where the outro begins), and at most `xfade` seconds before the sound ends. */
function mixPlan(id,d){
  const[e0,e1]=loudEdges(id),end=Math.max(d*e1,d-15);   // skip at most 15 s of silence at the end
  let cue=end-prefs.xfade;
  const p=waveMem.get(id);
  if(p){
    const a=Math.round(e0*p.length),b=Math.round(e1*p.length),lv=[...p.slice(a,b)].sort((x,y)=>x-y);
    const ref=lv[Math.floor(lv.length*0.75)]||0;           // the song's typical "loud" level
    let i=b-1;while(i>a&&p[i]<ref*0.85)i--;                // last loud moment
    cue=Math.max(cue,(i+1)/p.length*d);
  }
  const t=byId.get(id),ly=t&&parseLyrics(t.lyrics);
  if(ly&&ly.synced){
    const L=ly.lines,last=L[L.length-1];
    if(last.t<end){
      const gaps=L.slice(1).map((l,i)=>l.t-L[i].t).filter(g=>g>0.5).sort((x,y)=>x-y);
      const len=Math.min(8,Math.max(2,gaps[Math.floor(gaps.length/2)]||4));   // how long a line usually lasts
      cue=Math.max(cue,last.t+(last.text?len:0));          // an empty last line marks where singing stops
    }
  }
  return{cue:Math.min(cue,end-1.5),end};
}
let plan=null;
function maybeMix(){
  if(!prefs.xfade||xf||mixing||audio.paused||scrubbing||!ac||ac.state!=='running'||!elGain.size||!curId||mixSkip===curId)return;
  const d=audio.duration;if(!isFinite(d)||d<20)return;
  const known=waveMem.has(curId);
  if(!plan||plan.id!==curId||plan.known!==known||plan.d!==d)plan={id:curId,known,d,...mixPlan(curId,d)};
  if(audio.currentTime<plan.cue)return;
  const nx=nextAuto(),t=nx&&byId.get(nx);if(!t||!t.blob)return;
  startMix(nx,t,plan.end);
}
function startMix(id,t,endAt){
  const old=audio,from=curId,el=players.find(p=>p!==old),gNew=elGain.get(el),gOld=elGain.get(old);
  const u=URL.createObjectURL(t.blob);mixing=id;
  let done=false;
  const fail=()=>{if(done)return;done=true;mixing=null;mixSkip=from;   // let this song end normally instead
    try{el.pause()}catch(e){}el.removeAttribute('src');try{el.load()}catch(e){}URL.revokeObjectURL(u);
    gNew.gain.cancelScheduledValues(0);gNew.gain.value=1};
  const stillOk=()=>audio===old&&curId===from&&!old.paused;
  gNew.gain.cancelScheduledValues(0);gNew.gain.value=0;
  el.addEventListener('error',fail,{once:true});
  setTimeout(()=>{if(!done){try{el.pause()}catch(e){}fail()}},5000);   // never wait forever for the next song to start
  el.addEventListener('loadedmetadata',()=>{
    if(done)return;if(!stillOk())return fail();
    try{el.currentTime=Math.min(10,loudEdges(id)[0]*el.duration)}catch(e){}   // skip up to 10 s of silent intro
    el.play().then(()=>{
      if(done)return;if(!stillOk())return fail();
      done=true;mixing=null;
      // old song: full volume until its sound ends, then a short fade over the silence; new song: gradual fade-in
      const now=ac.currentTime,left=Math.max(0.3,(endAt-old.currentTime)/(old.playbackRate||1)),F=Math.max(1.5,left);
      gNew.gain.setValueCurveAtTime(FADE_IN,now,F);
      gOld.gain.cancelScheduledValues(now);gOld.gain.setValueAtTime(1,now);gOld.gain.setValueAtTime(1,now+left);
      gOld.gain.linearRampToValueAtTime(0,now+left+0.4);
      xf={el:old,url,timer:setTimeout(endMix,(Math.max(F,left+0.4)+0.2)*1000)};
      audio=el;url=u;curId=id;lastLoad=Date.now();goodPos=0;
      $('dur').textContent=fmt(el.duration);applyEq();
      showNowPlaying(t);setPlayingUI(true);updPos();
      requestAnimationFrame(()=>{if(curId!==id)return;updTune();showWave(id);arrangeNext();peekWave(nextAuto());prefs.lastId=id;savePrefs()});
    },fail);
  },{once:true});
  el.src=u;applyRate(el);
}
/* Shuffle with crossfade on: instead of a random next song, pick one whose sound flows from this one:
   how this song ends vs. how the other starts, overall loudness and dynamics, and tempo. */
const featCache=new WeakMap();
const avg=a=>a.reduce((x,y)=>x+y,0)/(a.length||1);
function songFeat(id){
  const p=waveMem.get(id);if(!p)return null;
  let f=featCache.get(p);if(f)return f;
  const[e0,e1]=loudEdges(id),a=Math.round(e0*p.length),b=Math.max(a+1,Math.round(e1*p.length));
  const seg=[...p.slice(a,b)].map(v=>v/255),m=avg(seg),n=Math.max(1,Math.round(seg.length*0.1));
  f={mean:m,sd:Math.sqrt(avg(seg.map(v=>(v-m)*(v-m)))),intro:avg(seg.slice(0,n)),outro:avg(seg.slice(-n))};
  featCache.set(p,f);return f;
}
function flowDist(a,b,ba,bb){
  let d=2*Math.abs(a.outro-b.intro)+Math.abs(a.mean-b.mean)+Math.abs(a.sd-b.sd);
  if(ba&&bb){let r=Math.abs(Math.log2(bb/ba));r=Math.min(r,Math.abs(r-1));d+=3*r}   // half/double tempo also fits
  return d;
}
let arrangedFor=null;
function arrangeNext(){
  if(!prefs.shuffle||!prefs.xfade||prefs.repeat===2||arrangedFor===curId)return;
  const k=order.indexOf(curId),cur=songFeat(curId);if(k<0||!cur||k+1>=order.length)return;
  arrangedFor=curId;
  const bc=waveBpm.get(curId)||0;
  const rest=order.slice(k+1).map(id=>({id,f:songFeat(id)})).filter(x=>x.f)
    .map(x=>({id:x.id,d:flowDist(cur,x.f,bc,waveBpm.get(x.id)||0)})).sort((x,y)=>x.d-y.d);
  if(!rest.length)return;
  const near=rest.filter(x=>x.d<=rest[0].d+0.25);           // the best match, or one about as good, so it varies
  const pick=near[Math.floor(Math.random()*near.length)].id;
  order.splice(order.indexOf(pick),1);order.splice(k+1,0,pick);
}
/* songs that were never played have no waveform yet: work them out one at a time, only while paused */
let analyzing=false;
async function analyzeLibrary(){
  if(analyzing)return;analyzing=true;
  try{
    for(const t of tracks.slice()){
      if(waveMem.has(t.id)||!byId.has(t.id))continue;
      while(!audio.paused||!prefs.xfade)await new Promise(r=>setTimeout(r,5000));
      await getWave(t.id);
    }
  }finally{analyzing=false}
}
/* the old song has faded out (or the user tapped something): stop it, free its file, both players back to full */
function endMix(){
  if(!xf)return;
  const{el,url:u,timer}=xf;xf=null;clearTimeout(timer);
  try{el.pause()}catch(e){}el.removeAttribute('src');try{el.load()}catch(e){}URL.revokeObjectURL(u);
  for(const g of elGain.values()){g.gain.cancelScheduledValues(0);g.gain.value=1}
}

/* ---------- waveform scrubber ----------
   Each song's loudness over time (200 slices) is worked out on the device the first time it plays,
   stored in IndexedDB ('waves'), and drawn as bars. Tall bars = loud parts, short = quiet/speech, gaps = silence.
   Tap to jump, drag to scrub (a time bubble follows the finger), arrow keys move 5 s. */
const WAVE_N=200,waveMem=new Map(),waveBpm=new Map();let wavePeaks=null,waveFor=null,waveJob=null,scrubbing=false,scrubFrac=0;
const yieldNow=()=>new Promise(r=>setTimeout(r,0));
// wait ~1.5 s after the last song change, then for an idle moment
let lastLoad=0;
async function calm(){
  for(;;){const left=lastLoad+1500-Date.now();if(left<=0)break;await new Promise(r=>setTimeout(r,left))}
  await new Promise(r=>window.requestIdleCallback?requestIdleCallback(()=>r(),{timeout:2000}):setTimeout(r,50));
}
async function computePeaks(blob){
  if(!blob||blob.size>60e6)return null;                  // skip huge files (hour-long mixes)
  const OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!OAC)return null;
  const data=await blob.arrayBuffer();
  let ctx;try{ctx=new OAC(1,1,8000)}catch(e){ctx=new OAC(1,1,22050)}   // low rate = little memory
  const ab=await new Promise((res,rej)=>{const p=ctx.decodeAudioData(data,res,rej);if(p&&p.then)p.then(res,rej)});
  const ch=[];for(let c=0;c<ab.numberOfChannels;c++)ch.push(ab.getChannelData(c));
  const len=ab.length,rms=new Float32Array(WAVE_N);
  for(let b=0;b<WAVE_N;b++){
    const s0=Math.floor(len*b/WAVE_N),s1=Math.floor(len*(b+1)/WAVE_N),step=Math.max(1,Math.floor((s1-s0)/1500));
    let sum=0,n=0;for(let i=s0;i<s1;i+=step){let v=0;for(const d of ch)v+=d[i];v/=ch.length;sum+=v*v;n++}
    rms[b]=Math.sqrt(sum/(n||1));
    if(b%50===49)await yieldNow();
  }
  let mx=0;for(const v of rms)mx=Math.max(mx,v);
  const out=new Uint8Array(WAVE_N);for(let b=0;b<WAVE_N;b++)out[b]=mx?Math.round(255*Math.pow(rms[b]/mx,0.7)):0;
  await yieldNow();
  try{out.bpm=estBpm(ch,ab.sampleRate)}catch(e){out.bpm=0}
  return out;
}
/* rough tempo (beats per minute) from up to 90 s in the middle of the song: how often the sound "hits".
   0 = not sure. Used only to pick a next song that flows well. */
function estBpm(ch,rate){
  const hop=Math.max(1,Math.round(rate*0.016)),len=ch[0].length,sec=hop/rate;
  const s0=Math.max(0,Math.floor(len/2-rate*45)),n=Math.floor((Math.min(len,s0+rate*90)-s0)/hop);
  if(n<300)return 0;
  const env=new Float32Array(n);let prev=0,mean=0;
  for(let f=0;f<n;f++){
    let e=0;const a=s0+f*hop;for(let i=a;i<a+hop;i++){let v=0;for(const d of ch)v+=d[i];e+=v*v}
    e=Math.log(1e-6+e);env[f]=f?Math.max(0,e-prev):0;prev=e;mean+=env[f];
  }
  mean/=n;for(let f=0;f<n;f++)env[f]-=mean;
  let best=-Infinity,bestBpm=0,sum=0,cnt=0;
  for(let bpm=70;bpm<=180;bpm++){
    const lag=60/(bpm*sec),l0=Math.floor(lag),fr=lag-l0;let sc=0;
    for(let f=0;f+l0+1<n;f++)sc+=env[f]*(env[f+l0]*(1-fr)+env[f+l0+1]*fr);
    sc*=Math.exp(-0.5*Math.pow(Math.log2(bpm/120)/0.9,2));   // gentle preference for common tempos
    sum+=sc;cnt++;if(sc>best){best=sc;bestBpm=bpm}
  }
  return best>0&&best>1.5*Math.max(0,sum/cnt)?bestBpm:0;
}
/* one at a time; result kept in memory and in IndexedDB (null = could not read, don't retry) */
function getWave(id){
  if(waveMem.has(id))return Promise.resolve(waveMem.get(id));
  if(waveJob)return waveJob.then(()=>getWave(id));
  waveJob=(async()=>{
    const saved=await dbGet('waves',id);
    if(saved){waveMem.set(id,saved.p||null);if(saved.bpm)waveBpm.set(id,saved.bpm);return saved.p||null}
    const t=byId.get(id);if(!t)return null;
    await calm();                     // reading a whole song is heavy: let playback settle first
    if(!byId.has(id))return null;
    let p=null;try{p=await computePeaks(t.blob)}catch(e){p=null}
    const bpm=p&&p.bpm||0;if(bpm)waveBpm.set(id,bpm);
    waveMem.set(id,p);dbPut('waves',{id,p,bpm});return p;
  })().finally(()=>{waveJob=null});
  return waveJob;
}
function showWave(id){
  wavePeaks=waveMem.get(id)||null;waveFor=id;
  $('wave').classList.toggle('loading',!waveMem.has(id));drawWave();
  if(waveMem.has(id))return prefetchWave();
  getWave(id).then(p=>{if(waveFor!==id)return;wavePeaks=p;$('wave').classList.remove('loading');drawWave();arrangeNext();prefetchWave()});
}
function prefetchWave(){ // next song in line, in a quiet moment, only while paused (decoding a song is heavy on iPhone)
  const k=order.indexOf(curId),nx=order[(k+1)%order.length];
  if(nx&&!waveMem.has(nx))(window.requestIdleCallback||setTimeout)(()=>{if(audio.paused)getWave(nx)},{timeout:5000});
}
/* draw the bars twice: grey (whole song) and accent (played part, revealed with a clip) */
function drawWave(){
  const box=$('wave'),w=box.clientWidth,hh=box.querySelector('canvas').clientHeight;if(!w||!hh)return;
  const dpr=Math.min(3,window.devicePixelRatio||1),cs=getComputedStyle(document.documentElement);
  const bw=3,gap=2,n=Math.max(10,Math.floor((w+gap)/(bw+gap))),off=(w-(n*(bw+gap)-gap))/2;
  for(const [cv,color] of [[$('waveBase'),cs.getPropertyValue('--wave').trim()||'#bbb'],[$('waveTop'),cs.getPropertyValue('--accent').trim()]]){
    cv.width=Math.round(w*dpr);cv.height=Math.round(hh*dpr);
    const x=cv.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,w,hh);x.fillStyle=color;
    for(let i=0;i<n;i++){
      let v=0.14;
      if(wavePeaks){const a=Math.floor(i*WAVE_N/n),b=Math.max(a+1,Math.floor((i+1)*WAVE_N/n));v=0;for(let k=a;k<b;k++)v=Math.max(v,wavePeaks[k]);v/=255}
      const bh=Math.max(3,v*hh),y=(hh-bh)/2,bx=off+i*(bw+gap);
      if(x.roundRect){x.beginPath();x.roundRect(bx,y,bw,bh,1.5);x.fill()}else x.fillRect(bx,y,bw,bh);
    }
  }
  setWaveProgress(scrubbing?scrubFrac:(audio.duration?audio.currentTime/audio.duration:0));
}
function setWaveProgress(f){
  f=Math.min(1,Math.max(0,f||0));
  $('waveTop').style.clipPath=`inset(0 ${(100-f*100).toFixed(2)}% 0 0)`;
  const wv=$('wave');wv.setAttribute('aria-valuenow',Math.round(f*100));
  if(audio.duration)wv.setAttribute('aria-valuetext',fmt(f*audio.duration)+' of '+fmt(audio.duration));
}
(()=>{
  const wv=$('wave'),tip=$('waveTip');
  const fracAt=e=>{const r=wv.getBoundingClientRect();return Math.min(1,Math.max(0,(e.clientX-r.left)/r.width))};
  const show=f=>{
    scrubFrac=f;setWaveProgress(f);
    if(!audio.duration)return;
    const t=fmt(f*audio.duration);$('cur').textContent=t;tip.textContent=t;
    const r=wv.getBoundingClientRect(),half=tip.offsetWidth/2;
    tip.style.left=Math.min(r.width-half,Math.max(half,f*r.width))+'px';
  };
  wv.addEventListener('pointerdown',e=>{
    if(e.button>0||!audio.duration)return;
    e.preventDefault();scrubbing=true;wv.classList.add('scrub');tip.hidden=false;
    try{wv.setPointerCapture(e.pointerId)}catch(_){}
    show(fracAt(e));
  });
  wv.addEventListener('pointermove',e=>{if(scrubbing)show(fracAt(e))});
  const end=e=>{
    if(!scrubbing)return;scrubbing=false;wv.classList.remove('scrub');tip.hidden=true;
    if(e.type==='pointerup'&&audio.duration){audio.currentTime=scrubFrac*audio.duration;updPos()}
    else setWaveProgress(audio.duration?audio.currentTime/audio.duration:0);
  };
  wv.addEventListener('pointerup',end);wv.addEventListener('pointercancel',end);
  wv.addEventListener('keydown',e=>{
    if(!audio.duration)return;
    const d={ArrowRight:5,ArrowUp:5,ArrowLeft:-5,ArrowDown:-5,PageUp:30,PageDown:-30}[e.key];
    if(d!=null)audio.currentTime=Math.min(audio.duration,Math.max(0,audio.currentTime+d));
    else if(e.key==='Home')audio.currentTime=0;else if(e.key==='End')audio.currentTime=Math.max(0,audio.duration-1);else return;
    e.preventDefault();setWaveProgress(audio.currentTime/audio.duration);
  });
  if(window.ResizeObserver)new ResizeObserver(()=>drawWave()).observe(wv);
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>setTimeout(drawWave,50));
})();

$('play').onclick=togglePlay;
$('next').onclick=()=>{wakeAudio();step(1)};
$('prev').onclick=()=>{wakeAudio();audio.currentTime>3?audio.currentTime=0:step(-1)};
$('shuffle').onclick=()=>{prefs.shuffle=!prefs.shuffle;$('shuffle').setAttribute('aria-pressed',prefs.shuffle);rebuildOrder(true);arrangedFor=null;arrangeNext();savePrefs()};
$('repeat').onclick=()=>{prefs.repeat=(prefs.repeat+1)%3;updRepeat();savePrefs()};
function updRepeat(){$('repeat').setAttribute('aria-pressed',prefs.repeat>0);$('rbadge').textContent=prefs.repeat===2?'1':'';
  $('repeat').setAttribute('aria-label',['Repeat: off','Repeat all','Repeat one'][prefs.repeat])}
$('addBtn').onclick=openAdd;
$('emptyBtn').onclick=openAdd;
$('libMenu').onclick=libMenu;
$('files').addEventListener('change',e=>{addFiles(e.target.files);e.target.value=''});
$('folder').addEventListener('change',e=>{addFiles(e.target.files);e.target.value=''});

if('mediaSession' in navigator){
  const set=(a,f)=>{try{navigator.mediaSession.setActionHandler(a,f)}catch(e){}};
  set('play',()=>{wakeAudio();audio.play().catch(()=>{})});
  set('pause',()=>audio.pause());
  set('nexttrack',()=>step(1));
  set('previoustrack',()=>step(-1));
  set('seekto',d=>{if(d&&d.seekTime!=null){audio.currentTime=d.seekTime;updPos()}});
}

/* ---------- install as an app (PWA) ---------- */
const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
let installEvt=null;
function updInstall(){$('installBtn').hidden=standalone||!(installEvt||(IOS&&location.protocol==='https:'))}
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;updInstall()});
addEventListener('appinstalled',()=>{installEvt=null;$('installBtn').hidden=true});
$('installBtn').onclick=async()=>{
  if(installEvt){try{installEvt.prompt();await installEvt.userChoice}catch(e){}installEvt=null;updInstall();return}
  openSheet('Install Wease',[h('p',{class:'steps',html:ico(I.share)+'<span>Share</span>'+ico(I.arrow)+ico(I.addBox)+'<span>Add to Home Screen</span>'})]);
};
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
  // Updates: an iPhone home-screen app often resumes without reloading, so check for a new version each time
  // the app comes back to the front, and reload once the new one takes over (never in the middle of a song).
  const hadSW=!!navigator.serviceWorker.controller;let swReg=null,wantReload=false;
  const tryReload=()=>{if(wantReload&&audio.paused)location.reload()};
  addEventListener('load',()=>navigator.serviceWorker.register('sw.js',{updateViaCache:'none'})
    .then(r=>{swReg=r}).catch(()=>{}));
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadSW){wantReload=true;tryReload()}});
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible')return;
    tryReload();try{swReg&&swReg.update().catch(()=>{})}catch(e){}
  });
}

/* ---------- lyrics ----------
   Lyrics come from the user's own files or typing, never from the internet:
   built-in tags (USLT) read at import, a matching .lrc file, or the Lyrics box in Edit details.
   Timed lines like [01:23.45] (LRC) highlight and scroll with the song; tap a line to jump there. */
function parseLyrics(text){
  if(!text||!String(text).trim())return null;
  const timed=[],plain=[];let offset=0;
  for(const raw of String(text).replace(/\r/g,'').split('\n')){
    const off=raw.match(/^\s*\[offset:\s*([+-]?\d+)\s*\]/i);if(off){offset=+off[1]/1000;continue}
    const stamps=[...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
    const txt=raw.replace(/\[[^\]]*\]/g,'').trim();
    if(stamps.length){for(const m of stamps)timed.push({t:Math.max(0,+m[1]*60+parseFloat(m[2].replace(':','.'))-offset),text:txt})}
    else if(!/^\s*\[[a-z#]+:.*\]\s*$/i.test(raw))plain.push(raw.trim());   // skip [ar:..] style info lines
  }
  if(timed.length>=3){timed.sort((a,b)=>a.t-b.t);return{synced:true,lines:timed}}
  while(plain.length&&!plain[0])plain.shift();while(plain.length&&!plain[plain.length-1])plain.pop();
  return plain.length?{synced:false,lines:plain.map(text=>({text}))}:null;
}
let lyr=null,lyrIdx=-1,lyrHold=0;
const lyrOpen=()=>!$('lyrics').hidden;
function updLyrBtn(){const t=curId&&byId.get(curId);$('lyrBtn').classList.toggle('has',!!(t&&parseLyrics(t.lyrics)))}
function openLyrics(){
  const t=curId&&byId.get(curId);if(!t)return;
  if(!parseLyrics(t.lyrics)){
    openSheet('Lyrics',[h('p',{class:'sub2'},'No lyrics for this song yet.'),
      h('div',{class:'sheet-ft'},h('button',{type:'button',class:'btn primary',onclick:()=>editSong(t.id,true)},'Add lyrics'))],t.title);
    return;
  }
  document.querySelector('.app').classList.add('lyr-open');$('lyrics').hidden=false;$('lyrBtn').setAttribute('aria-pressed','true');
  renderLyrics();
}
function closeLyrics(){document.querySelector('.app').classList.remove('lyr-open');$('lyrics').hidden=true;$('lyrBtn').setAttribute('aria-pressed','false')}
function renderLyrics(){
  if(!lyrOpen())return;
  const t=curId&&byId.get(curId),body=$('lyrBody');
  lyr=t?parseLyrics(t.lyrics):null;lyrIdx=-1;body.replaceChildren();
  if(!lyr){closeLyrics();return}
  body.classList.toggle('plain',!lyr.synced);
  lyr.lines.forEach((l,i)=>body.append(h('p',{class:'lyr-line'+(l.text?'':' gap'),'data-i':i},l.text||'• • •')));
  body.scrollTop=0;syncLyrics(true);
}
function syncLyrics(force){
  if(!lyr||!lyr.synced||!lyrOpen())return;
  const now=audio.currentTime+0.2;let i=-1;
  for(let k=0;k<lyr.lines.length&&lyr.lines[k].t<=now;k++)i=k;
  if(i===lyrIdx&&!force)return;
  const body=$('lyrBody'),prev=body.querySelector('.lyr-line.on');if(prev)prev.classList.remove('on');
  lyrIdx=i;const el=i>=0?body.children[i]:null;if(el)el.classList.add('on');
  if(Date.now()>lyrHold)body.scrollTo({top:Math.max(0,(el?el.offsetTop:0)-body.clientHeight*0.32),behavior:force?'auto':'smooth'});
}
$('lyrBtn').onclick=()=>lyrOpen()?closeLyrics():openLyrics();
$('lyrClose').onclick=closeLyrics;
$('lyrBody').addEventListener('click',e=>{
  const p=e.target.closest('.lyr-line');if(!p||!lyr||!lyr.synced)return;
  const l=lyr.lines[+p.dataset.i];if(!l)return;
  lyrHold=0;audio.currentTime=l.t;if(audio.paused)togglePlay();syncLyrics(true);
});
// the user scrolls the lyrics: stop auto-scrolling for a few seconds
for(const ev of ['wheel','touchmove','pointerdown'])$('lyrBody').addEventListener(ev,()=>{lyrHold=Date.now()+4000},{passive:true});
onAudio('seeked',()=>syncLyrics(true));

/* ---------- blurred picture background ----------
   The playing song's picture, shrunk to a tiny image and blurred, fills the background.
   Two layers cross-fade between songs. Songs without a picture get the plain background. */
const bdCache=new Map();let bdFront=0,bdSrc=null;
async function setBackdrop(t){
  const src=t&&(t.thumb||t.cover)||null;
  if(src===bdSrc)return;
  bdSrc=src;
  const layers=$('backdrop').children;
  if(!src){for(const l of layers)l.classList.remove('show');return}
  let tiny=bdCache.get(src);
  if(!tiny){try{tiny=await imgToSquare(src,40,0.8)}catch(e){tiny=src}bdCache.set(src,tiny)}
  if(bdSrc!==src)return;                     // a newer song arrived while this one was being prepared
  const next=layers[1-bdFront];
  next.style.backgroundImage=`url("${tiny}")`;
  next.classList.add('show');layers[bdFront].classList.remove('show');
  bdFront=1-bdFront;
}

/* ---------- start ---------- */
(async()=>{
  setAudioSession();
  loadPrefs();try{localStorage.removeItem('lm-wish')}catch(e){}
  $('shuffle').setAttribute('aria-pressed',prefs.shuffle);updRepeat();
  applyRate();restoreVolume();updTune();updInstall();
  render();try{localStorage.removeItem('lm-moods')}catch(e){}
  db=await openDB();
  if(!db){toast("This browser can't save songs");return}
  const[ts,ps,ed,wv]=await Promise.all([dbAll('tracks'),dbAll('playlists'),dbAll('edits'),dbAll('waves')]);
  for(const w of wv){waveMem.set(w.id,w.p||null);if(w.bpm)waveBpm.set(w.id,w.bpm)}
  const edits=new Map(ed.map(e=>[e.id,e]));
  for(const t of ts){const e=edits.get(t.id);if(e)for(const k of EDIT_FIELDS)if(k in e)t[k]=e[k]}
  ts.sort((a,b)=>((a.added||parseInt(a.id,10)||0)-(b.added||parseInt(b.id,10)||0))||(a.id<b.id?-1:1)).forEach(addTrackObj);
  playlists=ps.map(p=>({...p,ids:Array.isArray(p.ids)?p.ids:[]})).sort((a,b)=>(a.created||0)-(b.created||0));
  view=prefs.view==='all'||pl(prefs.view)?prefs.view:'all';
  queueView=prefs.lastView==='all'||pl(prefs.lastView)?prefs.lastView:'all';
  queue=viewIds(queueView);
  curId=byId.has(prefs.lastId)?prefs.lastId:(queue[0]||null);
  rebuildOrder(true);
  render();
  if(curId)load(curId,false);
  makeMissingThumbs();analyzeLibrary();
})();

/* songs added before thumbnails existed: make them once, in spare moments, never while music plays */
async function makeMissingThumbs(){
  const idle=()=>new Promise(r=>window.requestIdleCallback?requestIdleCallback(()=>r(),{timeout:3000}):setTimeout(r,300));
  for(const t of tracks.slice()){
    if(!t.cover||t.thumb)continue;
    while(!audio.paused)await new Promise(r=>audio.addEventListener('pause',r,{once:true}));
    await idle();
    if(!byId.has(t.id))continue;
    const s=await coverSet(t.cover);if(!s.thumb)continue;
    Object.assign(t,s);saveEdits(t);
    const img=document.querySelector(`#list li[data-id="${CSS.escape(t.id)}"] .thumb img`);if(img)img.src=t.thumb;
  }
}

/* iPhone only shows :active (pressed) styles when a touch listener exists; passive so scrolling stays smooth */
document.addEventListener('touchstart',()=>{},{passive:true});
