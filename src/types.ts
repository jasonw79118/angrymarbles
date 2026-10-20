export type Player = {id:string,name:string,seat:number,isBot:boolean,color:string,marbleCount:number,baseCount:number,handCount:number};
export type Piece = {id:string,seat:number,slot:number,loc:'base'|'track'|'run'|'home',progress:number,run:number};
export type Card = {id:string,rank:string,suit:string};
export type Move = {id:string,label:string,cardIndex:number,pieceIds?:string[];warnings?:string[]};
export type RoomState = {
  actions?:ConfirmedAction[],actionSeq?:number,botReadyAt?:number|null,
  code:string,mode:'singles'|'doubles',capacity:number,status:'waiting'|'playing'|'finished',
  fillAt:number|null,createdAt:number,hostId:string,visibility:string,startedCountdown:boolean,waitSeconds:number,
  preferredRelation:string,players:Player[],pieces:Piece[],mySeat:number|null,myHand:Card[],myMoves:Move[],
  turnSeat:number|null, dealerSeat:number|null, discards:number, deckCount:number,topDiscard:Card|null,
  log:string[],winners:number[]|null,track:number,trackPerSeat:number,boardSides?:number,run:number,marbles:number,turnNumber:number
};

export type ConfirmedAction = {
  warnings?:string[];
  id:string;seq:number;gameId:string;actorSeat:number;card:Card;discarded:boolean;label:string;at:number;
  ops:Array<{kind:'release'|'move'|'joker';piece:string;steps?:number;home?:string;target?:string}>;
  changes:Array<{from:Piece;to:Piece}>;baseCounts:Record<number,number>;turnNumber:number;turnSeat:number|null;
};
