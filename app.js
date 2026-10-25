'use strict';
/* Wease: a local music player. Audio files never leave the device:
   they are kept in IndexedDB and played through blob: URLs. */

const $=id=>document.getElementById(id);
const audio=$('audio');
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
  eqOn:false,eq:[0,0,0,0,0],eqPreset:'flat',eqProfiles:[],songEq:{}};
const IOS=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const canVolume=(()=>{try{const a=document.createElement('audio');a.volume=.5;return Math.abs(a.volume-.5)<.01}catch(e){return false}})();
const canFolder='webkitdirectory' in document.createElement('input')&&!IOS;

function savePrefs(){try{localStorage.setItem('lm-prefs',JSON.stringify(prefs))}catch(e){}}
function loadPrefs(){
  try{const p=JSON.parse(localStorage.getItem('lm-prefs')||'{}');
    if(p&&typeof p==='object')for(const k in prefs)if(k in p&&typeof p[k]===typeof prefs[k])prefs[k]=p[k]}catch(e){}
  if(![0,1,2].includes(prefs.repeat))prefs.repeat=0;
  if(!RATES.includes(prefs.rate))prefs.rate=1;
  prefs.volume=Math.min(1,Math.max(0,prefs.volume));
  if(!Array.isArray(prefs.eq)||prefs.eq.length!==5||prefs.eq.some(x=>typeof x!=='number'||!isFinite(x)))prefs.eq=[0,0,0,0,0];
  prefs.eq=prefs.eq.map(x=>Math.max(-12,Math.min(12,Math.round(x))));
  const okGains=g=>Array.isArray(g)&&g.length===5&&g.every(x=>typeof x==='number'&&isFinite(x));
  prefs.eqProfiles=Array.isArray(prefs.eqProfiles)?prefs.eqProfiles.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&okGains(p.gains)):[];
  if(!prefs.songEq||typeof prefs.songEq!=='object'||Array.isArray(prefs.songEq))prefs.songEq={};
}

/* ---------- storage (IndexedDB) ---------- */
function openDB(){return new Promise(res=>{try{
  const r=indexedDB.open('local-music',2);
  r.onupgradeneeded=()=>{const d=r.result;
    if(!d.objectStoreNames.contains('tracks'))d.createObjectStore('tracks',{keyPath:'id'});
    if(!d.objectStoreNames.contains('playlists'))d.createObjectStore('playlists',{keyPath:'id'})};
  r.onsuccess=()=>{const d=r.result;d.onversionchange=()=>d.close();res(d)};
  r.onerror=r.onblocked=()=>res(null);
}catch(e){res(null)}})}
function dbAll(s){return new Promise(res=>{if(!db)return res([]);try{const q=db.transaction(s).objectStore(s).getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>res([])}catch(e){res([])}})}
function dbPut(s,v){return new Promise(res=>{if(!db)return res(false);try{const tx=db.transaction(s,'readwrite');tx.objectStore(s).put(v);tx.oncomplete=()=>res(true);tx.onerror=tx.onabort=()=>res(false)}catch(e){res(false)}})}
function dbDel(s,id){try{db&&db.transaction(s,'readwrite').objectStore(s).delete(id)}catch(e){}}
function dbClear(s){try{db&&db.transaction(s,'readwrite').objectStore(s).clear()}catch(e){}}
const savePl=p=>dbPut('playlists',p);

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
      res({title:String(tags.title||guess.title),artist:String(tags.artist||guess.artist),cover});
    },onError:()=>res({...guess,cover:null})})}catch(e){res({...guess,cover:null})}
})}

const AUDIO_RE=/\.(mp3|m4a|aac|wav|ogg|oga|flac|opus)$/i;
const isAudio=f=>AUDIO_RE.test(f.name)||(f.type||'').startsWith('audio/');
function addTrackObj(t){if(!t.added)t.added=parseInt(t.id,10)||0;tracks.push(t);byId.set(t.id,t)}

async function addFiles(list){
  const target=view==='all'?null:pl(view);
  const files=[...list].filter(isAudio)
    .sort((a,b)=>coll.compare(a.webkitRelativePath||a.name,b.webkitRelativePath||b.name));
  if(!files.length){toast('No music files found');return}
  const have=new Map(tracks.map(t=>[t.name+'|'+(t.blob&&t.blob.size),t.id]));
  const ids=[];let added=0,saved=0,skipped=0;
  toast('Adding…');
  for(const f of files){
    const key=f.name+'|'+f.size;
    if(have.has(key)){skipped++;ids.push(have.get(key));continue}
    const tag=await readTags(f);
    const t={id:newId(),name:f.name,added:Date.now(),...tag,blob:f};
    addTrackObj(t);have.set(key,t.id);ids.push(t.id);added++;
    if(await dbPut('tracks',t))saved++;
    if(files.length>8&&added%5===0)toast('Adding… '+(added+skipped)+'/'+files.length);
  }
  if(target){for(const id of ids)if(!target.ids.includes(id))target.ids.push(id);savePl(target)}
  afterChange();
  if(saved<added)toast('Some songs could not be saved. Storage may be full');
  else toast(added?'Added '+added+(added===1?' song':' songs'):'Already in your library');
  if(added&&saved===added&&navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
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
    if(q&&!(t.title+' '+t.artist+' '+t.name).toLowerCase().includes(q))continue;
    frag.append(h('li',{'data-id':id,html:
      `<button class="main" type="button"><span class="thumb">${t.cover?`<img src="${esc(t.cover)}" alt="">`:ico(I.note)}<span class="eq"><i></i><i></i><i></i></span></span>`+
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
function markPlaying(){
  const playing=!audio.paused;
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
  dbDel('tracks',id);tracks=tracks.filter(x=>x!==t);byId.delete(id);
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
  dbClear('tracks');audio.pause();tracks=[];byId.clear();
  for(const p of playlists){p.ids=[];savePl(p)}
  prefs.songEq={};savePrefs();
  resetNP();afterChange();toast('All songs deleted');
}
function resetNP(){
  curId=null;
  $('npTitle').textContent=$('npArtist').textContent='';
  $('disc').innerHTML='<div class="label"></div>';audio.removeAttribute('src');
  if(url){URL.revokeObjectURL(url);url=null}
  $('cur').textContent=$('dur').textContent='0:00';$('pos').value=0;setFill($('pos'));
  $('player').hidden=true;
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
    act(I.plAdd,'Add to playlist',()=>playlistPicker([id])),
    soundRow(id),
    up,down,
    p&&act(I.minus,'Remove from playlist',()=>{p.ids=p.ids.filter(x=>x!==id);savePl(p);closeSheet();afterChange()}),
    act(I.del,'Delete song',()=>confirmSheet('Delete “'+t.title+'”?','Delete',()=>removeTrack(id)),'danger'),
  ])],t.artist||'Unknown artist');
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
      tracks.length&&act(I.lib,'Add from library',()=>pickFromLibrary(p)),
      act(I.edit,'Rename',()=>nameSheet('Rename playlist',p.name,n=>{p.name=n;savePl(p);render()})),
      act(I.del,'Delete playlist',()=>confirmSheet('Delete “'+p.name+'”?','Delete',()=>deletePlaylist(p)),'danger'),
    ]):tracks.length?acts([
      act(I.del,'Delete all songs',()=>confirmSheet('Delete all songs?','Delete all',clearAll),'danger'),
    ]):null,
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
  curId=id;
  if(url)URL.revokeObjectURL(url);
  url=URL.createObjectURL(t.blob);audio.src=url;applyRate();applyEq();updTune();
  $('npTitle').textContent=t.title;$('npArtist').textContent=t.artist||'Unknown artist';
  $('disc').innerHTML=t.cover?`<img src="${esc(t.cover)}" alt="">`:'<div class="label"></div>';
  $('player').hidden=false;
  if('mediaSession' in navigator){try{navigator.mediaSession.metadata=new MediaMetadata({title:t.title,artist:t.artist||'',album:'Wease',artwork:t.cover?[{src:t.cover,sizes:'512x512'}]:[]})}catch(e){}}
  prefs.lastId=id;prefs.lastView=queueView;savePrefs();
  if(play)audio.play().catch(()=>{});
  markPlaying();
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
  audio.paused?audio.play().catch(()=>{}):audio.pause();
}
function setPlayingUI(){
  const p=!audio.paused;
  $('playIcon').innerHTML=`<path d="${p?I.pause:I.play}"/>`;$('play').setAttribute('aria-label',p?'Pause':'Play');
  const d=$('disc');d.classList.toggle('spin',p);
  if('mediaSession' in navigator)try{navigator.mediaSession.playbackState=p?'playing':'paused'}catch(e){}
  markPlaying();
}
function updPos(){try{if('mediaSession' in navigator&&navigator.mediaSession.setPositionState&&isFinite(audio.duration)&&audio.duration>0)
  navigator.mediaSession.setPositionState({duration:audio.duration,playbackRate:audio.playbackRate||1,position:Math.min(audio.currentTime,audio.duration)})}catch(e){}}

/* speed */
function applyRate(){try{audio.defaultPlaybackRate=prefs.rate;audio.playbackRate=prefs.rate;audio.preservesPitch=true}catch(e){}}

/* equalizer + volume through Web Audio.
   The audio graph is only built once the user turns the EQ on (or moves volume on iPhone, where
   audio.volume is ignored), so plain playback keeps the simplest path. Once built it stays for the session. */
const BANDS=[{f:60,t:'lowshelf',l:'60 Hz'},{f:230,t:'peaking',l:'230 Hz'},{f:910,t:'peaking',l:'910 Hz'},{f:3600,t:'peaking',l:'3.6 kHz'},{f:14000,t:'highshelf',l:'14 kHz'}];
const PRESETS={flat:['Flat',[0,0,0,0,0]],bass:['Bass',[7,4,0,0,0]],vocal:['Vocal',[-2,-1,3,4,1]],treble:['Treble',[0,0,0,4,7]],
  rock:['Rock',[5,2,-2,3,5]],pop:['Pop',[-1,2,4,2,-1]],acoustic:['Acoustic',[3,1,1,2,3]]};
let ac=null,eqFilters=[],preGain=null,outGain=null;
const needGraph=()=>prefs.eqOn||Object.keys(prefs.songEq).length>0||(!canVolume&&prefs.volume<1);

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
  let src=null;
  try{
    ac=new AC();src=ac.createMediaElementSource(audio);
    preGain=ac.createGain();outGain=ac.createGain();
    eqFilters=BANDS.map(b=>{const f=ac.createBiquadFilter();f.type=b.t;f.frequency.value=b.f;if(b.t==='peaking')f.Q.value=1.1;return f});
    const chain=[preGain,...eqFilters,outGain,ac.destination];
    src.connect(chain[0]);for(let i=0;i<chain.length-1;i++)chain[i].connect(chain[i+1]);
    ac.onstatechange=()=>{if(ac.state!=='running'&&!audio.paused)ac.resume().catch(()=>{})};
    if(canVolume)audio.volume=1;
    applyEq();restoreVolume();
    return true;
  }catch(e){
    if(src&&ac)try{src.connect(ac.destination)}catch(_){}   // never leave the player silent
    return !!src;
  }
}
/* call from a tap (play, next…): builds the graph if wanted and wakes it up */
function wakeAudio(){if(needGraph())buildGraph();if(ac&&ac.state!=='running')ac.resume().catch(()=>{})}
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
  openSheet('Playback',[
    h('section',{class:'grp'},h('h4',{},'Sleep timer ',h('span',{id:'sleepStatus',class:'tune-txt',style:'color:var(--accent)'})),
      chips([[0,'Off'],[15,'15 min'],[30,'30 min'],[45,'45 min'],[60,'1 hr'],[90,'1.5 hr'],[-1,'End of song']],sleepMode,setSleep)),
    h('section',{class:'grp'},h('h4',{},'Speed'),
      chips(RATES.map(r=>[r,r+'×']),prefs.rate,v=>{prefs.rate=v;applyRate();updTune();savePrefs();updPos()})),
    vol,
    acts([eqBtn]),
  ]);
  const r=$('sheetBody').querySelector('input[type=range]');if(r)setFill(r);
  updTune();
}
$('tuneBtn').onclick=openPlayback;

/* ---------- events ---------- */
audio.addEventListener('play',()=>{setPlayingUI();if(ac&&ac.state!=='running')ac.resume().catch(()=>{})});
audio.addEventListener('pause',()=>{setPlayingUI();if(sleepMode===0)restoreVolume()});
audio.addEventListener('loadedmetadata',()=>{$('dur').textContent=fmt(audio.duration);applyRate();updPos()});
audio.addEventListener('ratechange',updPos);
audio.addEventListener('seeked',updPos);
audio.addEventListener('timeupdate',()=>{
  $('cur').textContent=fmt(audio.currentTime);
  if(!seeking&&audio.duration){$('pos').value=audio.currentTime/audio.duration*1000;setFill($('pos'))}
  checkSleep();
});
audio.addEventListener('ended',()=>{
  if(sleepMode===-1){setSleep(0);return}
  if(prefs.repeat===2){audio.currentTime=0;audio.play().catch(()=>{});return}
  step(1,true);
});
audio.addEventListener('error',()=>{if(curId&&audio.getAttribute('src'))toast("Can't play this file")});

let seeking=false;
$('pos').addEventListener('input',()=>{seeking=true;setFill($('pos'));if(audio.duration)$('cur').textContent=fmt($('pos').value/1000*audio.duration)});
$('pos').addEventListener('change',()=>{if(audio.duration)audio.currentTime=$('pos').value/1000*audio.duration;seeking=false});

$('play').onclick=togglePlay;
$('next').onclick=()=>{wakeAudio();step(1)};
$('prev').onclick=()=>{wakeAudio();audio.currentTime>3?audio.currentTime=0:step(-1)};
$('shuffle').onclick=()=>{prefs.shuffle=!prefs.shuffle;$('shuffle').setAttribute('aria-pressed',prefs.shuffle);rebuildOrder(true);savePrefs()};
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
  addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}

/* ---------- start ---------- */
(async()=>{
  loadPrefs();
  $('shuffle').setAttribute('aria-pressed',prefs.shuffle);updRepeat();
  applyRate();restoreVolume();updTune();updInstall();
  render();
  db=await openDB();
  if(!db){toast("This browser can't save songs");return}
  const[ts,ps]=await Promise.all([dbAll('tracks'),dbAll('playlists')]);
  ts.sort((a,b)=>((a.added||parseInt(a.id,10)||0)-(b.added||parseInt(b.id,10)||0))||(a.id<b.id?-1:1)).forEach(addTrackObj);
  playlists=ps.map(p=>({...p,ids:Array.isArray(p.ids)?p.ids:[]})).sort((a,b)=>(a.created||0)-(b.created||0));
  view=prefs.view==='all'||pl(prefs.view)?prefs.view:'all';
  queueView=prefs.lastView==='all'||pl(prefs.lastView)?prefs.lastView:'all';
  queue=viewIds(queueView);
  curId=byId.has(prefs.lastId)?prefs.lastId:(queue[0]||null);
  rebuildOrder(true);
  render();
  if(curId)load(curId,false);
})();
