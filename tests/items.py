"""Equipment progression, capacity, special effects, inventory UI,."""
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8000');page.locator('#new-character').click();page.locator('#begin-run').click()
 page.evaluate('''() => {
 const assert=(v,m)=>{if(!v)throw Error(m)};
 for(const [cls,weapon,damage] of [['fighter','practiceBlade',3.5],['rogue','butchersKnife',3],['wizard','branchStaff',3]]){
  const p=makePlayer('Starter',cls,'human');assert(p.equipment.weapon.id===weapon&&p.equipment.weapon.weaponDamage===damage,'starter weapon');assert(p.backpackSlots===8&&p.equipment.backpack.id==='pouchBelt','starter pouch');
 }
 let p=gameState.player;
 for(const [id,capacity] of [[null,2],['pouchBelt',8],['canvasSatchel',10],['merchantsSack',12],['scoutPack',14],['travelersPack',18]]){
  p.equipment.backpack=id?createItem(id):null;recalculate(p);assert(p.backpackSlots===capacity,'capacity '+id);
 }
 p.equipment.backpack=createItem('pouchBelt');recalculate(p);
 p.inventory=Array.from({length:8},()=>createItem('cloth'));gameState.panel='inventory';
 unequip('backpack');assert(p.equipment.backpack?.id==='pouchBelt'&&p.inventory.length===8,'overflow blocked');
 p.inventory[0]=createItem('canvasSatchel');const uid=p.inventory[0].uid;equip(uid);assert(p.backpackSlots===10&&p.inventory.length===8,'backpack swap');
 p.inventory=[createItem('pouchBelt'),...Array.from({length:9},()=>createItem('cloth'))];equip(p.inventory[0].uid);assert(p.backpackSlots===10&&p.inventory[0].id==='pouchBelt','smaller pack overflow blocked');
 p.inventory=[];unequip('backpack');assert(p.backpackSlots===2&&p.inventory.length===1,'pack itself takes a carried slot');
 p.inventory=[];assert(addLoot({...createItem('cloth'),quantity:20}),'two stacks fit');assert(!addLoot(createItem('practiceBlade')),'bare capacity');
 assert(addLoot(createItem('potion'))&&p.potions===1,'belt independent');
 // Every equipment definition is reachable by floor 20, but future gear cannot drop at 10.
 const all=Object.values(ITEMS).filter(i=>i.slot&&i.slot!=='consumable');
 assert(all.length===37&&BALANCE.maxFloor===10,'catalog and dungeon scope');
 for(let floor=1;floor<=20;floor++)assert(equipmentPool(floor).every(id=>ITEMS[id].minFloor<=floor),'floor gate');
 assert(!equipmentPool(10).includes('travelersPack')&&equipmentPool(20).includes('travelersPack'),'future pack');
 for(const type of ['sword','dagger','staff']){const list=all.filter(i=>i.type===type&&!i.onHit&&i.name!=="Blacksmith's War Blade");assert(list.every((i,n)=>!n||i.weaponDamage>list[n-1].weaponDamage),'weapon progression');}
 // Fourth slot is usable; removing its source requires choosing which ability to unslot.
 p=makePlayer('Mage','wizard','human');gameState.player=p;p.perks=['unlock1','unlock2'];p.equipment.weapon=createItem('ritualOakStaff');recalculate(p);p.equippedSkills=['wizard','arcaneBolt','manaSurge'];gameState.panel='talents';
 toggleSkill('manaBurn');assert(p.equippedSkills.length===4&&p.skillSlots===4,'fourth slot');
 gameState.panel='inventory';p.inventory=[createItem('branchStaff')];equip(p.inventory[0].uid);assert(p.equipment.weapon.id==='ritualOakStaff','swap slot guard');unequip('weapon');assert(p.equipment.weapon.id==='ritualOakStaff','unequip slot guard');
 gameState.panel='talents';toggleSkill('manaBurn');gameState.panel='inventory';equip(p.inventory[0].uid);assert(p.skillSlots===3,'slot removed safely');
 saveCharacter(false);const mageId=gameState.characterId;loadCharacter(mageId);p=gameState.player;
 assert(p.skillSlots===3,'normal slots survive save');
 const baseMana=p.maxResource;p.equipment.accessory=createItem('manaWellPendant');recalculate(p);assert(p.maxResource===baseMana+6&&p.resourceRegen===3,'mana bonuses');
 p.resource=0;Object.assign(gameState,{inCombat:true,currentEnemy:{hp:500,speed:10},combat:{owner:null,playerTurns:0,playerNext:1,enemyNext:20},paused:false,gameOver:false,turnPending:true});continueCombat();assert(p.resource===3,'actual mana regeneration');
 gameState.inCombat=false;gameState.currentEnemy=null;gameState.combat=null;gameState.turnPending=false;
 p=makePlayer('Fighter','fighter','human');const stamina=p.maxResource;p.equipment.accessory=createItem('manaWellPendant');recalculate(p);assert(p.maxResource===stamina&&p.resourceRegen===2,'no stamina bonus');
 p.equipment.weapon=createItem('blacksmithsWarBlade');recalculate(p);assert(p.speed===8&&p.armorPenetration===.4,'war blade stats');
 const enemy={hp:500,maxHp:500,defense:10,armorHits:0,armorBonus:0,dots:{}};gameState.player=p;gameState.currentEnemy=enemy;
 assert(skillHit(20,0,true)===14,'physical penetration');assert(skillHit(20,0)===10,'no spell penetration');
 p=makePlayer('Poison','rogue','human');p.equipment.weapon=createItem('alchemistsVialDagger');recalculate(p);gameState.player=p;
 Object.assign(gameState,{inCombat:true,paused:false,panel:null,gameOver:false,turnPending:false,currentEnemy:enemy,combat:{owner:'player',playerTurns:1,enemyTurns:0,playerNext:20,enemyNext:20}});
 playerAttack();cancelPendingActions();assert(enemy.dots.weaponPoison?.turns===3,'weapon poison');const hp=enemy.hp;tickEnemyEffects(enemy);assert(enemy.hp<hp&&enemy.dots.weaponPoison.turns===2,'poison ticks');
 gameState.inCombat=false;gameState.combat=null;gameState.currentEnemy=null;gameState.turnPending=false;
 p.inventory=[createItem('alchemistsVialDagger'),createItem('blacksmithsWarBlade'),createItem('leatherJerkin'),createItem('manaWellPendant'),createItem('scrap')];openPanel('inventory');
 assert(inventoryMarkup(p).includes('Weapons · 2'),'inventory grouping');assert(itemDescription(ITEMS.blacksmithsWarBlade).includes('-2 Speed')&&!itemDescription(ITEMS.blacksmithsWarBlade).includes('+-'),'signed modifiers');
 }''')
 page.set_viewport_size({'width':375,'height':812})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert page.locator('.equipment-slot').count()==5
 page.screenshot(path='/tmp/obsidian-inventory.png',full_page=True)
 assert not errors,errors
 b.close();print('PASS: catalog, starting gear, backpack safety, special effects, fourth skill slot, inventory UI and mobile width')
