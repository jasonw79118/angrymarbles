// PocketBase 0.40+ : access rules keep all card/deck data private.
migrate((app) => {
  const players = new Collection({
    type: 'auth', name: 'players',
    listRule: 'id = @request.auth.id', viewRule: 'id = @request.auth.id',
    createRule: '', updateRule: null, deleteRule: null,
    fields: [{type:'text',name:'name',required:true,min:2,max:24}],
    passwordAuth: {enabled:true,identityFields:['email']},
  });
  app.save(players);
  app.save(new Collection({
    type:'base', name:'am_stats',listRule:null,viewRule:null,createRule:null,updateRule:null,deleteRule:null,
    fields:[
      {type:'text',name:'userId',required:true,max:25},
      ...['games','wins','losses','bumps','assists'].map((name)=>({type:'number',name,min:0})),
    ],
    indexes:['CREATE UNIQUE INDEX idx_am_stats_user ON am_stats(userId)'],
  }));
  app.save(new Collection({
    type:'base',name:'am_rooms',listRule:null,viewRule:null,createRule:null,updateRule:null,deleteRule:null,
    fields:[
      {type:'text',name:'code',required:true,min:6,max:6},
      {type:'text',name:'hostId',required:true,max:25},
      {type:'select',name:'status',required:true,values:['waiting','playing','finished']},
      {type:'select',name:'visibility',required:true,values:['private','public']},
      {type:'select',name:'mode',required:true,values:['singles','doubles']},
      {type:'number',name:'capacity',required:true,min:1,max:8,onlyInt:true},
      {type:'text',name:'state',required:true},
    ],
    indexes:[
      'CREATE UNIQUE INDEX idx_am_rooms_code ON am_rooms(code)',
      'CREATE INDEX idx_am_rooms_status ON am_rooms(status,visibility,mode,capacity)',
    ]
  }));
}, (app) => {
  app.delete(app.findCollectionByNameOrId('am_rooms'));
  app.delete(app.findCollectionByNameOrId('am_stats'));
  app.delete(app.findCollectionByNameOrId('players'));
});
