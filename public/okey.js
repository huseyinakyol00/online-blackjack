
const socket=io();
let myId=null,state=null,previousState=null;
let selected=new Set(),targetMeld=null,dragId=null;
const $=id=>document.getElementById(id);
const name=sessionStorage.getItem("playerName")||"Oyuncu";
const room=sessionStorage.getItem("roomCode")||"";
let muted=localStorage.getItem("okeyMuted")==="1";
let audioCtx=null;

function ensureAudio(){
  if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==="suspended")audioCtx.resume();
}
function tone(freq,d=.08,type="sine",gain=.03,delay=0){
  if(muted)return;ensureAudio();
  const o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.type=type;o.frequency.value=freq;
  g.gain.setValueAtTime(.001,audioCtx.currentTime+delay);
  g.gain.exponentialRampToValueAtTime(gain,audioCtx.currentTime+delay+.01);
  g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+delay+d);
  o.connect(g).connect(audioCtx.destination);o.start(audioCtx.currentTime+delay);o.stop(audioCtx.currentTime+delay+d+.03);
}
function soundDraw(){tone(460,.06,"triangle");tone(690,.05,"triangle",.02,.05)}
function soundDiscard(){tone(310,.07,"triangle");tone(210,.08,"triangle",.02,.06)}
function soundOpen(){[440,554,659].forEach((f,i)=>tone(f,.12,"sine",.035,i*.07))}
function soundTurn(){tone(620,.07,"sine");tone(820,.1,"sine",.025,.08)}
function soundWin(){[523,659,784,1047,1318].forEach((f,i)=>tone(f,.14,"sine",.04,i*.07))}
function updateSound(){$("soundToggle").textContent=muted?"🔇 Ses Kapalı":"🔊 Ses Açık"}
$("soundToggle").onclick=()=>{ensureAudio();muted=!muted;localStorage.setItem("okeyMuted",muted?"1":"0");updateSound()};updateSound();

function toast(t){
 $("toast").textContent=t;$("toast").classList.remove("hidden");
 clearTimeout(window.__toast);window.__toast=setTimeout(()=>$("toast").classList.add("hidden"),2600);
}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function tileText(t){return t?.falseJoker?"★":String(t?.num??"")}
function tileClass(t){return t?.falseJoker?"false":"c"+(t?.color??0)}
function tileHTML(t,drag=true){
 if(!t)return "";
 const sel=selected.has(t.id)?" selected":"";
 return `<div class="tile ${tileClass(t)}${sel}" data-id="${t.id}" draggable="${drag}">
   ${tileText(t)}
 </div>`;
}
function tileSmall(t){return `<div class="tile ${tileClass(t)}">${tileText(t)}</div>`}

$("name").value=name;$("room").value=room;
$("enter").onclick=()=>{
 ensureAudio();
 const n=$("name").value.trim()||"Oyuncu",r=$("room").value.trim();
 if(!r){$("room").focus();return}
 sessionStorage.setItem("playerName",n);sessionStorage.setItem("roomCode",r);
 socket.emit("joinOkey",{name:n,roomCode:r});
};
socket.on("connect",()=>{
 myId=socket.id;
 if(room)socket.emit("joinOkey",{name,roomCode:room});
});
socket.on("okeyJoined",d=>{
 $("join").classList.add("hidden");$("game").classList.remove("hidden");$("roomLabel").textContent=d.roomCode;
});
socket.on("okeyError",toast);
socket.on("okeyState",s=>{
 const old=state;previousState=state;state=s;
 syncSelection();render(old,s);detect(old,s);
});

function syncSelection(){
 if(!state?.hand)return;
 const ids=new Set(state.hand.map(t=>t.id));
 selected=new Set([...selected].filter(id=>ids.has(id)));
 if(targetMeld!==null && !state.melds?.[targetMeld])targetMeld=null;
}
function deriveRows(){
 const ids=(state.hand||[]).map(t=>t.id);
 const split=Math.ceil(ids.length/2);
 return [ids.slice(0,split),ids.slice(split)];
}
function getRows(){
 const rr=state.rackRows;
 if(Array.isArray(rr)&&rr.length===2&&rr.flat().length===state.hand.length)return rr.map(r=>r.slice());
 return deriveRows();
}
function arrangeRows(){
 const rows=[...document.querySelectorAll(".rackRow")].map(row=>[...row.querySelectorAll(".tile")].map(x=>Number(x.dataset.id)));
 if(rows.flat().length!==state.hand.length)return;
 socket.emit("okeyArrange",{rows});
}
function renderRack(){
 const byId=new Map((state.hand||[]).map(t=>[t.id,t]));
 const rows=getRows();
 $("row0").innerHTML=rows[0].map(id=>tileHTML(byId.get(id))).join("");
 $("row1").innerHTML=rows[1].map(id=>tileHTML(byId.get(id))).join("");
 $("selectedCount").textContent=selected.size;
}
function opponentRack(count){
 let out='<div class="opponentRack">';
 for(let i=0;i<Math.min(count,21);i++)out+='<span class="backTile"></span>';
 return out+"</div>";
}
function renderSeats(){
 $("seats").innerHTML=state.players.map((p,i)=>{
   const active=p.id===state.currentPlayerId;
   let cls=i===0||i===2?" sideSeat "+(i===2?"right":"left"):"";
   return `<div class="seat${cls}">
    <div class="seatName ${active?"active":""}">${p.id===myId?"🟢 ":""}${esc(p.name)}${p.id===state.hostId?" 👑":""}</div>
    ${p.id===myId?"":`<div class="seatHand">${opponentRack(p.count)}</div>`}
    <div class="seatStatus ${active?"active":""}">${active?"SIRA":p.opened?`Açtı • ${p.openValue||"Çift"}`:`${p.count} taş`}</div>
   </div>`;
 }).join("");
}
function renderMelds(){
 const area=$("meldArea");
 let html='<div class="meldTitle">MASA / AÇILAN PERLER — İşlemek için bir pere tıkla</div>';
 html+=state.melds.map((m,i)=>{
   const target=targetMeld===i?" target":"";
   return `<div class="meld${target}" data-meld="${i}">
    <div class="meldOwner">${esc(m.ownerName)} • ${m.type==="pair"?"ÇİFT":"SERİ"}</div>
    <div class="meldTiles">${m.tiles.map(tileSmall).join("")}</div>
   </div>`;
 }).join("");
 area.innerHTML=html;
}
function renderScores(){
 $("scores").innerHTML=state.players.map(p=>`
  <div class="scoreRow"><span>${esc(p.name)}</span><b>${p.score||0}</b></div>`).join("");
}
function render(old,s){
 $("topMessage").textContent=s.message||"";
 $("count").textContent=`${s.players.length}/4`;
 const host=s.players.find(p=>p.id===s.hostId);
 $("host").innerHTML=host?`👑 Oda sahibi: <b>${esc(host.name)}</b>`:"";
 $("players").innerHTML=s.players.map((p,i)=>`
  <div class="playerRow"><div class="dot">${i+1}</div><div style="flex:1;min-width:0"><b>${esc(p.name)}${p.id===myId?" (Sen)":""}</b>
  <small style="display:block;color:#777">${p.count} taş${p.id===s.currentPlayerId?" • Sıra":""}</small></div></div>`).join("");
 renderScores();

 $("start").classList.toggle("hidden",s.hostId!==myId||s.phase==="playing");
 $("reset").classList.toggle("hidden",s.hostId!==myId);
 $("indicatorTile").innerHTML=s.indicator?tileHTML(s.indicator,false):"";
 $("jokerText").textContent=s.joker?`Okey: ${s.joker.num}`:"Okey: -";
 $("discardTile").innerHTML=s.discard?tileHTML(s.discard,false):"—";
 $("wallCount").textContent=s.wallCount;
 renderSeats();renderMelds();renderRack();

 const me=s.players.find(p=>p.id===myId);
 const myTurn=s.currentPlayerId===myId&&s.phase==="playing";
 $("turnNotice").classList.toggle("hidden",!myTurn);

 $("draw").disabled=!myTurn||s.hand.length!==21;
 $("take").disabled=!myTurn||s.hand.length!==21||!s.discard;
 $("openRun").disabled=!myTurn||me?.opened||selected.size<3;
 $("openPairs").disabled=!myTurn||me?.opened||selected.size!==10;
 $("lay").disabled=!myTurn||!me?.opened||selected.size<1||targetMeld===null;
 $("discard").disabled=!myTurn||s.hand.length<1||s.hand.length>22||selected.size!==1;

 if(s.phase==="waiting")$("handHint").textContent=`${s.players.length}/4 oyuncu bekleniyor`;
 else if(myTurn)$("handHint").textContent=me?.opened?"Taş çek • işle • ardından 1 taş at":"İlk turda 22 taşla başla • 101 veya 5 çift aç";
 else if(s.phase==="finished")$("handHint").textContent=s.winner===myId?"🏆 KAZANDIN":"El bitti";
 else $("handHint").textContent=`${s.players.find(p=>p.id===s.currentPlayerId)?.name||"Oyuncu"} oynuyor`;
}

function detect(old,s){
 if(!old)return;
 if(old.phase!=="playing"&&s.phase==="playing"){soundTurn();animate("🀄 101 OYUN BAŞLADI");}
 if(old.wallCount>s.wallCount){soundDraw();animate("TAŞ ÇEKİLDİ")}
 if(old.discard?.id!==s.discard?.id&&s.discard){soundDiscard();animate("TAŞ ATILDI")}
 if(old.currentPlayerId!==s.currentPlayerId&&s.currentPlayerId===myId)soundTurn();
 if(old.melds?.length<s.melds?.length){soundOpen();animate("PER AÇILDI")}
 if(old.phase!=="finished"&&s.phase==="finished"){if(s.winner===myId){soundWin();animate("🏆 KAZANDIN!")}else animate("EL BİTTİ")}
}
function animate(text){
 const e=document.createElement("div");e.className="floatText";e.textContent=text;$("roundFx").appendChild(e);setTimeout(()=>e.remove(),1500);
}

$("row0").ondragover=e=>{e.preventDefault();$("row0").classList.add("dropHover")};
$("row1").ondragover=e=>{e.preventDefault();$("row1").classList.add("dropHover")};
$("row0").ondragleave=()=>$("row0").classList.remove("dropHover");
$("row1").ondragleave=()=>$("row1").classList.remove("dropHover");
$("row0").ondrop=e=>{e.preventDefault();$("row0").classList.remove("dropHover");dropToRow(0,e)};
$("row1").ondrop=e=>{e.preventDefault();$("row1").classList.remove("dropHover");dropToRow(1,e)};
function dropToRow(row,e){
 const id=dragId;if(id===null)return;
 const rows=getRows().map(r=>r.slice());
 for(const r of rows){const i=r.indexOf(id);if(i>=0)r.splice(i,1)}
 const target=e.target.closest(".tile");
 if(target){
   const tid=Number(target.dataset.id);
   const arr=rows[row],idx=arr.indexOf(tid);
   if(idx<0)arr.push(id);else arr.splice(idx,0,id);
 }else rows[row].push(id);
 socket.emit("okeyArrange",{rows});
 dragId=null;
}
$("rack").addEventListener("dragstart",e=>{
 const t=e.target.closest(".tile");if(!t)return;dragId=Number(t.dataset.id);t.classList.add("dragging");
});
$("rack").addEventListener("dragend",e=>{e.target.closest(".tile")?.classList.remove("dragging");dragId=null});
$("rack").addEventListener("click",e=>{
 const t=e.target.closest(".tile");if(!t)return;
 const id=Number(t.dataset.id);
 if(selected.has(id))selected.delete(id);else selected.add(id);
 renderRack();
 const me=state.players.find(p=>p.id===myId);
 $("openRun").classList.toggle("ready",selected.size>=3&&!me?.opened);
 $("openPairs").classList.toggle("ready",selected.size===10&&!me?.opened);
 $("discard").classList.toggle("ready",selected.size===1);
});

$("meldArea").addEventListener("click",e=>{
 const m=e.target.closest(".meld");if(!m)return;
 targetMeld=Number(m.dataset.meld);renderMelds();
});
$("draw").onclick=()=>{ensureAudio();socket.emit("okeyDraw")};
$("take").onclick=()=>{ensureAudio();socket.emit("okeyTakeDiscard")};
$("openRun").onclick=()=>{ensureAudio();socket.emit("okeyOpen",{tileIds:[...selected],mode:"run"});selected.clear()};
$("openPairs").onclick=()=>{ensureAudio();socket.emit("okeyOpen",{tileIds:[...selected],mode:"pairs"});selected.clear()};
$("lay").onclick=()=>{ensureAudio();socket.emit("okeyLay",{tileIds:[...selected],targetMeldId:targetMeld});selected.clear();targetMeld=null};
$("discard").onclick=()=>{
 if(selected.size!==1)return;
 ensureAudio();socket.emit("okeyDiscard",[...selected][0]);selected.clear();
};
$("start").onclick=()=>{ensureAudio();socket.emit("okeyStart")};
$("reset").onclick=()=>{ensureAudio();socket.emit("okeyReset")};
