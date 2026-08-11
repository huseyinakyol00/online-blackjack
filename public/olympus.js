const $=id=>document.getElementById(id);

const SYMBOLS=[
 {id:"sun",icon:"☀️",weight:16,mult:1},
 {id:"gem",icon:"🔷",weight:15,mult:1},
 {id:"ruby",icon:"♦️",weight:14,mult:1},
 {id:"crown",icon:"👑",weight:11,mult:1},
 {id:"ring",icon:"💍",weight:10,mult:1},
 {id:"chalice",icon:"🏆",weight:10,mult:1},
 {id:"scatter",icon:"✦",weight:5,mult:0,scatter:true},
 {id:"wild",icon:"⚡",weight:3,mult:0,wild:true}
];
const COLS=6,ROWS=5;
let grid=[],busy=false,bet=10,balance=Number(localStorage.getItem("olympusBalance")||1000),lastWin=0;
let muted=localStorage.getItem("olympusMuted")==="1",auto=false,freeSpins=0;

function pickSymbol(){
 const total=SYMBOLS.reduce((a,s)=>a+s.weight,0);
 let r=Math.random()*total;
 for(const s of SYMBOLS){r-=s.weight;if(r<=0)return s}
 return SYMBOLS[0];
}
function makeGrid(){
 return Array.from({length:COLS*ROWS},()=>pickSymbol());
}
function idx(x,y){return y*COLS+x}
function neighbors(i){
 const x=i%COLS,y=Math.floor(i/COLS),a=[];
 if(x)a.push(i-1);if(x<COLS-1)a.push(i+1);if(y)a.push(i-COLS);if(y<ROWS-1)a.push(i+COLS);
 return a;
}
function groups(){
 const seen=new Set(),out=[];
 for(let i=0;i<grid.length;i++){
   if(seen.has(i)||grid[i].scatter||grid[i].wild)continue;
   const id=grid[i].id, stack=[i],g=[];seen.add(i);
   while(stack.length){
     const n=stack.pop();g.push(n);
     for(const q of neighbors(n)){
       if(!seen.has(q)&&grid[q]&&!grid[q].scatter&&!grid[q].wild&&grid[q].id===id){seen.add(q);stack.push(q)}
     }
   }
   if(g.length>=8)out.push(g);
 }
 return out;
}
function wildBonus(){
 return grid.reduce((a,s)=>a+(s?.wild?1:0),0);
}
function multiplierCells(){
 const a=[];
 grid.forEach((s,i)=>{if(s?.wild)a.push({i,value:[2,3,5,8,10,25,50,100,250,500][Math.floor(Math.random()*10)]})});
 return a;
}
function scatterCount(){return grid.filter(s=>s?.scatter).length}
function groupPay(n){
 if(n>=18)return 15;
 if(n>=14)return 8;
 if(n>=11)return 4;
 return 2;
}
function render(){
 $("balance").textContent=Math.floor(balance).toLocaleString("tr-TR");
 $("bet").textContent=bet;
 $("win").textContent=Math.floor(lastWin).toLocaleString("tr-TR");
 const el=$("grid");el.innerHTML="";
 grid.forEach((s,i)=>{
   const d=document.createElement("div");d.className="cell";
   if(s.wild)d.classList.add("wild");
   if(s.scatter)d.classList.add("scatter");
   d.textContent=s.icon;
   el.appendChild(d);
 });
}
function toast(t){const e=$("toast");e.textContent=t;e.classList.add("show");clearTimeout(window.__t);window.__t=setTimeout(()=>e.classList.remove("show"),1800)}
function tone(freq,d=.08,type="sine",gain=.035){
 if(muted)return;
 const C=window.__audio||(window.__audio=new (window.AudioContext||window.webkitAudioContext)());
 const o=C.createOscillator(),g=C.createGain();o.type=type;o.frequency.value=freq;
 g.gain.setValueAtTime(.001,C.currentTime);g.gain.exponentialRampToValueAtTime(gain,C.currentTime+.01);g.gain.exponentialRampToValueAtTime(.001,C.currentTime+d);
 o.connect(g).connect(C.destination);o.start();o.stop(C.currentTime+d+.03);
}
function sfxWin(){tone(520,.08,"triangle");tone(720,.1,"triangle",.025)}
function sfxSpin(){tone(150,.09,"sawtooth",.025);setTimeout(()=>tone(230,.1,"triangle",.025),80)}
function sfxBonus(){[392,523,659,784].forEach((f,i)=>setTimeout(()=>tone(f,.14,"sine",.035),i*90))}
function updateSound(){$("soundBtn").textContent=muted?"🔇 Ses":"🔊 Ses"}
$("soundBtn").onclick=()=>{muted=!muted;localStorage.setItem("olympusMuted",muted?"1":"0");updateSound();if(!muted)tone(500,.08)}
updateSound();

function showWin(text){
 const e=$("winFlash");e.classList.remove("hidden");void e.offsetWidth;e.classList.add("hidden");
 const t=$("cascadeText");t.textContent=text;clearTimeout(window.__ct);setTimeout(()=>t.textContent="",550);
}
function setCellsWin(indices){
 const cells=[...$("grid").children];
 indices.forEach(i=>cells[i]?.classList.add("win"));
}
function fall(refill=true){
 const next=Array(COLS*ROWS).fill(null);
 for(let x=0;x<COLS;x++){
   let write=ROWS-1;
   for(let y=ROWS-1;y>=0;y--){
     const s=grid[idx(x,y)];
     if(s){next[idx(x,write)]=s;write--}
   }
   while(write>=0){next[idx(x,write)]=refill?pickSymbol():null;write--}
 }
 grid=next;
}
async function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
async function spin(){
 if(busy)return;
 if(balance<bet && freeSpins<=0){toast("Yetersiz bakiye");return}
 busy=true;$("spin").disabled=true;$("betDown").disabled=true;$("betUp").disabled=true;
 lastWin=0;render();sfxSpin();
 if(freeSpins<=0)balance-=bet;else freeSpins--;
 grid=makeGrid();render();await sleep(300);
 let total=0,multiTotal=0,cascade=0;
 const scat=scatterCount();
 if(scat>=4)freeSpins+=15;
 while(true){
   const gs=groups();
   const mults=multiplierCells();
   if(!gs.length){
     if(mults.length&&cascade>0){multiTotal+=mults.reduce((a,m)=>a+m.value,0)}
     break;
   }
   cascade++;
   const indices=[...new Set(gs.flat())];
   setCellsWin(indices);sfxWin();
   let base=0;
   gs.forEach(g=>base+=bet*groupPay(g.length));
   const directMult=mults.reduce((a,m)=>a+m.value,0);
   total+=base;
   multiTotal+=directMult;
   showWin(`+${Math.floor(base)} ⚡`);
   await sleep(430);
   const cells=[...$("grid").children];
   indices.forEach(i=>{if(cells[i])cells[i].textContent=""});
   await sleep(120);
   const removed=new Set(indices);grid=grid.map((s,i)=>removed.has(i)?null:s);fall(true);
   render();await sleep(260);
 }
 if(multiTotal>0 && total>0) total+=total*(multiTotal/100);
 // Scatter-only bonus feedback.
 if(scat>=4){
   $("featureText").textContent=`FIRTINA BONUSU: ${freeSpins} ücretsiz çevirme`;
   sfxBonus();showWin(`⚡ ${scat} SCATTER`);
   await sleep(700);
 }
 if(total>0){
   balance+=total;lastWin=total;
   $("win").textContent=Math.floor(total).toLocaleString("tr-TR");
   toast(`Kazanç +${Math.floor(total).toLocaleString("tr-TR")}`);
 }else lastWin=0;
 localStorage.setItem("olympusBalance",Math.floor(balance));
 render();
 $("featureText").textContent=freeSpins>0?`${freeSpins} FREE SPIN kaldı`:"8+ sembol eşleşmesi kazanır";
 busy=false;$("spin").disabled=false;$("betDown").disabled=false;$("betUp").disabled=false;
 if(auto&&!busy&&balance>=bet) setTimeout(spin,800);
}
$("spin").onclick=spin;
$("betDown").onclick=()=>{if(busy)return;bet=Math.max(1,bet-5);render()};
$("betUp").onclick=()=>{if(busy)return;bet=Math.min(Math.max(1,balance),bet+5);render()};
$("auto").onclick=()=>{auto=!auto;$("auto").classList.toggle("active",auto);$("auto").textContent=auto?"AUTO AÇIK":"AUTO";if(auto&&!busy)spin()};

$("bonusStart").onclick=()=>{
 $("bonusModal").classList.add("hidden");
 freeSpins=15;$("featureText").textContent="15 FREE SPIN başladı";
 sfxBonus();spin();
};

grid=makeGrid();render();
