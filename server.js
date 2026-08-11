const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

const rooms = {};
const MAX_PLAYERS = 5;
const STARTING_CHIPS = 1000;

function newDeck() {
    const suits = ["♠","♥","♦","♣"], ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
    const deck = [];
    for (const suit of suits) for (const rank of ranks) deck.push({rank,suit});
    for (let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
    return deck;
}
function cardValue(cards){
    let total=0,aces=0;
    for(const c of cards){if(c.rank==="A"){total+=11;aces++;}else if(["K","Q","J"].includes(c.rank))total+=10;else total+=Number(c.rank);}
    while(total>21&&aces>0){total-=10;aces--;} return total;
}
function isBlackjack(cards){return cards.length===2&&cardValue(cards)===21;}
function publicState(room){
    return {
        roomCode:room.code,phase:room.phase,hostId:room.hostId,
        players:room.players.map(p=>({id:p.id,name:p.name,chips:p.chips,bet:p.bet,cards:p.cards,value:cardValue(p.cards),status:p.status,blackjack:isBlackjack(p.cards),result:p.result})),
        dealer:{cards:room.phase==="playing"?room.dealer.cards.map((c,i)=>i===1?{hidden:true}:c):room.dealer.cards,value:room.phase==="playing"?cardValue(room.dealer.cards.slice(0,1)):cardValue(room.dealer.cards),hidden:room.phase==="playing"},
        currentPlayerId:room.currentPlayerIndex>=0?room.players[room.currentPlayerIndex]?.id:null,message:room.message
    };
}
function broadcast(room){io.to(room.code).emit("state",publicState(room));}
function activePlayer(room){return room.players[room.currentPlayerIndex];}
function dealerTurn(room){
    room.phase="dealer";
    while(cardValue(room.dealer.cards)<17)room.dealer.cards.push(room.deck.pop());
    const dv=cardValue(room.dealer.cards);
    for(const p of room.players){
        if(p.status==="busted"||p.status==="stand"){
            const pv=cardValue(p.cards);
            if(p.status==="busted")p.result="Kaybettin";
            else if(isBlackjack(p.cards)&&!isBlackjack(room.dealer.cards)){p.chips+=Math.floor(p.bet*2.5);p.result="Blackjack! 3:2";}
            else if(isBlackjack(room.dealer.cards)&&!isBlackjack(p.cards))p.result="Krupiye blackjack";
            else if(isBlackjack(p.cards)&&isBlackjack(room.dealer.cards)){p.chips+=p.bet;p.result="Berabere";}
            else if(dv>21||pv>dv){p.chips+=p.bet*2;p.result="Kazandın";}
            else if(pv===dv){p.chips+=p.bet;p.result="Berabere";}
            else p.result="Kaybettin";
        }
    }
    room.message="El bitti. Yeni el 4 saniye içinde başlayacak.";room.phase="finished";broadcast(room);
    if(room.autoRoundTimer) clearTimeout(room.autoRoundTimer);
    room.autoRoundTimer=setTimeout(()=>{
        room.autoRoundTimer=null;
        if(!rooms[room.code]||room.players.length===0)return;
        const eligible=room.players.filter(p=>p.chips>0);
        if(eligible.length===0){room.message="Tüm oyuncuların çipi bitti.";broadcast(room);return;}
        newRound(room);
        // Keep each player's previous bet when affordable; otherwise use the minimum.
        for(const p of room.players){
            if(p.chips<=0){p.bet=0;p.status="out";continue;}
            p.bet=Math.min(Math.max(1,p.bet||10),p.chips);
        }
        startRound(room);
    },4000);
}
function nextPlayer(room){
    while(room.currentPlayerIndex<room.players.length-1){
        room.currentPlayerIndex++;
        if(activePlayer(room)?.status==="playing")return;
    }
    dealerTurn(room);
}
function startRound(room){
    room.deck=newDeck();room.dealer={cards:[room.deck.pop(),room.deck.pop()]};room.currentPlayerIndex=-1;room.phase="playing";
    for(const p of room.players){
        if(!p.bet||p.bet<1||p.bet>p.chips)p.bet=Math.min(10,p.chips);
        p.chips-=p.bet;p.cards=[room.deck.pop(),room.deck.pop()];p.status=isBlackjack(p.cards)?"stand":"playing";p.result="";
    }
    const first=room.players.findIndex(p=>p.status==="playing");
    if(first===-1)dealerTurn(room);else room.currentPlayerIndex=first;
    room.message="El başladı.";broadcast(room);
}
function newRound(room){
    for(const p of room.players){p.bet=Math.min(p.bet||10,p.chips);p.cards=[];p.status="waiting";p.result="";}
    room.phase="betting";room.message="Bahisleri ayarlayın ve hazır olun.";broadcast(room);
}


// ================= 101 OKEY =================
const okeyRooms={};

function okeyTileSet(){
  const a=[]; let id=0;
  for(let c=0;c<4;c++) for(let n=1;n<=13;n++) for(let k=0;k<2;k++)
    a.push({id:id++,color:c,num:n,falseJoker:false});
  a.push({id:id++,color:-1,num:0,falseJoker:true});
  a.push({id:id++,color:-1,num:0,falseJoker:true});
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
}
function okeyJoker(ind){return ind&&ind.color>=0?{color:ind.color,num:ind.num===13?1:ind.num+1}:null}
function okeyIsWild(t,j){return !!t&&!t.falseJoker&&!!j&&t.color===j.color&&t.num===j.num}
function okeyValue(t,j){return okeyIsWild(t,j)?0:(t.falseJoker&&j?j.num:t.num)}
function okeyKey(t){return `${t.color}:${t.num}:${t.falseJoker?1:0}`}
function okeyNorm(t,j){return t.falseJoker&&j?{color:j.color,num:j.num}:t}

function okeySortHand(hand,j){
  // Server never reorders after a player starts arranging manually.
  return hand;
}
function okeyCloneMelds(melds){return (melds||[]).map(m=>m.map(t=>({...t})))}

function runStart(tiles,j){
  if(tiles.length<3||tiles.length>13)return null;
  const norm=tiles.map(t=>okeyNorm(t,j));
  const real=norm.filter(t=>!okeyIsWild(t,j));
  if(!real.length)return null;
  const color=real[0].color;
  if(real.some(t=>t.color!==color))return null;
  const nums=real.map(t=>t.num);
  if(new Set(nums).size!==nums.length)return null;
  for(let start=1;start<=14-tiles.length;start++){
    const end=start+tiles.length-1;
    if(nums.every(n=>n>=start&&n<=end))return start;
  }
  return null;
}
function validRun(tiles,j){return runStart(tiles,j)!==null}
function validSet(tiles,j){
  if(tiles.length<3||tiles.length>4)return false;
  const n=tiles.map(t=>okeyNorm(t,j));
  const real=n.filter(t=>!okeyIsWild(t,j));
  if(!real.length)return false;
  const num=real[0].num;
  if(real.some(t=>t.num!==num))return false;
  const colors=real.map(t=>t.color);
  return new Set(colors).size===colors.length;
}
function validMeld(tiles,j){return validRun(tiles,j)||validSet(tiles,j)}
function meldValue(tiles,j){
  // Okey contributes the value it replaces. For normal validation this is
  // inferred from the surrounding run/set.
  if(validSet(tiles,j)){
    const real=tiles.map(t=>okeyNorm(t,j)).filter(t=>!okeyIsWild(t,j));
    const num=real[0]?.num||0;
    return tiles.length*num;
  }
  if(validRun(tiles,j)){
    const start=runStart(tiles,j);
    if(start===null)return 0;
    return Array.from({length:tiles.length},(_,i)=>start+i).reduce((a,b)=>a+b,0);
  }
  return 0;
}
function allPairs(tiles,j){
  if(tiles.length!==10)return false;
  const used=new Set();
  for(let i=0;i<tiles.length;i++){
    if(used.has(i))continue;
    const a=okeyNorm(tiles[i],j);
    let found=-1;
    for(let k=i+1;k<tiles.length;k++){
      if(used.has(k))continue;
      const b=okeyNorm(tiles[k],j);
      if(a.color===b.color&&a.num===b.num){found=k;break}
    }
    if(found<0)return false;
    used.add(i);used.add(found);
  }
  return true;
}
function selectedIdsUnique(ids){return [...new Set(ids.map(Number))]}
function findTiles(hand,ids){
  const set=new Set(ids); return hand.filter(t=>set.has(t.id));
}
function removeTiles(hand,ids){
  const set=new Set(ids); return hand.filter(t=>!set.has(t.id));
}
function totalOpenValue(melds,j){return (melds||[]).reduce((s,m)=>s+meldValue(m,j),0)}
function hasOpening(room,p){
  return !!p.opened;
}
function canOpenSeries(room,tiles){
  if(!tiles.length)return false;
  // A selection may contain multiple melds only when client sends groups.
  return tiles.every(m=>validMeld(m,room.joker));
}
function partitionMelds(tiles,j){
  const byId=new Map(tiles.map(t=>[t.id,t]));
  const memo=new Map();
  function rec(ids){
    const key=ids.slice().sort((a,b)=>a-b).join(",");
    if(memo.has(key))return memo.get(key);
    if(!ids.length)return [];
    if(ids.length<3){memo.set(key,null);return null}
    const first=ids[0];
    const rest=ids.slice(1);
    // Candidate groups containing the first tile. Try 4 before 3.
    const candidates=[];
    function combos(arr,n,start=0,p=[]){
      if(p.length===n){candidates.push([first,...p]);return}
      for(let i=start;i<arr.length;i++)combos(arr,n,i+1,p.concat(arr[i]));
    }
    combos(rest,3);combos(rest,2);
    for(const groupIds of candidates){
      const group=groupIds.map(id=>byId.get(id));
      if(!validMeld(group,j))continue;
      const left=ids.filter(id=>!groupIds.includes(id));
      const result=rec(left);
      if(result!==null){const out=[group,...result];memo.set(key,out);return out}
    }
    memo.set(key,null);return null;
  }
  return rec(tiles.map(t=>t.id));
}
function publicMelds(room){
  return (room.melds||[]).map((m,i)=>({
    id:i,
    ownerId:m.ownerId,
    ownerName:m.ownerName,
    type:m.type,
    tiles:m.tiles
  }));
}
function okeyPublic(room){
  return {
    roomCode:room.code,hostId:room.hostId,phase:room.phase,winner:room.winner||null,
    message:room.message,joker:room.joker,indicator:room.indicator,
    wallCount:room.wall.length,
    discard:room.discard.length?room.discard[room.discard.length-1]:null,
    discardPiles:(room.discardPiles||[[],[],[],[]]).map(p=>p.slice(-12)),
    currentPlayerId:room.players[room.turn]?.id||null,
    melds:publicMelds(room),
    players:room.players.map(p=>({
      id:p.id,name:p.name,count:p.hand.length,connected:p.connected,
      opened:!!p.opened,openValue:p.openValue||0,score:p.score||0,
      pairs:p.pairs||0
    }))
  };
}
function okeyStateFor(room,socketId){
  const base=okeyPublic(room);
  const me=room.players.find(p=>p.id===socketId);
  base.hand=me?me.hand:null;
  base.myId=socketId;
  base.myOpen=!!me?.opened;
  base.myOpenValue=me?.openValue||0;
  base.myPairs=me?.pairs||0;
  base.rackRows=me?.rackRows||[[],[]];
  return base;
}
function okeyBroadcast(room){for(const p of room.players)io.to(p.id).emit("okeyState",okeyStateFor(room,p.id))}
function okeyRoomFor(id){return Object.values(okeyRooms).find(r=>r.players.some(p=>p.id===id))}

function okeyStart(room){
  if(room.players.length!==4)return;
  const bag=okeyTileSet();
  const indIndex=bag.findIndex(t=>!t.falseJoker);
  room.indicator=bag.splice(indIndex,1)[0];
  room.joker=okeyJoker(room.indicator);
  room.wall=bag;room.discard=[];room.discardPiles=[[],[],[],[]];room.melds=[];room.phase="playing";
  room.turn=0;room.winner=null;
  room.players.forEach(p=>{
    p.hand=[];p.rackRows=[[],[]];p.opened=false;p.openValue=0;p.pairs=0;p.score=0;
  });
  // 101: 21 tiles each, starting player has 22 and discards first.
  for(let n=0;n<21;n++)for(const p of room.players)p.hand.push(room.wall.pop());
  room.players[0].hand.push(room.wall.pop());
  room.message=`Oyun başladı. ${room.players[0].name} 22 taşla başlıyor; ilk hamlede taş çekmeden taş atabilir.`;
  okeyBroadcast(room);
}
function okeyFinish(room,winner,kind="normal"){
  room.phase="finished";room.winner=winner.id;
  // Common 101 baseline scoring; variants can be added later.
  for(const p of room.players){
    if(p.id===winner.id){p.score-=101;continue}
    if(!p.opened)p.score+=202;
    else p.score+=p.hand.reduce((s,t)=>s+(okeyIsWild(t,room.joker)?30:t.num),0);
  }
  room.message=`${winner.name} ${kind==="okey"?"OKEY ATARAK ":""}bitirdi!`;
  okeyBroadcast(room);
}
function advanceTurn(room){
  room.turn=(room.turn+1)%4;
}
function requireTurn(room,socket){
  const p=room.players[room.turn];
  if(!p||p.id!==socket.id)return null;
  return p;
}
function resetOkeyRoom(room){
  room.phase="waiting";room.turn=-1;room.wall=[];room.discard=[];room.discardPiles=[[],[],[],[]];room.indicator=null;room.joker=null;
  room.melds=[];room.winner=null;room.message="Masa sıfırlandı. 4 oyuncu bekleniyor.";
  room.players.forEach(p=>{p.hand=[];p.opened=false;p.openValue=0;p.pairs=0;p.score=p.score||0});
}

io.on("connection",socket=>{

    socket.on("joinOkey",({roomCode,name})=>{
      roomCode=String(roomCode||"").trim().toUpperCase();
      name=String(name||"Oyuncu").trim().slice(0,16);
      if(!roomCode)return socket.emit("okeyError","Oda kodu gerekli.");
      const key="OKEY_"+roomCode;
      if(!okeyRooms[key])okeyRooms[key]={
        code:roomCode,players:[],phase:"waiting",hostId:null,wall:[],discard:[],discardPiles:[[],[],[],[]],
        turn:-1,message:"4 oyuncu bekleniyor.",indicator:null,joker:null,melds:[],winner:null
      };
      const room=okeyRooms[key];
      if(room.players.length>=4)return socket.emit("okeyError","Bu 101 Okey odası dolu (4 oyuncu).");
      if(room.players.some(p=>p.id===socket.id))return;
      room.players.push({id:socket.id,name,hand:[],rackRows:[[],[]],connected:true,opened:false,openValue:0,pairs:0,score:0});
      if(!room.hostId)room.hostId=socket.id;
      socket.join(key);
      socket.emit("okeyJoined",{roomCode});
      room.message=`${name} odaya katıldı. ${room.players.length}/4`;
      okeyBroadcast(room);
    });

    socket.on("okeyStart",()=>{
      const room=okeyRoomFor(socket.id);if(!room)return;
      if(room.hostId!==socket.id)return socket.emit("okeyError","Sadece oda sahibi oyunu başlatabilir.");
      if(room.phase==="playing")return;
      if(room.players.length!==4)return socket.emit("okeyError","101 Okey'i başlatmak için 4 oyuncu gerekli.");
      okeyStart(room);
    });

    socket.on("okeyArrange",({rows})=>{
      const room=okeyRoomFor(socket.id);if(!room||room.phase!=="playing")return;
      const p=room.players.find(x=>x.id===socket.id);if(!p)return;
      if(!Array.isArray(rows)||rows.length!==2)return;
      const ids=rows.flat().map(Number);
      const current=new Set(p.hand.map(t=>t.id));
      if(ids.length!==p.hand.length||new Set(ids).size!==ids.length||ids.some(id=>!current.has(id)))return;
      const byId=new Map(p.hand.map(t=>[t.id,t]));
      p.hand=ids.map(id=>byId.get(id));
      p.rackRows=[rows[0].map(Number),rows[1].map(Number)];
      okeyBroadcast(room);
    });

    socket.on("okeyDraw",()=>{
      const room=okeyRoomFor(socket.id);if(!room||room.phase!=="playing")return;
      const p=requireTurn(room,socket);if(!p)return;
      // First player starts with 22 and must discard without drawing.
      if(p.hand.length!==21)return socket.emit("okeyError","Bu tur taş çekemezsin. Önce elindeki taşı atmalısın.");
      const t=room.wall.pop();
      if(!t){room.phase="finished";room.message="Çekilecek taş kalmadı.";okeyBroadcast(room);return}
      p.hand.push(t);
      p.rackRows[1].push(t.id);
      room.message=`${p.name} ortadan taş çekti.`;
      okeyBroadcast(room);
    });

    socket.on("okeyTakeDiscard",()=>{
      const room=okeyRoomFor(socket.id);if(!room||room.phase!=="playing")return;
      const p=requireTurn(room,socket);if(!p)return;
      if(p.hand.length!==21)return socket.emit("okeyError","Bu tur zaten bir taşın var.");
      const toIndex=room.turn;
      const fromIndex=(toIndex+3)%4;
      const pile=room.discardPiles?.[fromIndex]||[];
      if(!pile.length)return socket.emit("okeyError","Sana atılmış bir taş yok.");
      const t=pile[pile.length-1];
      const globalIndex=room.discard.map(x=>x.id).lastIndexOf(t.id);
      if(globalIndex>=0)room.discard.splice(globalIndex,1);
      pile.pop();
      p.hand.push(t);p.rackRows[1].push(t.id);
      room.message=`${p.name}, ${room.players[fromIndex].name} oyuncusunun attığı taşı aldı.`;
      okeyBroadcast(room);
    });

    socket.on("okeyOpen",({tileIds,mode})=>{
      const room=okeyRoomFor(socket.id);if(!room||room.phase!=="playing")return;
      const p=requireTurn(room,socket);if(!p)return;
      if(p.opened)return socket.emit("okeyError","Elini zaten açtın. Bundan sonra taş işleyebilirsin.");
      const all=selectedIdsUnique(tileIds||[]);
      if(!all.length)return socket.emit("okeyError","Açmak için taşlarını seç.");
      const selected=findTiles(p.hand,all);
      if(selected.length!==all.length)return socket.emit("okeyError","Geçersiz taş seçimi.");
      if(p.hand.length-all.length<1)return socket.emit("okeyError","Bitiş taşı olarak en az 1 taş bırakmalısın.");

      let groups=null;
      if(mode==="pairs"){
        if(!allPairs(selected,room.joker))return socket.emit("okeyError","Çift açmak için tam 5 ayrı çift seçmelisin.");
        groups=[];
        for(let i=0;i<selected.length;i+=2)groups.push(selected.slice(i,i+2));
      }else{
        groups=partitionMelds(selected,room.joker);
        if(!groups)return socket.emit("okeyError","Seçtiğin taşlar geçerli perlere ayrılamıyor.");
        const value=totalOpenValue(groups,room.joker);
        if(value<101)return socket.emit("okeyError",`101 açmalısın. Seçimin ${value} puan ediyor.`);
        p.openValue=value;
      }

      p.opened=true;
      p.pairs=mode==="pairs"?5:0;
      for(const g of groups)room.melds.push({
        ownerId:p.id,ownerName:p.name,type:mode==="pairs"?"pair":"run",tiles:g
      });
      p.hand=removeTiles(p.hand,all);
      p.rackRows=p.rackRows.map(row=>row.filter(id=>!all.includes(Number(id))));
      room.message=`${p.name} ${mode==="pairs"?"5 çift":"101"} açtı${mode==="pairs"?"":" ("+p.openValue+")"}.`;
      okeyBroadcast(room);
    });

    socket.on("okeyLay",({tileIds,targetMeldId})=>{
      const room=okeyRoomFor(socket.id);if(!room||room.phase!=="playing")return;
      const p=requireTurn(room,socket);if(!p)return;
      if(!p.opened)return socket.emit("okeyError","Önce elini açmalısın.");
      const ids=selectedIdsUnique(tileIds||[]);
      if(!ids.length)return;
      const tiles=findTiles(p.hand,ids);
      const idx=Number(targetMeldId);
      const target=room.melds[idx];
      if(!target||tiles.length!==ids.length)return socket.emit("okeyError","Geçersiz işleme.");
      if(p.hand.length-tiles.length<1)return socket.emit("okeyError","Bitiş taşı olarak en az 1 taş bırakmalısın.");
      const candidate=target.tiles.concat(tiles);
      if(!validMeld(candidate,room.joker))return socket.emit("okeyError","Bu taş o per'e işlenemez.");
      target.tiles=candidate;
      p.hand=removeTiles(p.hand,ids);
      p.rackRows=p.rackRows.map(row=>row.filter(id=>!ids.includes(Number(id))));
      room.message=`${p.name} masaya taş işledi.`;
      okeyBroadcast(room);
    });

    socket.on("okeyDiscard",tileId=>{
      const room=okeyRoomFor(socket.id);if(!room||room.phase!=="playing")return;
      const p=requireTurn(room,socket);if(!p)return;
      if(p.hand.length<1||p.hand.length>22)return socket.emit("okeyError","Taş atmak için uygun sayıda taşın olmalı.");
      const idx=p.hand.findIndex(t=>t.id===Number(tileId));if(idx<0)return;
      const t=p.hand[idx];
      // First player may start by discarding from 22; other players arrive here with 22 after drawing.
      p.hand.splice(idx,1);
      p.rackRows=p.rackRows.map(row=>row.filter(id=>Number(id)!==t.id));
      room.discard.push(t);
      const fromIndex=room.turn;
      if(!room.discardPiles)room.discardPiles=[[],[],[],[]];
      room.discardPiles[fromIndex].push(t);
      if(p.hand.length===0){okeyFinish(room,p,okeyIsWild(t,room.joker)?"okey":"normal");return}
      room.turn=(room.turn+1)%4;
      room.message=`${p.name} taş attı. Sıra ${room.players[room.turn].name}.`;
      okeyBroadcast(room);
    });

    socket.on("okeyReset",()=>{
      const room=okeyRoomFor(socket.id);if(!room)return;
      if(room.hostId!==socket.id)return socket.emit("okeyError","Sadece oda sahibi masayı sıfırlayabilir.");
      resetOkeyRoom(room);okeyBroadcast(room);
    });

    socket.on("joinRoom",({roomCode,name})=>{
        roomCode=String(roomCode||"").trim().toUpperCase();name=String(name||"Oyuncu").trim().slice(0,16);
        if(!roomCode)return socket.emit("errorMessage","Oda kodu gerekli.");
        if(!rooms[roomCode])rooms[roomCode]={code:roomCode,players:[],deck:[],dealer:{cards:[]},phase:"betting",currentPlayerIndex:-1,message:"Bahisleri ayarlayın."};
        const room=rooms[roomCode];
        if(room.players.length>=MAX_PLAYERS)return socket.emit("errorMessage","Bu oda dolu (5 oyuncu).");
        if(room.phase==="playing"||room.phase==="dealer")return socket.emit("errorMessage","Bu el başladı. Bir sonraki eli bekleyin.");
        socket.join(roomCode);room.players.push({id:socket.id,name,chips:STARTING_CHIPS,bet:10,cards:[],status:"waiting",result:""});
        if (!room.hostId) room.hostId = socket.id;
        socket.emit("joined",{roomCode});room.message=`${name} odaya katıldı.`;broadcast(room);
    });
    socket.on("setBet",amount=>{
        const room=Object.values(rooms).find(r=>r.players.some(p=>p.id===socket.id));if(!room||room.phase!=="betting")return;
        const p=room.players.find(p=>p.id===socket.id);amount=Math.floor(Number(amount));
        if(!Number.isFinite(amount)||amount<1||amount>p.chips)return;p.bet=amount;broadcast(room);
    });
    socket.on("startRound",()=>{
        const room=Object.values(rooms).find(r=>r.players.some(p=>p.id===socket.id));
        if(!room||room.phase!=="betting")return;
        if(room.hostId!==socket.id){
            return socket.emit("errorMessage","Sadece oda sahibi eli başlatabilir.");
        }
        const p=room.players.find(p=>p.id===socket.id);
        if(!p||p.chips<=0)return socket.emit("errorMessage","Çiplerin bitti. Yeni el başlatamazsın.");
        startRound(room);
    });
    socket.on("hit",()=>{
        const room=Object.values(rooms).find(r=>r.players.some(p=>p.id===socket.id));if(!room||room.phase!=="playing")return;
        const p=activePlayer(room);if(!p||p.id!==socket.id)return;p.cards.push(room.deck.pop());
        if(cardValue(p.cards)>21){p.status="busted";p.result="21'i geçtin";nextPlayer(room);}
        else if(cardValue(p.cards)===21){p.status="stand";nextPlayer(room);}broadcast(room);
    });
    socket.on("stand",()=>{
        const room=Object.values(rooms).find(r=>r.players.some(p=>p.id===socket.id));if(!room||room.phase!=="playing")return;
        const p=activePlayer(room);if(!p||p.id!==socket.id)return;p.status="stand";nextPlayer(room);broadcast(room);
    });
    socket.on("double",()=>{
        const room=Object.values(rooms).find(r=>r.players.some(p=>p.id===socket.id));if(!room||room.phase!=="playing")return;
        const p=activePlayer(room);if(!p||p.id!==socket.id||p.cards.length!==2||p.chips<p.bet)return;
        p.chips-=p.bet;p.bet*=2;p.cards.push(room.deck.pop());
        if(cardValue(p.cards)>21){p.status="busted";p.result="21'i geçtin";}else p.status="stand";nextPlayer(room);broadcast(room);
    });
    socket.on("nextRound",()=>{
        const room=Object.values(rooms).find(r=>r.players.some(p=>p.id===socket.id));if(!room||room.phase!=="finished")return;newRound(room);
    });
    socket.on("resetLobby",()=>{
        const room=Object.values(rooms).find(r=>r.players.some(p=>p.id===socket.id));
        if(!room)return;
        if(room.hostId!==socket.id)return socket.emit("errorMessage","Sadece oda sahibi lobiyi sıfırlayabilir.");
        room.deck=[];
        room.dealer={cards:[]};
        room.phase="betting";
        room.currentPlayerIndex=-1;
        room.message="Lobi sıfırlandı. Yeni el için oda sahibi başlatabilir.";
        for(const p of room.players){
            p.chips=STARTING_CHIPS;p.bet=10;p.cards=[];p.status="waiting";p.result="";
        }
        broadcast(room);
    });
    // Okey disconnect
    for(const key in okeyRooms){
      const r=okeyRooms[key], leaving=r.players.find(p=>p.id===socket.id);
      if(!leaving)continue;
      r.players=r.players.filter(p=>p.id!==socket.id);
      if(r.players.length===0){delete okeyRooms[key];continue}
      if(r.hostId===socket.id)r.hostId=r.players[0].id;
      r.phase="waiting";r.turn=-1;r.message=`${leaving.name} ayrıldı. 4 oyuncu yeniden bekleniyor.`;r.players.forEach(p=>p.hand=[]);okeyBroadcast(r);
    }

    socket.on("disconnect",()=>{
        for(const code in rooms){
            const room=rooms[code],leaving=room.players.find(p=>p.id===socket.id);if(!leaving)continue;
            room.players=room.players.filter(p=>p.id!==socket.id);
            if(room.players.length>0 && room.hostId===socket.id) room.hostId=room.players[0].id;
            if(room.players.length===0)delete rooms[code];else{room.message=`${leaving.name} ayrıldı.`;broadcast(room);}
        }
    });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT,()=>console.log(`Blackjack sunucusu ${PORT} portunda çalışıyor.`));
