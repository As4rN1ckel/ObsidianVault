"""Biome pools, guardians, enemy ability execution, gold flags and Warden phases."""
import sys
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8000');page.locator('#new-character').click();page.locator('#begin-run').click()
 page.evaluate('''() => {
 const assert=(v,m)=>{if(!v)throw Error(m)};
 assert(BALANCE.maxFloor===10&&BALANCE.damagePerAttribute===.4,'balance');
 for(let floor=1;floor<=10;floor++){
  const biome=biomeForFloor(floor),kind=guardianKind(floor);
  assert(biome.id===(floor<=5?'plains':'forest'),'biome boundary');
  for(let i=0;i<100;i++){
   const e=generateMonster(floor);assert(biome.enemies.includes(e.id)&&e.kind==='normal','normal pool');
   assert(e.abilities.length===1&&INTENTS[e.abilities[0]],'normal ability');
   const guardian=generateBoss(floor);assert(guardian.kind===kind,'guardian kind');
   if(kind==='elite'){
    assert(biome.elitePool.includes(guardian.id)&&guardian.abilities.length===2,'elite pool');
    const ordinary=instantiateEnemy(ENEMY_TYPES.find(e=>e.id===guardian.id),floor);
    assert(guardian.hp>ordinary.hp&&guardian.damage>=ordinary.damage,'elite stats');
    assert(LOOT[guardian.lootId],'elite loot');
   }
   assert(generateFloorLayout(floor)[9]===(kind==='elite'?'elite':'boss'),'guardian room');
  }
 }
 assert(generateBoss(5).id==='packLeader'&&generateBoss(10).id==='treantGuardian','bosses');
 let rejected=false;try{generateMonster(11);}catch(e){rejected=true;}assert(rejected,'no floor 11');
 const originalRandom=Math.random;Math.random=()=>.99;
 function fixture(id,floor=1){
  cancelPendingActions();gameState.started=true;gameState.paused=false;gameState.gameOver=false;gameState.lootOpen=false;gameState.floorTransitioning=false;
  gameState.player=makePlayer('Enemy Tester','fighter','human');const p=gameState.player;
  Object.assign(p,{hp:1000,maxHp:1000,resource:100,maxResource:100,defense:0,blockChance:0,dodgeChance:0,poisonTurns:0});
  const template=[...ENEMY_TYPES,...BOSSES].find(e=>e.id===id),e=instantiateEnemy(template,floor);
  e.hp=e.maxHp;gameState.currentEnemy=e;gameState.inCombat=true;gameState.turnPending=true;gameState.floor=floor;gameState.room=2;gameState.combat={owner:'enemy',playerTurns:1,enemyTurns:0,playerNext:100,enemyNext:100};return [p,e];
 }
 let [p,e]=fixture('wolf');e.intent='pounce';resolveEnemyAction();assert(p.hp<1000,'pounce damage');
 [p,e]=fixture('boar');e.intent='charge';resolveEnemyAction();assert(p.hp===1000&&e.intent==='trample','charge telegraph');resolveEnemyAction();assert(p.hp<1000&&!e.charged,'charge hit');
 [p,e]=fixture('slime');e.intent='gel';resolveEnemyAction();assert(e.armorHits===2&&e.armorBonus===2,'slime armor');
 [p,e]=fixture('windSprite');e.intent='gust';resolveEnemyAction();assert(gameState.combat.playerNext>100,'gust delay');
 for(const [id,ability,turns] of [['rat','infectedBite',2],['spider','venom',3]]){
  [p,e]=fixture(id);e.intent=ability;resolveEnemyAction();assert(p.poisonTurns===turns&&p.poisonDamage===2,'enemy poison');
 }
 for(const [id,ability] of [['stirge','bloodsuck'],['carnivorePlant','devour']]){
  [p,e]=fixture(id,6);e.hp-=10;const hp=e.hp;e.intent=ability;resolveEnemyAction();assert(e.hp>hp&&p.hp<1000,'drain');
 }
 [p,e]=fixture('vineBlight',6);e.intent='constrict';resolveEnemyAction();assert(p.resource===98,'vine resource drain');
 [p,e]=fixture('forestSprite',6);e.hp-=20;const hp=e.hp;e.intent='regrowth';resolveEnemyAction();assert(e.hp>hp&&p.hp===1000,'sprite heal');
 [p,e]=fixture('packLeader',5);const damage=e.damage;e.intent='packHowl';resolveEnemyAction();assert(e.damage===Math.round(damage*1.2)&&e.usedAbilities.includes('packHowl'),'alpha howl');
 Math.random=()=>0;for(let i=0;i<10;i++){selectEnemyIntent(e);assert(e.intent!=='packHowl','one-use howl');}Math.random=()=>.99;
 [p,e]=fixture('treantGuardian',10);e.hp-=20;const barkHp=e.hp;e.intent='livingBark';resolveEnemyAction();assert(e.hp>barkHp&&e.armorHits===2,'warden bark');
 const pre=e.damage;e.hp=Math.floor(e.maxHp*.5);refreshEnemyIntent();
 assert(e.phase===2&&e.damage===Math.round(pre*1.15)&&e.armorHits===0&&e.intent==='awakening','phase change');
 const playerHp=p.hp;resolveEnemyAction();assert(p.hp===playerHp&&!e.phaseTransitionPending,'awakening downtime');
 refreshEnemyIntent();assert(e.damage===Math.round(pre*1.15),'phase changes once');
 assert(!e.abilities.includes('livingBark')&&e.abilities.includes('wildRoots'),'unique skill replaced');
 e.intent='wildRoots';resolveEnemyAction();assert(p.resource===97,'phase 2 skill');
 [p,e]=fixture('treantGuardian',10);e.hp=Math.floor(e.maxHp*.5)+1;e.dots.poison={damage:2,turns:1};e.intent='constrict';resolveEnemyAction();assert(e.phase===2&&p.hp===1000,'DoT phase trigger consumes action');
 [p,e]=fixture('rat');p.dodgeReady=true;e.intent='infectedBite';resolveEnemyAction();assert(p.poisonTurns===0,'dodge prevents poison');
 [p,e]=fixture('wolf');assert(enemyGold(e)===0,'default gold off');
 LOOT.wolf.goldAmount=10;assert(enemyGold(e)===0,'amount alone not enough');LOOT.wolf.goldDrop=true;assert(enemyGold(e)===10,'explicit flag enables');
 const gold=p.gold;e.hp=0;enemyDefeated();assert(p.gold===gold+10,'flagged battle gold');LOOT.wolf.goldDrop=false;LOOT.wolf.goldAmount=0;
 [p,e]=fixture('wolf');e.hp=0;enemyDefeated();assert(p.gold===0&&gameState.lootOpen,'no automatic kill gold');
 // Warden loot must be resolved before manual Continue triggers the win, never floor 11.
 [p,e]=fixture('treantGuardian',10);gameState.room=10;e.hp=0;enemyDefeated();
 assert(!gameState.gameOver&&gameState.lootOpen,'final loot before victory');gameState.pendingLoot=[];finishLoot();assert(gameState.gameOver&&gameState.floor===10,'floor 10 victory');
 Math.random=originalRandom;
 }''')
 page.get_by_text('The Warden has fallen',exact=True).wait_for()
 assert not errors,errors
 b.close()
print('PASS: biome boundaries, 1,000 encounter samples, elite scaling/loot, every enemy ability, alpha howl, Warden phases/telegraph/DoT transition, gold flags, floor-10 victory; no JS errors.')
