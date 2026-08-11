
const socket=io();
let myId=null,state=null,previousState=null,selected=null;
const $=id=>document.getElementById(id);
const name=sessionStorage.getItem("playerName")||"Oyuncu";
const room=sessionStorage.getItem("roomCode")||"";

let audioCtx=null;
let muted=localStorage.getItem("okeyMuted")==="1";

function ensureAudio(){
  if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==="suspended")audioCtx.resume();
}
function tone(freq,d=.08,type="sine",gain=.035,delay=0){
  if(muted)return;
  ensureAudio();
  const o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.type=type;o.frequency.value=freq;
  g.gain.setValueAtTime(.001,audioCtx.currentTime+delay);
  g.gain.exponentialRampToValueAtTime(gain,audioCtx.currentTime+delay+.012);
  g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+delay+d);
  o.connect(g).connect(audioCtx.destination);
  o.start(audioCtx.currentTime+delay);
  o.stop(audioCtx.currentTime+delay+d+.03);
}
function tileSound(){tone(470,.055,"triangle",.035);tone(680,.05,"triangle",.025,.045)}
function discardSound(){tone(330,.06,"triangle",.03);tone(210,.09,"triangle",.02,.06)}
function turnSound(){tone(620,.08,"sine",.035);tone(820,.12,"sine",.025,.09)}
function winSound(){[523,659,784,1047,1318].forEach((f,i)=>tone(f,.14,"sine",.04,i*.08))}
function loseSound(){[330,260,190].forEach((f,i)=>tone(f,.13,"sawtooth",.025,i*.09))}
function updateSound(){ $("soundToggle").textContent=muted?"🔇 Ses Kapalı":"🔊 Ses Açık"; }
$("soundToggle").onclick=()=>{
  ensureAudio();muted=!muted;localStorage.setItem("okeyMuted",muted?"1":"0");updateSound();
};
updateSound();

function toast(t){
  $("toast").textContent=t;
  $("toast").classList.remove("hidden");
  clearTimeout(window.__toast);
  window.__toast=setTimeout(()=>$("toast").classList.add("hidden"),2500);
}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

function tileText(t){
  if(!t)return "";
  if(t.falseJoker)return "★";
  return t.num===0?"?":String(t.num);
}
function tileClass(t){return t?.falseJoker?"false":"c"+(t?.color??0)}
function tileHTML(t,clickable=true,extra=""){
  if(!t)return '<div class="tile empty">—</div>';
  const sel=selected===t.id?" selected":"";
  return `<div class="tile ${tileClass(t)}${sel} ${extra}" data-id="${t.id}" ${clickable?'title="Taşı seç"':''}>${tileText(t)}</div>`;
}

$("name").value=name;
$("room").value=room;
$("enter").onclick=()=>{
  ensureAudio();
  const n=$("name").value.trim()||"Oyuncu",r=$("room").value.trim();
  if(!r){$("room").focus();return}
  sessionStorage.setItem("playerName",n);
  sessionStorage.setItem("roomCode",r);
  socket.emit("joinOkey",{name:n,roomCode:r});
};
socket.on("connect",()=>{
  myId=socket.id;
  if(room)socket.emit("joinOkey",{name,roomCode:room});
});
socket.on("okeyJoined",d=>{
  $("join").classList.add("hidden");
  $("game").classList.remove("hidden");
  $("roomLabel").textContent=d.roomCode;
});
socket.on("okeyError",toast);
socket.on("okeyState",s=>{
  const old=state;
  previousState=state;
  state=s;
  render(old,s);
  detectChanges(old,s);
});

function ids(arr){return new Set((arr||[]).map(t=>t.id))}
function detectChanges(old,s){
  if(!old){return}
  if(old.phase!=="playing"&&s.phase==="playing"){turnSound();animateRoundText("🀄 OYUN BAŞLADI");}
  const oldMe=old.hand||[],newMe=s.hand||[];
  const oldIds=ids(oldMe),newIds=ids(newMe);
  const added=newMe.find(t=>!oldIds.has(t.id));
  const removed=oldMe.find(t=>!newIds.has(t.id));

  if(added){tileSound();animateRoundText("TAŞ ÇEKİLDİ");}
  if(old.discard?.id!==s.discard?.id && s.discard){discardSound();animateRoundText("TAŞ ATILDI");}
  if(old.currentPlayerId!==s.currentPlayerId && s.currentPlayerId===myId){turnSound();}
  if(old.phase!=="finished"&&s.phase==="finished"){
    if(s.winner===myId)winSound();else loseSound();
    animateRoundText(s.winner===myId?"🏆 OYUNU KAZANDIN!":"EL BİTTİ");
  }
}

function animateRoundText(text){
  const el=document.createElement("div");
  el.className="floatText";
  el.textContent=text;
  $("roundFx").appendChild(el);
  setTimeout(()=>el.remove(),1500);
}

function opponentRack(count){
  let out='<div class="opponentRack">';
  for(let i=0;i<count;i++)out+='<span class="backTile"></span>';
  return out+"</div>";
}

function seatHTML(p,index){
  const me=p.id===myId;
  const active=p.id===state.currentPlayerId;
  let posClass="";
  if(index===0||index===2)posClass=" sideSeat "+(index===2?"right":"left");
  const status=active?"SIRA SENDE":state.phase==="finished"?(state.winner===p.id?"🏆 KAZANDI":"Oyun bitti"):`${p.count} taş`;
  return `<div class="seat ${posClass}">
    <div class="seatName ${active?"active":""}">${me?"🟢 ":""}${esc(p.name)}${p.id===state.hostId?" 👑":""}</div>
    <div class="seatHand">${me?"":opponentRack(p.count)}</div>
    <div class="seatStatus ${active?"active":""}">${status}</div>
  </div>`;
}

function render(old,s){
  if(!s)return;
  $("topMessage").textContent=s.message||"";
  $("count").textContent=`${s.players.length}/4`;

  const host=s.players.find(p=>p.id===s.hostId);
  $("host").innerHTML=host?`👑 Oda sahibi: <b>${esc(host.name)}</b>`:"";

  $("players").innerHTML=s.players.map((p,i)=>`
    <div class="playerRow">
      <div class="dot">${i+1}</div>
      <div style="flex:1;min-width:0">
        <b>${esc(p.name)}${p.id===myId?" (Sen)":""}</b>
        <small style="display:block;color:#777">${p.count} taş${p.id===s.currentPlayerId?" • Sıra":""}</small>
      </div>
    </div>`).join("");

  $("start").classList.toggle("hidden",s.hostId!==myId||s.phase==="playing");
  $("reset").classList.toggle("hidden",s.hostId!==myId);

  $("indicatorTile").innerHTML=tileHTML(s.indicator,false);
  $("jokerText").textContent=s.joker?`Okey: ${s.joker.num}`:"Okey: -";
  $("discardTile").innerHTML=tileHTML(s.discard,false);
  $("wallCount").textContent=s.wallCount;

  // Masadaki dört koltuk: oyuncular katılma sırasına göre saat yönünde.
  $("seats").innerHTML=s.players.map((p,i)=>seatHTML(p,i)).join("");

  const myTurn=s.currentPlayerId===myId&&s.phase==="playing";
  $("turnNotice").classList.toggle("hidden",!myTurn);

  const hand=s.hand||[];
  const oldIds=ids(old?.hand||[]);
  $("hand").innerHTML=hand.map(t=>{
    const isNew=old&&!oldIds.has(t.id);
    return tileHTML(t,true,isNew?"drawIn":"");
  }).join("");

  $("draw").disabled=!myTurn||hand.length!==14;
  $("take").disabled=!myTurn||hand.length!==14||!s.discard;
  $("discard").disabled=!myTurn||hand.length!==15||selected===null;

  if(s.phase==="waiting")$("handHint").textContent=`${s.players.length}/4 oyuncu bekleniyor`;
  else if(myTurn)$("handHint").textContent=hand.length===14?"Ortadan çek veya atılanı al":"Bir taş seçip TAŞI AT";
  else if(s.phase==="finished")$("handHint").textContent=s.winner===myId?"🏆 Kazandın":"Oyun sona erdi";
  else $("handHint").textContent=`${s.players.find(p=>p.id===s.currentPlayerId)?.name||"Oyuncu"} oynuyor`;
}

$("hand").onclick=e=>{
  const el=e.target.closest(".tile[data-id]");
  if(!el)return;
  selected=Number(el.dataset.id);
  render(previousState,state);
};

$("draw").onclick=()=>{
  if(state?.currentPlayerId!==myId)return;
  ensureAudio();
  socket.emit("okeyDraw");
};
$("take").onclick=()=>{
  if(state?.currentPlayerId!==myId)return;
  ensureAudio();
  socket.emit("okeyTakeDiscard");
};
$("discard").onclick=()=>{
  if(selected===null)return;
  ensureAudio();
  socket.emit("okeyDiscard",selected);
  selected=null;
};
$("start").onclick=()=>{ensureAudio();socket.emit("okeyStart")};
$("reset").onclick=()=>{ensureAudio();socket.emit("okeyReset")};
