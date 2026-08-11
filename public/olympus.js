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
let muted=localStorage.getItem("olympusMuted")==="1",auto=false,freeSpins=0,bonusPending=false;
let bonusMode=false,bonusMultiplierTotal=0,bonusMultiplierLog=[],bonusAccumWin=0;

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
const MULTIPLIERS=[5000,2500,1000,500,100,50,25,10,5,2];
function multiplierCells(){
 const a=[];
 grid.forEach((s,i)=>{
  if(s?.wild)a.push({i,value:MULTIPLIERS[Math.floor(Math.random()*MULTIPLIERS.length)]});
 });
 return a;
}
function resetMultiplierBank(){
 bonusMultiplierTotal=0;bonusMultiplierLog=[];
 renderMultiplierBank();
}
function addMultiplier(value){
 bonusMultiplierTotal+=value;
 bonusMultiplierLog.push(value);
 renderMultiplierBank(value);
}
function renderMultiplierBank(newValue=0){
 const el=$("multTotal"),mode=$("multMode"),list=$("multList");
 if(!el)return;
 el.textContent=`x${bonusMultiplierTotal}`;
 mode.textContent=bonusMode?"FREE SPINS • BİRİKİYOR":"NORMAL SPIN";
 const v=bonusMultiplierLog.slice(-12);
 list.innerHTML=v.map((n,i)=>`<div class="multChip ${newValue===n&&i===v.length-1?"new":""}"><span>⚡</span><b>x${n}</b></div>`).join("");
}
function scatterCount(){return grid.filter(s=>s?.scatter).length}
function groupPay(n){
 if(n>=18)return 15;
 if(n>=14)return 8;
 if(n>=11)return 4;
 return 2;
}
function updateSpinAvailability(){
 const canPlay=freeSpins>0 || balance>=bet;
 $("spin").disabled=busy||!canPlay;
 $("spin").classList.toggle("locked",!canPlay&&!busy);
 $("spin").title=canPlay?"":"Bakiye yetersiz";
}
function render(){
 $("balance").textContent=Math.floor(balance).toLocaleString("tr-TR");
 $("bet").textContent=bet;
 $("win").textContent=Math.floor(lastWin).toLocaleString("tr-TR");
 updateSpinAvailability();
 const el=$("grid");el.innerHTML="";
 grid.forEach((s,i)=>{
   const d=document.createElement("div");d.className="cell symbol-"+s.id;
   if(s.wild)d.classList.add("wild");
   if(s.scatter)d.classList.add("scatter");
   d.innerHTML=`<span class="symbolGlyph">${s.icon}</span>`;
   if(s.wild)d.innerHTML+=`<span class="symbolLabel">WILD</span>`;
   if(s.scatter)d.innerHTML+=`<span class="symbolLabel">SCATTER</span>`;
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
 if(freeSpins<=0 && balance<bet){
   toast("Bakiye bitti — tekrar çevirmek için bakiye yükle");
   updateSpinAvailability();
   return;
 }
 busy=true;$("spin").disabled=true;$("betDown").disabled=true;$("betUp").disabled=true; if(!bonusMode)resetMultiplierBank();
 lastWin=0;render();sfxSpin();
 if(freeSpins<=0)balance-=bet;else freeSpins--;
 
/* ===== STORM FX ===== */
const fx=$("fxCanvas"),ctx=fx.getContext("2d");
let sparks=[],bolts=[],lastFrame=0;
function resizeFx(){fx.width=innerWidth*devicePixelRatio;fx.height=innerHeight*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}
addEventListener("resize",resizeFx);resizeFx();
function spawnSpark(x=innerWidth/2,y=innerHeight*.45,n=18){
 for(let i=0;i<n;i++){
  const a=Math.random()*Math.PI*2,v=1+Math.random()*4;
  sparks.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:1,size:1+Math.random()*3});
 }
}
function drawBolt(){
 const x=innerWidth*(.15+Math.random()*.7), y=60;
 let px=x,py=y,pts=[[px,py]];
 for(let i=0;i<7;i++){px+=(-35+Math.random()*70);py+=40+Math.random()*45;pts.push([px,py])}
 bolts.push({pts,life:1});
}
function fxLoop(t){
 const dt=Math.min(32,t-lastFrame||16);lastFrame=t;
 ctx.clearRect(0,0,innerWidth,innerHeight);
 ctx.globalCompositeOperation="lighter";
 sparks=sparks.filter(p=>p.life>0);
 for(const p of sparks){p.x+=p.vx*dt/16;p.y+=p.vy*dt/16;p.vy+=.05;p.life-=dt/700;ctx.fillStyle=`rgba(255,218,112,${p.life})`;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill()}
 bolts=bolts.filter(b=>b.life>0);
 for(const b of bolts){
   b.life-=dt/260;ctx.strokeStyle=`rgba(255,236,154,${b.life*.8})`;ctx.lineWidth=2+b.life*2;ctx.shadowBlur=20;ctx.shadowColor="#ffd85c";ctx.beginPath();ctx.moveTo(...b.pts[0]);b.pts.slice(1).forEach(p=>ctx.lineTo(...p));ctx.stroke();ctx.shadowBlur=0;
 }
 ctx.globalCompositeOperation="source-over";
 requestAnimationFrame(fxLoop);
}
requestAnimationFrame(fxLoop);
setInterval(()=>{if(!busy&&Math.random()<.65)drawBolt()},3800);

function burstAtGrid(indices){
 const cells=[...$("grid").children];
 const r=$("grid").getBoundingClientRect();
 indices.slice(0,30).forEach(i=>{
   const c=cells[i]; if(!c)return;
   const cr=c.getBoundingClientRect();
   spawnSpark(cr.left+cr.width/2,cr.top+cr.height/2,6);
 });
}
function floatingMultiplier(value){
 const box=$("multiplierRain"),e=document.createElement("div");
 e.className="floatingMult";e.textContent=`x${value}`;
 e.style.left=(20+Math.random()*60)+"%";e.style.top=(35+Math.random()*25)+"%";
 box.appendChild(e);setTimeout(()=>e.remove(),1200);
}
function bigWin(amount){
 if(amount<bet*8)return;
 const b=$("bigWin"),a=$("bigWinAmount");
 a.textContent=`+${Math.floor(amount).toLocaleString("tr-TR")}`;
 b.classList.remove("hidden");sfxBonus();
 setTimeout(()=>b.classList.add("hidden"),1150);
}

grid=makeGrid();render();renderMultiplierBank();await sleep(300);
 let total=0,multiTotal=0,cascade=0;
 const scat=scatterCount();
 if(scat>=4)bonusPending=true;
 while(true){
   const gs=groups();
   const mults=multiplierCells();
   if(!gs.length){
     if(mults.length&&cascade>0){multiTotal+=mults.reduce((a,m)=>a+m.value,0)}
     break;
   }
   cascade++;
   const indices=[...new Set(gs.flat())];
   setCellsWin(indices);burstAtGrid(indices);sfxWin();
   let base=0;
   gs.forEach(g=>base+=bet*groupPay(g.length));
   const directMult=mults.reduce((a,m)=>a+m.value,0);
   mults.forEach(m=>{floatingMultiplier(m.value);addMultiplier(m.value)});
   total+=base;
   multiTotal=bonusMultiplierTotal;
   showWin(`+${Math.floor(base)} ⚡`);
   await sleep(430);
   const cells=[...$("grid").children];
   indices.forEach(i=>{if(cells[i])cells[i].textContent=""});
   await sleep(120);
   const removed=new Set(indices);grid=grid.map((s,i)=>removed.has(i)?null:s);fall(true);
   render();await sleep(260);
 }
 if(bonusMode){
   bonusAccumWin+=total;
   total=0;
 }else if(multiTotal>0 && total>0) total*=multiTotal;
 // Scatter-only bonus feedback.
 if(scat>=4){
   bonusPending=true;
   $("featureText").textContent=`⚡ ${scat} SCATTER — BONUS KAZANDIN`;
   sfxBonus();showWin(`⚡ ${scat} SCATTER`);
   await sleep(700);
 }
 if(total>0){
   balance+=total;lastWin=total;
   $("win").textContent=Math.floor(total).toLocaleString("tr-TR");
   bigWin(total);spawnSpark(innerWidth*.5,innerHeight*.5,55);
   toast(`Kazanç +${Math.floor(total).toLocaleString("tr-TR")}`);
 }else lastWin=0;
 localStorage.setItem("olympusBalance",Math.floor(balance));
 render(); 
 $("featureText").textContent=freeSpins>0?`${freeSpins} FREE SPIN kaldı`:"8+ sembol eşleşmesi kazanır";
 busy=false;$("betDown").disabled=false;$("betUp").disabled=false;
 if(bonusPending){
   freeSpins+=15;
   bonusPending=false;
   bonusMode=true;
   bonusMultiplierTotal=0;bonusMultiplierLog=[];bonusAccumWin=0;
   renderMultiplierBank();
   $("featureText").textContent="⚡ 15 FREE SPIN BAŞLADI";
   showWin("⚡ FREE SPIN");
   setTimeout(()=>{if(freeSpins>0&&!busy)spin()},850);
 }else if(bonusMode && freeSpins<=0){
   const finalBonusWin=bonusAccumWin*bonusMultiplierTotal;
   if(finalBonusWin>0){
     balance+=finalBonusWin;lastWin=finalBonusWin;
     bigWin(finalBonusWin);
     toast(`FREE SPIN KAZANCI +${Math.floor(finalBonusWin).toLocaleString("tr-TR")}`);
   }
   bonusMode=false;
   $("featureText").textContent=`BONUS BİTTİ • x${bonusMultiplierTotal}`;
   localStorage.setItem("olympusBalance",Math.floor(balance));
   renderMultiplierBank();
 }else if(auto&&!busy&&(freeSpins>0||balance>=bet)){
   setTimeout(spin,800);
 }
 updateSpinAvailability();
}
$("spin").onclick=spin;
$("betDown").onclick=()=>{if(busy)return;bet=Math.max(1,bet-5);render()};
$("betUp").onclick=()=>{if(busy)return;bet=Math.min(Math.max(1,balance),bet+5);render()};
$("auto").onclick=()=>{auto=!auto;$("auto").classList.toggle("active",auto);$("auto").textContent=auto?"AUTO AÇIK":"AUTO";if(auto&&!busy)spin()};



grid=makeGrid();render();
