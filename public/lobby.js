const modal=document.getElementById("joinModal"), nameInput=document.getElementById("playerName"), roomInput=document.getElementById("roomCode");
let selectedGame="blackjack";
document.querySelectorAll("[data-game]").forEach(btn=>btn.onclick=()=>{
  selectedGame=btn.dataset.game;
  const o=selectedGame==="okey";
  document.getElementById("selectedIcon").textContent=o?"🀄":"♠";
  document.getElementById("selectedTitle").textContent=o?"101 OKEY":"BLACKJACK";
  document.getElementById("selectedDesc").textContent=o?"4 kişilik online 101 Okey masası":"5 kişiye kadar online Blackjack masası";
  modal.classList.remove("hidden");nameInput.focus();
});
document.getElementById("closeModal").onclick=()=>modal.classList.add("hidden");
modal.onclick=e=>{if(e.target===modal)modal.classList.add("hidden")};
document.getElementById("enterGame").onclick=()=>{
  const name=nameInput.value.trim()||"Oyuncu",room=roomInput.value.trim();
  if(!room){roomInput.focus();return}
  sessionStorage.setItem("playerName",name);sessionStorage.setItem("roomCode",room);
  location.href=selectedGame==="okey"?"/okey.html":"/blackjack.html";
};
roomInput.addEventListener("keydown",e=>{if(e.key==="Enter")document.getElementById("enterGame").click()});
nameInput.value=sessionStorage.getItem("playerName")||"";
roomInput.value=sessionStorage.getItem("roomCode")||"";
