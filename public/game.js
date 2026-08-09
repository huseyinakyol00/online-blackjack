const socket=io();
let myId=null,state=null,lastState=null;
const $=id=>document.getElementById(id);

// ---------- Sound engine (no external files needed) ----------
let audioCtx=null, muted=localStorage.getItem("bjMuted")==="1", musicTimer=null;
function ensureAudio(){
  if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==="suspended") audioCtx.resume();
}
function tone(freq,duration=.08,type="sine",gain=.035,delay=0){
  if(muted)return;
  ensureAudio();
  const o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(0,audioCtx.currentTime+delay);
  g.gain.linearRampToValueAtTime(gain,audioCtx.currentTime+delay+.01);
  g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+delay+duration);
  o.connect(g).connect(audioCtx.destination);o.start(audioCtx.currentTime+delay);o.stop(audioCtx.currentTime+delay+duration+.02);
}
function cardSound(){tone(520,.055,"triangle",.045);tone(740,.045,"triangle",.025,.055)}
function chipSound(){tone(180,.08,"square",.025);tone(240,.07,"square",.018,.06)}
function winSound(){[523,659,784,1047].forEach((f,i)=>tone(f,.16,"sine",.04,i*.09))}
function loseSound(){[300,230,180].forEach((f,i)=>tone(f,.16,"sawtooth",.025,i*.1))}
function startMusic(){
  if(muted||musicTimer)return;
  ensureAudio();
  const notes=[196,220,261.63,293.66,261.63,220,174.61,196];
  let i=0;
  musicTimer=setInterval(()=>{ if(!muted) tone(notes[i++%notes.length],.35,"sine",.008); },650);
}
function stopMusic(){if(musicTimer){clearInterval(musicTimer);musicTimer=null}}
function updateSoundButton(){ $("soundToggle").textContent=muted?"🔇 Ses Kapalı":"🔊 Ses Açık"; }
$("soundToggle").onclick=()=>{
  muted=!muted;localStorage.setItem("bjMuted",muted?"1":"0");
  if(muted)stopMusic(); else {ensureAudio();startMusic()}
  updateSoundButton();
};
updateSoundButton();

// ---------- Join ----------
$("join").onclick=()=>{
  ensureAudio();startMusic();
  const name=$("name").value.trim()||"Oyuncu",room=$("room").value.trim();
  if(!room){showError("Oda kodu yaz.");return}
  socket.emit("joinRoom",{name,roomCode:room});
};
socket.on("connect",()=>myId=socket.id);
socket.on("joined",d=>{
  $("joinScreen").classList.add("hidden");$("game").classList.remove("hidden");
  $("roomLabel").textContent="Oda: "+d.roomCode;
});
socket.on("errorMessage",showError);
socket.on("state",s=>{
  const previous=state;
  state=s;render();
  if(previous) detectEffects(previous,s);
  else startMusic();
});

function showError(t){
  $("error").textContent=t;$("error").classList.remove("hidden");
  setTimeout(()=>$("error").classList.add("hidden"),3000);
}
function cardHTML(c){
  if(c.hidden)return '<div class="card back">?</div>';
  const red=c.suit==="♥"||c.suit==="♦";
  return `<div class="card ${red?"red":""}">${c.rank}${c.suit}</div>`;
}
function statusText(s){
  return {playing:"Sıra sende",stand:"Durdu",busted:"Yandın",waiting:"Bekliyor",out:"Çiplerin bitti"}[s]||"";
}
function escapeHtml(s){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

function render(){
  if(!state)return;
  $("message").textContent=state.message||"";
  $("dealerCards").innerHTML=state.dealer.cards.map(cardHTML).join("");
  $("dealerValue").textContent=state.dealer.hidden?"Değer: ?":`Değer: ${state.dealer.value}`;
  $("players").innerHTML=state.players.map(p=>{
    const active=p.id===state.currentPlayerId,me=p.id===myId;
    return `<div class="player ${active?"active":""} ${me?"me":""} ${p.status==="out"?"out":""}">
      <div class="playerHead"><b>${escapeHtml(p.name)}${me?" (Sen)":""}</b><span>💰 ${p.chips}</span></div>
      <div class="cards">${p.cards.map(cardHTML).join("")}</div>
      <div class="playerInfo">
        <div class="playerBet">Bahis: ${p.bet}</div>
        <div class="playerValue">KART DEĞERİ: ${p.cards.length?p.value:"-"}</div>
        <div class="status">${p.result||statusText(p.status)}</div>
      </div>
    </div>`;
  }).join("");
  const me=state.players.find(p=>p.id===myId),isMyTurn=state.currentPlayerId===myId&&state.phase==="playing";
  const isHost=state.hostId===myId;
  $("betBox").classList.toggle("hidden",state.phase!=="betting"||!me||me.chips<=0);
  $("playBox").classList.toggle("hidden",!isMyTurn);
  $("next").classList.toggle("hidden",state.phase!=="finished");
  $("hostBox").classList.toggle("hidden",!isHost);
  if(me&&document.activeElement!==$("bet"))$("bet").value=me.bet||10;
  $("start").disabled=!isHost||!me||me.chips<=0;
  $("setBet").disabled=!me||me.chips<=0;
}

function detectEffects(prev,now){
  // Card dealt/hit
  const oldCounts=prev.players.map(p=>p.cards.length);
  const newCounts=now.players.map(p=>p.cards.length);
  if(newCounts.some((n,i)=>n>oldCounts[i])) cardSound();

  // Turn change
  if(prev.currentPlayerId!==now.currentPlayerId && now.currentPlayerId===myId) chipSound();

  // Round finished: play result sound and flash winner.
  if(prev.phase!=="finished" && now.phase==="finished"){
    const me=now.players.find(p=>p.id===myId);
    if(me?.result==="Kazandın" || me?.result?.startsWith("Blackjack")) winSound();
    else if(me?.result==="Kaybettin" || me?.result==="21'i geçtin") loseSound();
    if(me?.result==="Kazandın" || me?.result?.startsWith("Blackjack")){
      const el=[...document.querySelectorAll(".player")].find(x=>x.classList.contains("me"));
      if(el){el.classList.add("winFlash");setTimeout(()=>el.classList.remove("winFlash"),1800)}
      popChip();
    }
  }
}
function popChip(){
  const el=document.createElement("div");el.className="chipPop";el.textContent="💰 +";
  el.style.left="50%";el.style.top="55%";document.getElementById("effects").appendChild(el);
  setTimeout(()=>el.remove(),850);
}

$("setBet").onclick=()=>{ensureAudio();chipSound();socket.emit("setBet",Number($("bet").value))};
$("start").onclick=()=>{if(state?.hostId!==myId){showError("Sadece oda sahibi eli başlatabilir.");return}ensureAudio();chipSound();socket.emit("startRound")};
$("hit").onclick=()=>{ensureAudio();cardSound();socket.emit("hit")};
$("stand").onclick=()=>{ensureAudio();socket.emit("stand")};
$("double").onclick=()=>{ensureAudio();chipSound();socket.emit("double")};
$("next").onclick=()=>{ensureAudio();chipSound();socket.emit("nextRound")};

$("resetLobby").onclick=()=>{
  if(confirm("Lobiyi sıfırlamak istediğine emin misin?\nTüm oyuncuların çipleri 1000'e dönecek ve mevcut el bitecek.")){
    ensureAudio();
    chipSound();
    socket.emit("resetLobby");
  }
};
