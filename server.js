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


// ================= OKEY =================
const okeyRooms={};
function okeyTileSet(){
  const a=[]; let id=0;
  for(let c=0;c<4;c++) for(let n=1;n<=13;n++) for(let k=0;k<2;k++) a.push({id:id++,color:c,num:n,falseJoker:false});
  a.push({id:id++,color:-1,num:0,falseJoker:true},{id:id++,color:-1,num:0,falseJoker:true});
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
}
function okeyJoker(ind){ if(!ind||ind.color<0)return null; return {color:ind.color,num:ind.num===13?1:ind.num+1}; }
function okeyIsWild(t,j){return !t.falseJoker&&j&&t.color===j.color&&t.num===j.num;}
function okeyNormalize(t,j){return t.falseJoker&&j?{color:j.color,num:j.num}:t;}
function tileKey(t){return t.color+":"+t.num}
function handCanWin(hand,joker){
  if(hand.length!==14)return false;
  const norm=hand.map(t=>okeyNormalize(t,joker));
  let wild=0; const counts={};
  for(const t of norm){
    if(okeyIsWild(t,joker)) wild++;
    else {const k=tileKey(t);counts[k]=(counts[k]||0)+1;}
  }
  const serialize=(c,w)=>Object.keys(c).sort().map(k=>k+"x"+c[k]).join(",")+"|"+w;
  const groupMemo=new Map();
  function canGroups(c,w){
    const memoKey=serialize(c,w); if(groupMemo.has(memoKey))return groupMemo.get(memoKey);
    const keys=Object.keys(c).filter(k=>c[k]>0).sort((x,y)=>{
      const [xc,xn]=x.split(":").map(Number),[yc,yn]=y.split(":").map(Number);
      return xc-yc||xn-yn;
    });
    if(!keys.length){const ok=w%3===0;groupMemo.set(memoKey,ok);return ok;}
    const first=keys[0], [fc,fn]=first.split(":").map(Number);
    const tryGroup=(tiles)=>{
      let missing=0;const used=[];
      for(const t of tiles){const k=tileKey(t);if((c[k]||0)>0){used.push(k)}else missing++;}
      if(missing>w)return false;
      const nc={...c};
      used.forEach(k=>{nc[k]--;if(nc[k]===0)delete nc[k]});
      return canGroups(nc,w-missing);
    };
    // Same number, distinct colors.
    const colors=[0,1,2,3].filter(cc=>(c[cc+":"+fn]||0)>0);
    const combos=(arr,n,start=0,prefix=[],out=[])=>{
      if(prefix.length===n){out.push(prefix);return out;}
      for(let i=start;i<arr.length;i++)combos(arr,n,i+1,prefix.concat(arr[i]),out);
      return out;
    };
    for(const size of [4,3]){
      for(const cs of combos([0,1,2,3],size)){
        if(!cs.includes(fc))continue;
        if(tryGroup(cs.map(cc=>({color:cc,num:fn})))){groupMemo.set(memoKey,true);return true;}
      }
    }
    // Same color sequence, length 3 or 4, no 13->1 wrap.
    for(const len of [3,4]){
      for(let start=Math.max(1,fn-len+1);start<=Math.min(fn,14-len);start++){
        if(fn<start||fn>start+len-1)continue;
        const seq=Array.from({length:len},(_,i)=>({color:fc,num:start+i}));
        if(tryGroup(seq)){groupMemo.set(memoKey,true);return true;}
      }
    }
    groupMemo.set(memoKey,false);return false;
  }
  // Seven pairs.
  if(wild===0){
    const vals=Object.values(counts);
    if(Object.keys(counts).length===7&&vals.every(v=>v===2))return true;
  }
  const keys=Object.keys(counts);
  // Concrete pair.
  for(const k of keys){
    if(counts[k]>=2){
      const c={...counts};c[k]-=2;if(c[k]===0)delete c[k];
      if(canGroups(c,wild))return true;
    }
  }
  // One concrete + one wild.
  if(wild>=1){
    for(const k of keys){
      const c={...counts};c[k]--;if(c[k]===0)delete c[k];
      if(canGroups(c,wild-1))return true;
    }
  }
  // Two wilds as the pair.
  if(wild>=2&&canGroups({...counts},wild-2))return true;
  return false;
}
function okeyPublic(room){
  return {roomCode:room.code,hostId:room.hostId,phase:room.phase,message:room.message,
    joker:room.joker,indicator:room.indicator,wallCount:room.wall.length,
    discard:room.discard.length?room.discard[room.discard.length-1]:null,
    currentPlayerId:room.players[room.turn]?.id||null,
    players:room.players.map(p=>({id:p.id,name:p.name,count:p.hand.length,connected:p.connected})),
    myHands:room.players.map(p=>p.id===room.socketMap?null:null)
  };
}
function okeyStateFor(room,socketId){
  const base=okeyPublic(room); const me=room.players.find(p=>p.id===socketId);
  base.hand=me?me.hand:null;
  base.myId=socketId;
  return base;
}
function okeyBroadcast(room){for(const p of room.players)io.to(p.id).emit("okeyState",okeyStateFor(room,p.id));}
function okeyRoomFor(id){return Object.values(okeyRooms).find(r=>r.players.some(p=>p.id===id))}
function okeyStart(room){
  if(room.players.length!==4)return null;
  const bag=okeyTileSet(); const indIndex=bag.findIndex(t=>!t.falseJoker);room.indicator=bag.splice(indIndex,1)[0];room.joker=okeyJoker(room.indicator);room.wall=bag;
  room.discard=[]; room.phase="playing";room.turn=0;room.message="Oyun başladı. Sırası olan oyuncu taş çekebilir.";
  room.players.forEach(p=>p.hand=[]);
  for(let n=0;n<14;n++)for(const p of room.players)p.hand.push(room.wall.pop());
  room.players[0].hand.push(room.wall.pop()); // dealer starts with 15
  room.players.forEach(p=>p.hand.sort(okeySort(room.joker)));
  okeyBroadcast(room);
}
function okeySort(j){return (a,b)=>{const aa=okeyNormalize(a,j),bb=okeyNormalize(b,j);return aa.color-bb.color||aa.num-bb.num}}
function okeyFinish(room,winner){
  room.phase="finished";room.winner=winner.id;room.message=`${winner.name} oyunu kazandı!`;okeyBroadcast(room);
}

io.on("connection",socket=>{

    socket.on("joinOkey",({roomCode,name})=>{
      roomCode=String(roomCode||"").trim().toUpperCase();name=String(name||"Oyuncu").trim().slice(0,16);
      if(!roomCode)return socket.emit("okeyError","Oda kodu gerekli.");
      const key="OKEY_"+roomCode;
      if(!okeyRooms[key])okeyRooms[key]={code:roomCode,players:[],phase:"waiting",hostId:null,wall:[],discard:[],turn:-1,message:"4 oyuncu bekleniyor.",indicator:null,joker:null};
      const room=okeyRooms[key];
      if(room.players.length>=4)return socket.emit("okeyError","Bu Okey odası dolu (4 oyuncu).");
      if(room.players.some(p=>p.id===socket.id))return;
      room.players.push({id:socket.id,name,hand:[],connected:true});
      if(!room.hostId)room.hostId=socket.id;
      socket.join(key);socket.emit("okeyJoined",{roomCode});room.message=`${name} odaya katıldı. ${room.players.length}/4`;okeyBroadcast(room);
    });
    socket.on("okeyStart",()=>{
      const room=okeyRoomFor(socket.id);if(!room)return;
      if(room.hostId!==socket.id)return socket.emit("okeyError","Sadece oda sahibi oyunu başlatabilir.");
      if(room.phase==="playing")return;
      if(room.players.length!==4)return socket.emit("okeyError","Okey'i başlatmak için 4 oyuncu gerekli.");
      okeyStart(room);
    });
    socket.on("okeyDraw",()=>{
      const room=okeyRoomFor(socket.id);if(!room||room.phase!=="playing")return;
      const p=room.players[room.turn];if(!p||p.id!==socket.id)return;
      if(p.hand.length!==14)return socket.emit("okeyError","Önce elindeki taşı atmalısın.");
      const t=room.wall.pop();if(!t){room.phase="finished";room.message="Ortadaki taşlar bitti.";okeyBroadcast(room);return}
      p.hand.push(t);p.hand.sort(okeySort(room.joker));room.message=`${p.name} taş çekti.`;okeyBroadcast(room);
    });
    socket.on("okeyTakeDiscard",()=>{
      const room=okeyRoomFor(socket.id);if(!room||room.phase!=="playing")return;
      const p=room.players[room.turn];if(!p||p.id!==socket.id)return;
      if(p.hand.length!==14)return socket.emit("okeyError","Önce elindeki taşı atmalısın.");
      if(!room.discard.length)return socket.emit("okeyError","Atılan taş yok.");
      p.hand.push(room.discard.pop());p.hand.sort(okeySort(room.joker));room.message=`${p.name} atılan taşı aldı.`;okeyBroadcast(room);
    });
    socket.on("okeyDiscard",tileId=>{
      const room=okeyRoomFor(socket.id);if(!room||room.phase!=="playing")return;
      const p=room.players[room.turn];if(!p||p.id!==socket.id)return;
      if(p.hand.length!==15)return socket.emit("okeyError","Önce taş çekmelisin.");
      const idx=p.hand.findIndex(t=>t.id===Number(tileId));if(idx<0)return;
      const t=p.hand.splice(idx,1)[0];room.discard.push(t);p.hand.sort(okeySort(room.joker));
      if(handCanWin(p.hand,room.joker)){okeyFinish(room,p);return}
      room.turn=(room.turn+1)%4;room.message=`${p.name} taş attı. Sıra ${room.players[room.turn].name}.`;okeyBroadcast(room);
    });
    socket.on("okeyReset",()=>{
      const room=okeyRoomFor(socket.id);if(!room)return;
      if(room.hostId!==socket.id)return socket.emit("okeyError","Sadece oda sahibi masayı sıfırlayabilir.");
      room.phase="waiting";room.turn=-1;room.wall=[];room.discard=[];room.indicator=null;room.joker=null;room.message="Masa sıfırlandı. 4 oyuncu bekleniyor.";room.players.forEach(p=>p.hand=[]);okeyBroadcast(room);
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
