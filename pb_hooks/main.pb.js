// JS hook handlers are isolated by PocketBase, so require modules within every handler.
routerAdd('GET','/api/angry-marbles/profile',e=>e.json(200,require(__hooks+'/controller.js').profile(e)),$apis.requireAuth('players'));
routerAdd('POST','/api/angry-marbles/name',e=>e.json(200,require(__hooks+'/controller.js').rename(e)),$apis.requireAuth('players'));
routerAdd('GET','/api/angry-marbles/public',e=>e.json(200,require(__hooks+'/controller.js').publicRooms(e)),$apis.requireAuth('players'));
routerAdd('POST','/api/angry-marbles/create',e=>e.json(200,require(__hooks+'/controller.js').create(e)),$apis.requireAuth('players'));
routerAdd('POST','/api/angry-marbles/join',e=>e.json(200,require(__hooks+'/controller.js').join(e)),$apis.requireAuth('players'));
routerAdd('GET','/api/angry-marbles/room/{code}',e=>e.json(200,require(__hooks+'/controller.js').view(e,e.request.pathValue('code'))),$apis.requireAuth('players'));
routerAdd('POST','/api/angry-marbles/countdown',e=>e.json(200,require(__hooks+'/controller.js').countdown(e)),$apis.requireAuth('players'));
routerAdd('POST','/api/angry-marbles/fill',e=>e.json(200,require(__hooks+'/controller.js').fill(e)),$apis.requireAuth('players'));
routerAdd('POST','/api/angry-marbles/color',e=>e.json(200,require(__hooks+'/controller.js').color(e)),$apis.requireAuth('players'));
routerAdd('POST','/api/angry-marbles/move',e=>e.json(200,require(__hooks+'/controller.js').move(e)),$apis.requireAuth('players'));
cronAdd('angry-marbles-fill','* * * * *',()=>require(__hooks+'/controller.js').cronFill());
