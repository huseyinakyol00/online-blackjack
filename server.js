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

io.on("connection",socket=>{
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
