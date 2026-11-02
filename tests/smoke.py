"""Run against the local static server; requires Playwright and Chromium."""
import sys
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8000')
 page.get_by_role('heading',name='Create your Adventurer').wait_for()
 page.locator('input[value="wizard"]').check(force=True)
 page.locator('#begin-run').click()
 page.evaluate('''() => {
 const assert=(v,m)=>{if(!v)throw Error(m)},p=gameState.player;
 assert(p.maxHp===49&&p.damage===12&&p.maxResource===24,'new wizard stats');
 assert(!('tiers' in BALANCE),'tiers removed');
 p.ap=2;p.cp=1;const intellect=p.attributes.intellect;
 gameState.inCombat=true;openPanel('character');assert(!gameState.panel,'combat panel locked');
 gameState.panel='character';spendAttribute('intellect');learnPerk('training');
 assert(p.attributes.intellect===intellect&&p.cp===1,'combat spending blocked');gameState.panel=null;gameState.inCombat=false;
 const material=createItem('scrap');material.quantity=10;assert(addLoot(material),'stack10');
 addLoot(createItem('scrap'));assert(p.inventory.length===2&&p.inventory[0].quantity===10&&p.inventory[1].quantity===1,'stack split');
 const gold=p.gold;gameState.floorLayout=['merchant'];gameState.room=1;sellItem(p.inventory[0].uid);assert(p.gold>gold,'stack sale');
 p.inventory=Array.from({length:14},()=>createItem('sword'));
 gameState.lootTitle='Test';gameState.pendingLoot=[createItem('armor')];gameState.lootOpen=true;renderLoot();
 takeLoot(gameState.pendingLoot[0].uid);assert(gameState.pendingLoot.length===1,'full pack keeps loot');
 }''')
 page.locator('#inventory-button').click()
 page.locator('#management-panel').get_by_role('button',name='Discard',exact=True).first.click()
 page.get_by_role('button',name='Close',exact=True).click()
 page.get_by_role('button',name='Take',exact=True).click()
 assert page.evaluate('gameState.pendingLoot.length===0&&gameState.player.inventory.length===14')
 page.evaluate('''() => {
 gameState.lootOpen=false;gameState.floorLayout=['entrance','enemy'];gameState.room=2;
 gameState.player.inventory=[];gameState.player.hp=gameState.player.maxHp;
 startCombat(instantiateEnemy(ENEMY_TYPES[0],1));
 }''')
 page.wait_for_function('gameState.combat?.owner==="player"&&!gameState.turnPending')
 page.get_by_role('button',name='Arcane Bolt').click()
 assert page.evaluate('gameState.player.resource===17&&gameState.player.skillCooldowns.arcaneBolt===5')
 page.evaluate('''() => {
 cancelPendingActions();gameState.currentEnemy.hp=0;enemyDefeated();
 if(gameState.room!==2||!gameState.lootOpen||gameState.turnPending)throw Error('battle downtime');
 }''')
 page.wait_for_timeout(800)
 assert page.evaluate('gameState.room===2&&gameState.lootOpen')
 page.evaluate('''() => {
 const assert=(v,m)=>{if(!v)throw Error(m)};
 for(let seed=0;seed<200;seed++){gameState.runSeed=seed;for(let f=1;f<=30;f++){
 const a=generateFloorLayout(f),count=t=>a.filter(x=>x===t).length;
 assert(a.length===10&&a[0]==='entrance'&&a[9]==='boss','boundaries');
 assert(count('merchant')===1&&count('fountain')===1&&count('empty')===1,'special counts');
 assert(count('treasure')>=1&&count('treasure')<=2,'treasures');
 for(const t of ['merchant','fountain'])assert(a.indexOf(t)>=2&&a.indexOf(t)<=8,'placement');}}
 for(const enemy of ENEMY_TYPES){grantLoot(enemy.id);assert(gameState.pendingLoot.every(x=>x.kind==='material'||x.id==='potion'),'no normal gear');}
 for(const boss of BOSSES){grantLoot(boss.id);assert(gameState.pendingLoot.some(x=>x.slot&&x.slot!=='consumable'),'boss gear');}
 assert(SKILLS.wizard.cooldown===5&&SKILLS.arcaneBolt.cooldown===3,'cooldowns');
 }''')
 page.set_viewport_size({'width':375,'height':812})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 b.close()
print('PASS: new stats, combat locks, stacks/sales, full-backpack loot recovery, Arcane Bolt, battle downtime, enemy loot pools, 6,000 floor layouts, mobile width; no JS errors.')
