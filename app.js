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
  grip:'M4 7h16v2H4zm0 4h16v2H4zm0 4h16v2H4z',
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
function toast(m){const t=$('toast');t.textContent=m;t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(()=>t.hidden=true,2400)}

/* ---------- state ---------- */
let tracks=[];               // {id,name,added,title,artist,cover,blob}
const byId=new Map();
let playlists=[];            // {id,name,ids:[trackId],created}
let view='all';              // what the list shows: 'all' or a playlist id
let queueView='all';         // which list playback is running through
let queue=[], order=[];      // track ids: queue = list order, order = actual play order (shuffled or not)
let curId=null, url=null, db=null;
const RATES=[0.5,0.75,1,1.25,1.5,1.75,2];
const prefs={shuffle:false,repeat:0,sortAll:'added',sortList:'custom',rate:1,volume:1,view:'all',lastId:'',lastView:'all',hideInstall:false};
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
  if(!files.length){toast('ไม่พบไฟล์เพลงที่เลือก');return}
  const have=new Map(tracks.map(t=>[t.name+'|'+(t.blob&&t.blob.size),t.id]));
  const ids=[];let added=0,saved=0,skipped=0;
  toast('กำลังอ่านข้อมูล '+files.length+' เพลง…');
  for(const f of files){
    const key=f.name+'|'+f.size;
    if(have.has(key)){skipped++;ids.push(have.get(key));continue}
    const tag=await readTags(f);
    const t={id:newId(),name:f.name,added:Date.now(),...tag,blob:f};
    addTrackObj(t);have.set(key,t.id);ids.push(t.id);added++;
    if(await dbPut('tracks',t))saved++;
    if(files.length>8&&added%5===0)toast('กำลังเพิ่ม… '+(added+skipped)+'/'+files.length);
  }
  if(target){for(const id of ids)if(!target.ids.includes(id))target.ids.push(id);savePl(target)}
  afterChange();
  let msg=added?'เพิ่มแล้ว '+added+' เพลง':'ไม่มีเพลงใหม่';
  if(skipped)msg+=' (ข้าม '+skipped+' เพลงที่มีอยู่แล้ว)';
  if(target)msg+=' ลง “'+target.name+'”';
  toast(msg);
  if(saved<added)$('saveNote').textContent='บางเพลงเก็บถาวรไม่ได้ (พื้นที่เบราว์เซอร์เต็มหรือถูกปิด) จะเล่นได้จนกว่าจะปิดหน้านี้';
  else if(added&&navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
  if(!curId&&tracks.length){startQueue(view);if(order.length)load(order[0],false)}
}

/* ---------- views, sorting, playlists ---------- */
const pl=id=>playlists.find(p=>p.id===id);
const sortKey=v=>v==='all'?'sortAll':'sortList';
const SORTS={custom:'ลำดับที่จัดเอง',added:'เก่าสุดก่อน',recent:'ใหม่สุดก่อน',title:'ชื่อเพลง',artist:'ศิลปิน'};
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
  afterChange();toast('ลบเพลย์ลิสต์แล้ว');
}
function setView(id){
  view=id;prefs.view=id;savePrefs();render();
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
  const box=$('tabs');box.replaceChildren();
  const tab=(id,name)=>h('button',{type:'button',class:'tab','aria-pressed':String(view===id),title:name,onclick:()=>setView(id)},name);
  box.append(tab('all','เพลงทั้งหมด'),...playlists.map(p=>tab(p.id,p.name)),
    h('button',{type:'button',class:'tab new',html:ico(I.plus)+'<span>เพลย์ลิสต์</span>',onclick:newPlaylistFlow}));
}
function renderSort(){
  const keys=view==='all'?['added','recent','title','artist']:['custom','added','recent','title','artist'];
  const s=$('sort'),k=sortKey(view);
  if(!keys.includes(prefs[k]))prefs[k]=keys[0];
  s.replaceChildren(...keys.map(x=>h('option',{value:x},SORTS[x])));
  s.value=prefs[k];
}
function render(){
  if(view!=='all'&&!pl(view))view='all';
  const p=view==='all'?null:pl(view);
  renderTabs();renderSort();
  const ids=viewIds(view);
  const q=$('q').value.trim().toLowerCase();
  const canDrag=!!p&&prefs.sortList==='custom'&&!q&&ids.length>1;
  const ol=$('list'),frag=document.createDocumentFragment();
  ids.forEach((id,i)=>{
    const t=byId.get(id);
    if(q&&!(t.title+' '+t.artist+' '+t.name).toLowerCase().includes(q))return;
    frag.append(h('li',{'data-id':id,'data-n':i+1,html:
      `<button class="main" type="button"><span class="n">${i+1}</span><span class="meta"><span class="lt">${esc(t.title)}</span><span class="la">${esc(t.artist||'ไม่ทราบศิลปิน')}</span></span></button>`+
      (canDrag?`<span class="grip" role="img" aria-label="ลากเพื่อย้าย">${ico(I.grip)}</span>`:'')+
      `<button class="more" type="button" aria-label="ตัวเลือกสำหรับ ${esc(t.title)}">${ico(I.more)}</button>`}));
  });
  ol.replaceChildren(frag);
  ol.classList.toggle('drag',canDrag);

  $('viewTitle').textContent=p?p.name:'เพลงทั้งหมด';
  $('count').textContent=ids.length?'· '+ids.length+' เพลง':'';
  $('plMenu').hidden=!p;
  $('tools').hidden=!ids.length;
  $('dragHint').hidden=!canDrag;
  const shown=ol.children.length;
  $('empty').hidden=shown>0;
  if(!shown){
    if(ids.length){$('emptyT').textContent='ไม่พบเพลงที่ค้นหา';$('emptyD').textContent='ลองพิมพ์คำอื่น'}
    else if(p){$('emptyT').textContent='เพลย์ลิสต์นี้ยังว่าง';$('emptyD').textContent='แตะ “เพิ่มเพลง” เพื่อเลือกจากเพลงที่มีอยู่ หรือเพิ่มไฟล์ใหม่'}
    else{$('emptyT').textContent='ยังไม่มีเพลงในรายการ';
      $('emptyD').innerHTML='แตะ “เพิ่มเพลง” แล้วเลือกได้ทีละหลายไฟล์'+(canFolder?' หรือทั้งโฟลเดอร์':'')+' (MP3, M4A, WAV, OGG, FLAC)<br>ชื่อเพลง ศิลปิน และปกอัลบั้มจะถูกอ่านจากไฟล์ให้อัตโนมัติ'}
  }
  const showClear=!p&&tracks.length>0;
  $('clearRow').hidden=!showClear;
  if(showClear&&$('confirmBox').hidden)$('clearAll').hidden=false;
  markPlaying();
}
function markPlaying(){
  for(const li of $('list').children){
    const on=li.dataset.id===curId;
    li.classList.toggle('on',on);
    li.querySelector('.n').textContent=on&&!audio.paused?'▶':li.dataset.n;
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
  const ol=$('list'),r0=li.getBoundingClientRect(),grab=e.clientY-r0.top,half=r0.height/2;
  const dockH=document.querySelector('.dock').offsetHeight;
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
    const lim=innerHeight-dockH;let d=0;
    if(y>lim-56)d=Math.min(16,(y-lim+56)/3);else if(y<56)d=-Math.min(16,(56-y)/3);
    if(d){scrollBy(0,d);place()}
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
  if(id===curId){
    const k=order.indexOf(id);
    refreshQueue();audio.pause();curId=null;
    const nxt=order[Math.min(Math.max(k,0),order.length-1)];
    nxt?load(nxt,false):resetNP();
  }else refreshQueue();
  render();
}
function resetNP(){
  curId=null;
  $('npTitle').textContent='ยังไม่ได้เลือกเพลง';$('npArtist').textContent='กด “เพิ่มเพลง” แล้วเลือกไฟล์ที่ดาวน์โหลดไว้';
  $('disc').innerHTML='<div class="label"></div>';audio.removeAttribute('src');
  if(url){URL.revokeObjectURL(url);url=null}
  $('cur').textContent=$('dur').textContent='0:00';$('pos').value=0;
}

/* ---------- sheets (bottom dialogs) ---------- */
const sheet=$('sheet');
function openSheet(title,nodes){
  $('sheetTitle').textContent=title;
  $('sheetBody').replaceChildren(...nodes.filter(Boolean));
  if(!sheet.open){if(sheet.showModal)sheet.showModal();else sheet.setAttribute('open','')}
  $('sheetBody').scrollTop=0;
}
function closeSheet(){if(sheet.open){if(sheet.close)sheet.close();else sheet.removeAttribute('open')}}
$('sheetClose').onclick=closeSheet;
sheet.addEventListener('click',e=>{if(e.target===sheet)closeSheet()});
const act=(icon,label,fn,cls='',extra={})=>h('button',{type:'button',class:'act '+cls,html:ico(icon)+'<span>'+esc(label)+'</span>',onclick:fn,...extra});
const acts=items=>h('div',{class:'acts'},items);
function confirmSheet(title,msg,okLabel,onOk){
  openSheet(title,[h('p',{},msg),h('div',{class:'sheet-ft'},
    h('button',{type:'button',class:'btn',onclick:closeSheet},'ยกเลิก'),
    h('button',{type:'button',class:'btn danger',onclick:()=>{closeSheet();onOk()}},okLabel))]);
}
function nameSheet(title,init,onOk){
  const inp=h('input',{class:'field',type:'text',value:init,maxlength:60,placeholder:'ชื่อเพลย์ลิสต์','aria-label':'ชื่อเพลย์ลิสต์',autocomplete:'off',enterkeyhint:'done'});
  const form=h('form',{class:'grp',onsubmit:e=>{e.preventDefault();const v=inp.value.trim();if(!v){inp.focus();return}closeSheet();onOk(v)}},
    inp,h('div',{class:'sheet-ft'},h('button',{type:'button',class:'btn',onclick:closeSheet},'ยกเลิก'),h('button',{type:'submit',class:'btn primary'},'บันทึก')));
  openSheet(title,[form]);
  setTimeout(()=>{inp.focus();inp.select()},60);
}

function openAdd(){
  const p=view==='all'?null:pl(view);
  if(!p&&!canFolder){$('files').click();return}
  openSheet(p?'เพิ่มเพลงลง “'+p.name+'”':'เพิ่มเพลง',[
    p&&h('p',{class:'note'},'ไฟล์ใหม่จะถูกเก็บในคลังเพลง และใส่ในเพลย์ลิสต์นี้ด้วย'),
    acts([
      p&&tracks.length&&act(I.lib,'เลือกจากเพลงที่มีอยู่แล้ว',()=>pickFromLibrary(p)),
      act(I.note,'เลือกไฟล์เพลง',()=>{closeSheet();$('files').click()}),
      canFolder&&act(I.folder,'เลือกทั้งโฟลเดอร์',()=>{closeSheet();$('folder').click()}),
    ])]);
}

function trackMenu(id){
  const t=byId.get(id);if(!t)return;
  const p=view==='all'?null:pl(view);
  let up=null,down=null;
  if(p&&prefs.sortList==='custom'){
    const ids=p.ids.filter(x=>byId.has(x)),i=ids.indexOf(id);
    const mv=d=>{[ids[i],ids[i+d]]=[ids[i+d],ids[i]];p.ids=ids;savePl(p);closeSheet();afterChange()};
    up=act(I.up,'เลื่อนขึ้น',()=>mv(-1),'',{disabled:i<=0});
    down=act(I.down,'เลื่อนลง',()=>mv(1),'',{disabled:i>=ids.length-1});
  }
  openSheet(t.title,[h('p',{class:'note'},t.artist||'ไม่ทราบศิลปิน'),acts([
    act(id===curId&&!audio.paused?I.pause:I.play,id===curId&&!audio.paused?'หยุดชั่วคราว':'เล่นเพลงนี้',()=>{closeSheet();id===curId?togglePlay():playFrom(id)}),
    act(I.plAdd,'เพิ่มลงเพลย์ลิสต์…',()=>playlistPicker([id])),
    up,down,
    p&&act(I.minus,'เอาออกจากเพลย์ลิสต์นี้',()=>{p.ids=p.ids.filter(x=>x!==id);savePl(p);closeSheet();afterChange();toast('เอาออกจาก “'+p.name+'” แล้ว')}),
    act(I.del,'ลบเพลงนี้ออกจากเครื่อง',()=>confirmSheet('ลบเพลงนี้?','“'+t.title+'” จะถูกลบออกจาก Wease และจากทุกเพลย์ลิสต์ (ไฟล์ต้นฉบับในเครื่องไม่ถูกลบ)','ลบเพลง',()=>{removeTrack(id);toast('ลบเพลงแล้ว')}),'danger'),
  ])]);
}

function playlistPicker(ids){
  const rows=playlists.map(p=>{
    const has=()=>ids.every(id=>p.ids.includes(id));
    const b=act(I.lib,p.name,()=>{
      if(has())p.ids=p.ids.filter(x=>!ids.includes(x));else for(const id of ids)if(!p.ids.includes(id))p.ids.push(id);
      savePl(p);mark();afterChange();toast(has()?'เพิ่มลง “'+p.name+'” แล้ว':'เอาออกจาก “'+p.name+'” แล้ว');
    },'check');
    const ck=h('span',{class:'ck'});b.append(ck);
    const mark=()=>{const on=has();b.setAttribute('aria-pressed',String(on));ck.innerHTML=on?ico(I.check):''};
    mark();return b;
  });
  openSheet('เพิ่มลงเพลย์ลิสต์',[
    !playlists.length&&h('p',{class:'note'},'ยังไม่มีเพลย์ลิสต์ สร้างใหม่ได้เลย'),
    acts([...rows,act(I.plus,'สร้างเพลย์ลิสต์ใหม่',()=>nameSheet('เพลย์ลิสต์ใหม่','',name=>{createPlaylist(name,ids);afterChange();toast('สร้าง “'+name+'” แล้ว')}))]),
    playlists.length&&h('div',{class:'sheet-ft'},h('button',{type:'button',class:'btn primary',onclick:closeSheet},'เสร็จ')),
  ]);
}

function newPlaylistFlow(){
  nameSheet('สร้างเพลย์ลิสต์','',name=>{
    const p=createPlaylist(name);setView(p.id);toast('สร้างเพลย์ลิสต์แล้ว');
    if(tracks.length)pickFromLibrary(p);
  });
}

function playlistMenu(){
  const p=pl(view);if(!p)return;
  openSheet(p.name,[acts([
    act(I.play,'เล่นเพลย์ลิสต์นี้',()=>{closeSheet();const ids=viewIds(view);
      if(!ids.length)return toast('เพลย์ลิสต์นี้ยังว่าง');
      playFrom(prefs.shuffle?ids[Math.floor(Math.random()*ids.length)]:ids[0])}),
    tracks.length&&act(I.lib,'เลือกเพลงจากคลังมาใส่',()=>pickFromLibrary(p)),
    act(I.edit,'เปลี่ยนชื่อ',()=>nameSheet('เปลี่ยนชื่อเพลย์ลิสต์',p.name,n=>{p.name=n;savePl(p);render();toast('เปลี่ยนชื่อแล้ว')})),
    act(I.del,'ลบเพลย์ลิสต์',()=>confirmSheet('ลบเพลย์ลิสต์?','ลบ “'+p.name+'” เท่านั้น เพลงในคลังจะยังอยู่ครบ','ลบเพลย์ลิสต์',()=>deletePlaylist(p)),'danger'),
  ])]);
}
$('plMenu').onclick=playlistMenu;

function pickFromLibrary(p){
  const ids=sortIds(tracks.map(t=>t.id),prefs.sortAll),chosen=new Set();
  const q=h('input',{class:'field',type:'search',placeholder:'ค้นหาชื่อเพลงหรือศิลปิน','aria-label':'ค้นหาเพลง'});
  const box=h('div',{class:'picklist'});
  const ok=h('button',{type:'button',class:'btn primary',disabled:true,onclick:()=>{
    for(const id of ids)if(chosen.has(id)&&!p.ids.includes(id))p.ids.push(id);
    savePl(p);closeSheet();afterChange();toast('เพิ่ม '+chosen.size+' เพลงลง “'+p.name+'” แล้ว');
  }},'เพิ่มเพลง');
  const upd=()=>{ok.disabled=!chosen.size;ok.textContent=chosen.size?'เพิ่ม '+chosen.size+' เพลง':'เพิ่มเพลง'};
  const draw=()=>{
    const s=q.value.trim().toLowerCase();box.replaceChildren();
    for(const id of ids){
      const t=byId.get(id);if(s&&!(t.title+' '+t.artist+' '+t.name).toLowerCase().includes(s))continue;
      const inPl=p.ids.includes(id);
      box.append(h('label',{class:'pick'+(inPl?' dim':'')},
        h('input',{type:'checkbox',checked:inPl||chosen.has(id),disabled:inPl,onchange:e=>{e.target.checked?chosen.add(id):chosen.delete(id);upd()}}),
        h('span',{class:'meta'},h('span',{class:'lt'},t.title),h('span',{class:'la'},inPl?'อยู่ในเพลย์ลิสต์นี้แล้ว':(t.artist||'ไม่ทราบศิลปิน')))));
    }
    if(!box.children.length)box.append(h('p',{class:'note'},'ไม่พบเพลง'));
  };
  q.addEventListener('input',draw);draw();
  openSheet('เลือกเพลงใส่ “'+p.name+'”',[tracks.length>8&&q,box,
    h('div',{class:'sheet-ft'},h('button',{type:'button',class:'btn',onclick:closeSheet},'ยกเลิก'),ok)]);
}

/* ---------- playback ---------- */
function playFrom(id){queueView=view;queue=viewIds(view);curId=id;rebuildOrder(true);load(id,true)}
function load(id,play){
  const t=byId.get(id);if(!t)return;
  curId=id;
  if(url)URL.revokeObjectURL(url);
  url=URL.createObjectURL(t.blob);audio.src=url;applyRate();
  $('npTitle').textContent=t.title;$('npArtist').textContent=t.artist||'ไม่ทราบศิลปิน';
  $('disc').innerHTML=t.cover?`<img src="${t.cover}" alt="">`:'<div class="label"></div>';
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
  if(!curId){startQueue(view);return load(order[0],true)}
  audio.paused?audio.play().catch(()=>{}):audio.pause();
}
function setPlayingUI(){
  const p=!audio.paused;
  $('playIcon').innerHTML=`<path d="${p?I.pause:I.play}"/>`;$('play').setAttribute('aria-label',p?'หยุดชั่วคราว':'เล่น');
  const d=$('disc').firstElementChild;if(d)d.classList.toggle('spin',p);
  if('mediaSession' in navigator)try{navigator.mediaSession.playbackState=p?'playing':'paused'}catch(e){}
  markPlaying();
}
function updPos(){try{if('mediaSession' in navigator&&navigator.mediaSession.setPositionState&&isFinite(audio.duration)&&audio.duration>0)
  navigator.mediaSession.setPositionState({duration:audio.duration,playbackRate:audio.playbackRate||1,position:Math.min(audio.currentTime,audio.duration)})}catch(e){}}

/* speed and volume */
function applyRate(){try{audio.defaultPlaybackRate=prefs.rate;audio.playbackRate=prefs.rate;audio.preservesPitch=true}catch(e){}}
function restoreVolume(){if(canVolume)try{audio.volume=prefs.volume}catch(e){}}
function updToolsUI(){
  const v=Math.round(prefs.volume*100);
  $('speedLabel').textContent=prefs.rate+'×';$('speedChip').classList.toggle('active',prefs.rate!==1);
  $('speedChip').setAttribute('aria-label','ความเร็ว '+prefs.rate+' เท่า');
  $('volChip').hidden=!canVolume;$('volLabel').textContent=v+'%';$('volChip').setAttribute('aria-label','ระดับเสียง '+v+'%');
}

/* sleep timer: minutes > 0, or -1 = stop when this song ends */
let sleepMode=0,sleepEnd=0,sleepTimer=null;
function setSleep(m){
  sleepMode=m;sleepEnd=m>0?Date.now()+m*60000:0;
  clearInterval(sleepTimer);sleepTimer=sleepEnd?setInterval(checkSleep,1000):null;
  restoreVolume();updSleepUI();
}
function checkSleep(){
  if(!sleepEnd)return;
  const left=sleepEnd-Date.now();
  if(left<=0){audio.pause();setSleep(0);toast('ครบเวลาที่ตั้งไว้ หยุดเล่นแล้ว');return}
  if(canVolume&&left<10000&&!audio.paused)audio.volume=prefs.volume*left/10000; // gentle fade-out over the last 10 s
  updSleepUI();
}
function updSleepUI(){
  const left=sleepEnd?Math.max(0,Math.ceil((sleepEnd-Date.now())/1000)):0;
  $('sleepLabel').textContent=sleepEnd?'ปิดใน '+fmt(left):sleepMode===-1?'ปิดเมื่อจบเพลง':'ตั้งเวลาปิด';
  $('sleepChip').classList.toggle('active',sleepMode!==0);
  const st=$('sleepStatus');
  if(st)st.textContent=sleepEnd?'จะหยุดเล่นในอีก '+fmt(left)+' นาที':sleepMode===-1?'จะหยุดเมื่อเพลงนี้จบ':'ไม่ได้ตั้งเวลา';
}

function openPlayback(){
  const chips=(opts,cur,on)=>h('div',{class:'chips'},opts.map(([v,l])=>h('button',{type:'button',class:'chip','aria-pressed':String(v===cur),onclick:e=>{
    for(const c of e.currentTarget.parentNode.children)c.setAttribute('aria-pressed','false');
    e.currentTarget.setAttribute('aria-pressed','true');on(v)}},l)));
  const vol=canVolume
    ?h('div',{class:'volrow',html:ico(I.vol)},
        h('input',{type:'range',min:0,max:100,value:Math.round(prefs.volume*100),'aria-label':'ระดับเสียง',
          oninput:e=>{prefs.volume=e.target.value/100;restoreVolume();updToolsUI();$('volVal').textContent=e.target.value+'%'},onchange:savePrefs}),
        h('span',{id:'volVal'},Math.round(prefs.volume*100)+'%'))
    :h('p',{class:'note'},'บน iPhone/iPad ปรับเสียงด้วยปุ่มข้างเครื่อง');
  openSheet('การเล่น',[
    h('section',{class:'grp'},h('h4',{},'ตั้งเวลาปิด'),h('p',{class:'note',id:'sleepStatus'}),
      chips([[0,'ปิด'],[15,'15 นาที'],[30,'30 นาที'],[45,'45 นาที'],[60,'1 ชั่วโมง'],[90,'1.5 ชั่วโมง'],[-1,'จบเพลงนี้']],sleepMode,v=>{
        setSleep(v);toast(v===0?'ยกเลิกตั้งเวลาปิดแล้ว':v===-1?'จะหยุดเมื่อเพลงนี้จบ':'จะหยุดเล่นในอีก '+v+' นาที')})),
    h('section',{class:'grp'},h('h4',{},'ความเร็ว'),
      chips(RATES.map(r=>[r,r+'×']),prefs.rate,v=>{prefs.rate=v;applyRate();updToolsUI();savePrefs();updPos()})),
    h('section',{class:'grp'},h('h4',{},'ระดับเสียง'),vol),
  ]);
  updSleepUI();
}
$('sleepChip').onclick=$('speedChip').onclick=$('volChip').onclick=openPlayback;

/* ---------- events ---------- */
audio.addEventListener('play',setPlayingUI);
audio.addEventListener('pause',()=>{setPlayingUI();if(sleepMode===0)restoreVolume()});
audio.addEventListener('loadedmetadata',()=>{$('dur').textContent=fmt(audio.duration);applyRate();updPos()});
audio.addEventListener('ratechange',updPos);
audio.addEventListener('seeked',updPos);
audio.addEventListener('timeupdate',()=>{
  $('cur').textContent=fmt(audio.currentTime);
  if(!seeking&&audio.duration)$('pos').value=audio.currentTime/audio.duration*1000;
  checkSleep();
});
audio.addEventListener('ended',()=>{
  if(sleepMode===-1){setSleep(0);toast('เพลงจบแล้ว หยุดตามที่ตั้งเวลาไว้');return}
  if(prefs.repeat===2){audio.currentTime=0;audio.play().catch(()=>{});return}
  step(1,true);
});
audio.addEventListener('error',()=>{if(curId&&audio.getAttribute('src'))toast('เล่นไฟล์นี้ไม่ได้ เบราว์เซอร์อาจไม่รองรับรูปแบบนี้')});

let seeking=false;
$('pos').addEventListener('input',()=>{seeking=true;if(audio.duration)$('cur').textContent=fmt($('pos').value/1000*audio.duration)});
$('pos').addEventListener('change',()=>{if(audio.duration)audio.currentTime=$('pos').value/1000*audio.duration;seeking=false});

$('play').onclick=togglePlay;
$('next').onclick=()=>step(1);
$('prev').onclick=()=>{audio.currentTime>3?audio.currentTime=0:step(-1)};
$('shuffle').onclick=()=>{prefs.shuffle=!prefs.shuffle;$('shuffle').setAttribute('aria-pressed',prefs.shuffle);rebuildOrder(true);toast(prefs.shuffle?'เปิดสุ่มเพลง':'ปิดสุ่มเพลง');savePrefs()};
$('repeat').onclick=()=>{prefs.repeat=(prefs.repeat+1)%3;updRepeat();toast(['ปิดเล่นซ้ำ','เล่นซ้ำทั้งรายการ','เล่นซ้ำเพลงเดียว'][prefs.repeat]);savePrefs()};
function updRepeat(){$('repeat').setAttribute('aria-pressed',prefs.repeat>0);$('rbadge').textContent=prefs.repeat===2?'1':''}
$('addBtn').onclick=openAdd;
$('files').addEventListener('change',e=>{addFiles(e.target.files);e.target.value=''});
$('folder').addEventListener('change',e=>{addFiles(e.target.files);e.target.value=''});
$('q').addEventListener('input',render);
$('sort').addEventListener('change',e=>{prefs[sortKey(view)]=e.target.value;savePrefs();afterChange()});
$('clearAll').onclick=()=>{$('clearAll').hidden=true;$('confirmBox').hidden=false};
$('noClear').onclick=()=>{$('confirmBox').hidden=true;$('clearAll').hidden=false};
$('yesClear').onclick=()=>{
  dbClear('tracks');audio.pause();tracks=[];byId.clear();
  for(const p of playlists){p.ids=[];savePl(p)}
  resetNP();$('confirmBox').hidden=true;afterChange();toast('ลบเพลงทั้งหมดแล้ว');
};

if('mediaSession' in navigator){
  const set=(a,f)=>{try{navigator.mediaSession.setActionHandler(a,f)}catch(e){}};
  set('play',()=>audio.play().catch(()=>{}));
  set('pause',()=>audio.pause());
  set('nexttrack',()=>step(1));
  set('previoustrack',()=>step(-1));
  set('seekto',d=>{if(d&&d.seekTime!=null){audio.currentTime=d.seekTime;updPos()}});
}

/* ---------- install as an app (PWA) ---------- */
const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
let installEvt=null;
function showInstall(ios){
  $('installText').textContent=ios
    ?'ติดตั้ง Wease ไว้บนหน้าจอโฮม: แตะปุ่มแชร์ ⎋ ใน Safari แล้วเลือก “เพิ่มไปยังหน้าจอโฮม”'
    :'ติดตั้ง Wease ไว้บนหน้าจอโฮม เปิดได้เหมือนแอป และใช้ได้แม้ไม่มีอินเทอร์เน็ต';
  $('installBtn').hidden=ios;$('installClose').textContent=ios?'เข้าใจแล้ว':'ไม่ใช่ตอนนี้';
  $('installBanner').hidden=false;
}
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;if(!prefs.hideInstall&&!standalone)showInstall(false)});
addEventListener('appinstalled',()=>{$('installBanner').hidden=true;installEvt=null});
$('installBtn').onclick=async()=>{
  if(!installEvt)return;$('installBanner').hidden=true;
  try{installEvt.prompt();await installEvt.userChoice}catch(e){}
  installEvt=null;
};
$('installClose').onclick=()=>{$('installBanner').hidden=true;prefs.hideInstall=true;savePrefs()};
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
  addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}

/* ---------- start ---------- */
(async()=>{
  loadPrefs();
  $('shuffle').setAttribute('aria-pressed',prefs.shuffle);updRepeat();
  applyRate();restoreVolume();updToolsUI();updSleepUI();
  if(IOS&&!standalone&&location.protocol==='https:'&&!prefs.hideInstall)showInstall(true);
  render();
  db=await openDB();
  if(!db){$('saveNote').textContent='เบราว์เซอร์นี้ไม่อนุญาตให้เก็บเพลงไว้ ต้องเพิ่มเพลงใหม่ทุกครั้งที่เปิดหน้า';return}
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
