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
  $("message").textContent="Sistem: "+(state.message||"");
  $("dealerCards").innerHTML=state.dealer.cards.map(cardHTML).join("");
  $("dealerValue").textContent=state.dealer.hidden?"Değer: ?":`Değer: ${state.dealer.value}`;

  $("players").innerHTML=state.players.map((p,i)=>{
    const active=p.id===state.currentPlayerId,me=p.id===myId;
    return `<div class="player ${active?"active":""} ${me?"me":""} ${p.status==="out"?"out":""}">
      <div class="playerHead"><b>${escapeHtml(p.name)}${me?" (Sen)":""}</b><span>🪙 ${p.chips}</span></div>
      <div class="cards">${p.cards.map(cardHTML).join("")}</div>
      <div class="chipPile">${chipStackHTML(p.bet||0)}</div>
      <div class="playerInfo">
        <div class="playerBet">Bahis: ${p.bet||0}</div>
        <div class="playerValue">KART DEĞERİ: ${p.cards.length?p.value:"-"}</div>
        <div class="status">${p.result||statusText(p.status)}</div>
      </div>
    </div>`;
  }).join("");

  $("playersList").innerHTML=state.players.map((p,i)=>`
    <div class="playerMini ${p.id===myId?"me":""}">
      <div class="avatar">${i+1}</div>
      <div class="ptext"><b>${escapeHtml(p.name)}${p.id===myId?" (Sen)":""}</b><small>${p.id===state.hostId?"👑 Oda Sahibi":statusText(p.status)}</small></div>
      <div class="miniCoins">🪙 ${p.chips}</div>
    </div>`).join("");
  $("playerCount").textContent=`(${state.players.length}/5)`;
  const host=state.players.find(p=>p.id===state.hostId);
  $("hostName").textContent=host?`👑 ${host.name}`:"👑 —";

  const me=state.players.find(p=>p.id===myId),isMyTurn=state.currentPlayerId===myId&&state.phase==="playing",isHost=state.hostId===myId;
  $("betBox")?.classList.add("hidden"); // compatibility; side controls are always visible during betting
  $("playBox").classList.toggle("hidden",!isMyTurn);
  $("next").classList.add("hidden");
  $("hostBox").classList.toggle("hidden",!isHost);
  $("start").disabled=!isHost||!me||me.chips<=0;
  if(me&&document.activeElement!==$("bet"))$("bet").value=me.bet||10;
  $("myBalance").textContent=me?me.chips:"-";
  $("betTotal").textContent=me?me.bet||0:"0";
  $("myResult").textContent=me?.result||"—";
}

function chipClassFor(v){if(v>=500)return"gold";if(v>=250)return"purple";if(v>=100)return"black";if(v>=50)return"blue";if(v>=25)return"red";return"green"}
function chipStackHTML(amount){
  let remain=Number(amount)||0,vals=[500,250,100,50,25,10],out=[];
  for(const v of vals){while(remain>=v&&out.length<16){out.push(v);remain-=v}}
  return out.map(v=>`<div class="chipVisual ${chipClassFor(v)}">${v}</div>`).join("");
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

// ---------- Casino chips ----------
let selectedBet = 0;

function animateNewCards(){
  document.querySelectorAll(".card").forEach((c,i)=>{
    c.classList.remove("dealGlow");
    setTimeout(()=>c.classList.add("dealGlow"),i*65);
  });
}
// Wrap render to add card-deal motion after DOM updates.
const _renderWithChips = render;
render = function(){
  _renderWithChips();
  animateNewCards();
  const me=state?.players?.find(p=>p.id===myId);
  const sum=document.querySelector("#betSummary b");
  if(sum)sum.textContent=me?.bet||10;
};

// Animate chip movement whenever a round begins or bet changes.
const _detectEffectsWithChips = detectEffects;
detectEffects = function(prev,now){
  _detectEffectsWithChips(prev,now);
  if(prev.phase!==now.phase && now.phase==="playing"){
    flyChips(prev.players.find(p=>p.id===myId)?.bet || 10);
  }
  if(prev.players && now.players){
    now.players.forEach((p,i)=>{
      const old=prev.players[i];
      if(old && p.chips!==old.chips && p.id===myId && p.chips>old.chips){
        flyChips(p.chips-old.chips);
      }
    });
  }
};


(function(){
  const enforceHostNext=()=>{
    const b=document.getElementById("next");
    if(!b || !state)return;
    b.classList.toggle("hidden", state.phase!=="finished" || state.hostId!==myId);
  };
  setInterval(enforceHostNext,250);
})();




function flyChips(amount,targetEl){
  const effects=document.getElementById("effects"), tray=document.getElementById("chipTray");
  const target=targetEl||document.getElementById("betTotal");
  if(!effects||!tray||!target)return;
  const s=tray.getBoundingClientRect(), t=target.getBoundingClientRect();
  const cls=chipClassFor(amount);
  for(let i=0;i<Math.min(8,Math.max(2,Math.ceil(amount/50)));i++){
    const c=document.createElement("div");
    c.className="flyingChip "+cls;c.textContent=amount;
    c.style.left=(s.left+s.width/2+(Math.random()*80-40))+"px";
    c.style.top=(s.top+s.height/2)+"px";
    c.style.setProperty("--dx",(Math.random()*120-60)+"px");
    c.style.setProperty("--dy",(Math.random()*-100-20)+"px");
    c.style.setProperty("--tx",(t.left+t.width/2-s.left-s.width/2)+"px");
    c.style.setProperty("--ty",(t.top+t.height/2-s.top-s.height/2)+"px");
    effects.appendChild(c);setTimeout(()=>c.remove(),900);
  }
}

// ===== Final casino chip controls =====
const chipTrayFinal=document.getElementById("chipTray");
chipTrayFinal?.addEventListener("click",e=>{
  const btn=e.target.closest(".chip"); if(!btn)return;
  const me=state?.players?.find(p=>p.id===myId);
  if(!me||state.phase!=="betting"||me.chips<=0)return;
  const amount=Number(btn.dataset.chip)||0;
  selectedBet=Number.isFinite(selectedBet)?selectedBet:0;
  const next=selectedBet+amount;
  if(next>me.chips)return;
  selectedBet=next;
  const betInput=document.getElementById("bet");
  if(betInput)betInput.value=selectedBet;
  const total=document.getElementById("betTotal");
  if(total)total.textContent=selectedBet;
  socket.emit("setBet",selectedBet);
  chipSound();flyChips(amount,total);
});
document.getElementById("clearBet")?.addEventListener("click",()=>{
  const me=state?.players?.find(p=>p.id===myId);
  if(!me||state.phase!=="betting")return;
  selectedBet=0;
  const betInput=document.getElementById("bet");if(betInput)betInput.value=0;
  const total=document.getElementById("betTotal");if(total)total.textContent=0;
  socket.emit("setBet",0);chipSound();
});

// ===== AUTOMATIC NEXT HAND =====
let autoNextTimer=null;
let autoNextStamp=0;
function scheduleAutomaticNext(prev,now){
  if(prev.phase!=="finished" && now.phase==="finished" && now.hostId===myId){
    const stamp=Date.now();
    autoNextStamp=stamp;
    clearTimeout(autoNextTimer);
    autoNextTimer=setTimeout(()=>{
      if(autoNextStamp!==stamp || !state || state.phase!=="finished" || state.hostId!==myId)return;
      ensureAudio();chipSound();socket.emit("nextRound");
    },3000);
  }
  if(now.phase!=="finished"){clearTimeout(autoNextTimer);autoNextTimer=null;}
}
const _stateEffectAuto = detectEffects;
detectEffects=function(prev,now){
  _stateEffectAuto(prev,now);
  scheduleAutomaticNext(prev,now);
};

// ===== TABLE ACTION BUTTONS =====
function bindTableAction(id, originalId){
  const b=document.getElementById(id);
  if(!b)return;
  b.onclick=()=>{
    const original=document.getElementById(originalId);
    if(original && !original.disabled) original.click();
  };
}
bindTableAction("tableHit","hit");
bindTableAction("tableStand","stand");
bindTableAction("tableDouble","double");

const _renderTableActions = render;
render=function(){
  _renderTableActions();
  const me=state?.players?.find(p=>p.id===myId);
  const myTurn=!!(me && state?.phase==="playing" && state?.currentPlayerId===myId);
  document.getElementById("tableActions")?.classList.toggle("hidden",!myTurn);
};


function showRoundBanner(){
  const b=document.getElementById("roundBanner");if(!b)return;
  b.classList.remove("hidden");b.textContent="✦ YENİ EL BAŞLADI! ✦";
  clearTimeout(window.__roundBannerTimer);
  window.__roundBannerTimer=setTimeout(()=>b.classList.add("hidden"),2200);
}
function showResultOverlay(me,delta){
  const o=document.getElementById("winOverlay");if(!o||!me)return;
  const r=me.result||"";
  let type="push",title="EL BİTTİ",amount="";
  if(r==="Kazandın"||r.startsWith("Blackjack")){type="win";title="KAZANDIN!";amount=delta>0?`+${delta} 🪙`:"Kazandın 🎉"}
  else if(r==="Kaybettin"||r==="21'i geçtin"){type="lose";title=r==="21'i geçtin"?"YANDIN!":"KAYBETTİN";amount=delta<0?`${delta} 🪙`:""}
  else if(r.toLowerCase().includes("beraber")){type="push";title="BERABERE";amount="Bahsin iade edildi"}
  else {type="push";title=r||"EL BİTTİ"}
  o.className=`winOverlay ${type} show`;
  o.innerHTML=`<div class="winTitle">${title}</div><div class="winAmount">${amount}</div><div class="winSub">${escapeHtml(r)}</div>`;
  clearTimeout(window.__resultTimer);
  window.__resultTimer=setTimeout(()=>o.classList.remove("show"),2600);
  if(type==="win")sparkleResult();
}
function sparkleResult(){
  const o=document.getElementById("winOverlay");if(!o)return;
  const r=o.getBoundingClientRect();
  for(let i=0;i<22;i++){
    const s=document.createElement("div");s.className="resultSpark";
    s.style.left=(r.left+r.width/2)+"px";s.style.top=(r.top+r.height/2)+"px";
    s.style.setProperty("--sx",(Math.random()*260-130)+"px");
    s.style.setProperty("--sy",(Math.random()*240-120)+"px");
    document.getElementById("effects").appendChild(s);setTimeout(()=>s.remove(),950);
  }
}


const __detectEffectsBeforeFeedback=detectEffects;
detectEffects=function(prev,now){
  __detectEffectsBeforeFeedback(prev,now);
  if(prev.phase!=="playing" && now.phase==="playing") showRoundBanner();
  if(prev.phase!=="finished" && now.phase==="finished"){
    const me=now.players.find(p=>p.id===myId);
    const oldMe=prev.players.find(p=>p.id===myId);
    const delta=me&&oldMe?Number(me.chips)-Number(oldMe.chips):0;
    if(me)showResultOverlay(me,delta);
  }
};
