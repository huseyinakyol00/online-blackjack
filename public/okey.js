const socket=io();
let myId=null,state=null,selected=null;
const $=id=>document.getElementById(id);
const name=sessionStorage.getItem("playerName")||"Oyuncu";
const room=sessionStorage.getItem("roomCode")||"";
let joined=false;

function toast(t){$("toast").textContent=t;$("toast").classList.remove("hidden");clearTimeout(window.__t);window.__t=setTimeout(()=>$("toast").classList.add("hidden"),2500)}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function tileText(t){
  if(!t)return "";
  if(t.falseJoker)return "★";
  return t.num===0?"?":String(t.num);
}
function tileClass(t){return t?.falseJoker?"false":"c"+(t?.color??0)}
function tileHTML(t,clickable=true){
  if(!t)return '<div class="tile empty">—</div>';
  const sel=selected===t.id?" selected":"";
  return `<div class="tile ${tileClass(t)}${sel}" data-id="${t.id}" ${clickable?'title="Seç"':''}>${tileText(t)}</div>`;
}
$("name").value=name;$("room").value=room;
$("enter").onclick=()=>{
  const n=$("name").value.trim()||"Oyuncu",r=$("room").value.trim();
  if(!r){$("room").focus();return}
  sessionStorage.setItem("playerName",n);sessionStorage.setItem("roomCode",r);
  socket.emit("joinOkey",{name:n,roomCode:r});
};
socket.on("connect",()=>{myId=socket.id;if(room){socket.emit("joinOkey",{name,roomCode:room})}});
socket.on("okeyJoined",d=>{$("join").classList.add("hidden");$("game").classList.remove("hidden");$("roomLabel").textContent=d.roomCode;joined=true});
socket.on("okeyError",toast);
socket.on("okeyState",s=>{state=s;selected=null;render()});

function render(){
  if(!state)return;
  $("topMessage").textContent=state.message||"";
  $("count").textContent=`${state.players.length}/4`;
  const host=state.players.find(p=>p.id===state.hostId);
  $("host").innerHTML=host?`👑 Oda sahibi: <b>${esc(host.name)}</b>`:"";
  $("players").innerHTML=state.players.map((p,i)=>`
    <div class="playerRow"><div class="dot">${i+1}</div><div style="flex:1"><b>${esc(p.name)}${p.id===myId?" (Sen)":""}</b><small style="display:block;color:#777">${p.count} taş</small></div></div>`).join("");
  $("start").classList.toggle("hidden",state.hostId!==myId||state.phase==="playing");
  $("reset").classList.toggle("hidden",state.hostId!==myId);
  $("indicatorTile").innerHTML=tileHTML(state.indicator,false);
  $("jokerText").textContent=state.joker?`Okey: ${state.joker.num}`:"Okey: -";
  $("discardTile").innerHTML=tileHTML(state.discard,false);
  $("wallCount").textContent=state.wallCount;
  $("seats").innerHTML=state.players.map((p,i)=>`<div class="seat"><div class="seatName">${p.id===myId?"🟢 ":""}${esc(p.name)}</div><div class="seatHand">${p.count} taş ${p.id===state.currentPlayerId?"• Sıra burada":""}</div></div>`).join("");
  $("hand").innerHTML=(state.hand||[]).map(t=>tileHTML(t,true)).join("");
  const myTurn=state.currentPlayerId===myId&&state.phase==="playing";
  $("turnNotice").classList.toggle("hidden",!myTurn);
  $("draw").disabled=!myTurn||state.hand.length!==14;
  $("take").disabled=!myTurn||state.hand.length!==14||!state.discard;
  $("discard").disabled=!myTurn||state.hand.length!==15||selected===null;
  $("handHint").textContent=state.phase==="waiting"?"4 oyuncu bekleniyor":myTurn?(state.hand.length===14?"Taş çek veya atılanı al":"Bir taş seçip at"):(state.phase==="finished"?"Oyun bitti":"Sıra bekleniyor");
}
$("hand").onclick=e=>{const el=e.target.closest(".tile[data-id]");if(!el)return;selected=Number(el.dataset.id);render()};
$("draw").onclick=()=>{if(state?.currentPlayerId===myId)socket.emit("okeyDraw")};
$("take").onclick=()=>{if(state?.currentPlayerId===myId)socket.emit("okeyTakeDiscard")};
$("discard").onclick=()=>{if(selected!==null)socket.emit("okeyDiscard",selected)};
$("start").onclick=()=>socket.emit("okeyStart");
$("reset").onclick=()=>socket.emit("okeyReset");
