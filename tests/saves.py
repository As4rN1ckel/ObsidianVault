"""Character persistence, memorials, single-hit Block and turn preview regressions."""
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8000')
 page.get_by_role('button',name='Continue with Last Character').wait_for()
 assert page.get_by_role('button',name='Continue with Last Character').is_disabled()
 def new(name):
  page.locator('#new-character').click();page.locator('#hero-name').fill(name);page.locator('#begin-run').click()
 new('First <hero>')
 first=page.evaluate('gameState.characterId')
 page.evaluate('''() => {
 gameState.player.gold=123;gameState.floorLayout=['merchant'];gameState.room=1;
 showMerchant();gameState.merchantStock.potions=1;saveCharacter();returnToMenu();
 }''')
 new('Second hero');second=page.evaluate('gameState.characterId')
 assert first!=second
 page.reload();page.get_by_role('button',name='Continue with Last Character').click()
 assert page.evaluate('gameState.player.name')=='Second hero'
 page.evaluate('returnToMenu()');page.get_by_role('button',name='Load Character',exact=True).click()
 assert page.locator('.character-card').count()==2
 page.locator('.character-card').filter(has_text='First <hero>').get_by_role('button',name='Load Character').click()
 assert page.evaluate('gameState.player.gold===123&&gameState.merchantStock.potions===1')
 # Loot survives without generating another treasure reward.
 page.evaluate('''() => {gameState.lootTitle='Saved treasure';grantLoot('treasure');saveCharacter();}''')
 loot=page.evaluate('JSON.stringify(gameState.pendingLoot)')
 page.reload();page.get_by_role('button',name='Continue with Last Character').click()
 assert page.evaluate('JSON.stringify(gameState.pendingLoot)')==loot
 assert page.evaluate('gameState.player.gold')==123
 page.evaluate('''() => {
 gameState.lootOpen=false;gameState.pendingLoot=[];gameState.floorLayout=['enemy'];
 startCombat(generateMonster(1));cancelPendingActions();
 gameState.combat.owner='player';gameState.turnPending=false;
 gameState.player.dodgeChance=0;gameState.player.blockChance=0;
 gameState.player.blockHp=100;gameState.player.counterReady=true;
 gameState.currentEnemy.hp=gameState.currentEnemy.maxHp=1000;
 const original=Math.random;Math.random=()=>.5;
 enemyAttack();const hp=gameState.currentEnemy.hp;
 if(gameState.player.blockHp!==0||gameState.player.counterReady)throw Error('Block must be consumed');
 const before=gameState.player.hp;enemyAttack();
 if(gameState.currentEnemy.hp!==hp||gameState.player.hp>=before)throw Error('Repeated block/counter');
 Math.random=original;renderUI();renderCombatUI();saveCharacter();
 }''')
 saved=page.evaluate('JSON.stringify([gameState.player,gameState.currentEnemy,gameState.combat])')
 order=page.evaluate('nextTurnOrder()')
 assert len(order)==5 and order[0]=='player'
 assert page.locator('.turn-preview li').count()==5
 page.reload();page.get_by_role('button',name='Continue with Last Character').click()
 assert page.evaluate('JSON.stringify([gameState.player,gameState.currentEnemy,gameState.combat])')==saved
 assert page.evaluate('nextTurnOrder()')==order
 page.set_viewport_size({'width':375,'height':812})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.evaluate('gameState.player.hp=0;gameOver()')
 page.get_by_role('button',name='Main Menu',exact=True).last.click()
 page.get_by_role('button',name='Memorial',exact=True).click()
 assert page.locator('.character-card').filter(has_text='First <hero>').count()==1
 page.get_by_role('button',name='← Main Menu').click()
 page.get_by_role('button',name='Load Character',exact=True).click()
 assert page.locator('.character-card').count()==1
 page.evaluate(f'loadCharacter("{first}")')
 assert page.locator('.character-card').count()==1
 assert not page.evaluate('gameState.started')
 # Speed preview follows the same scheduling rule, including player-first ties.
 page.evaluate('''() => {
 gameState.player.speed=200;gameState.currentEnemy={speed:100};
 gameState.combat={owner:null,playerNext:1,enemyNext:1};
 if(nextTurnOrder().join()!=='player,enemy,player,player,enemy')throw Error('speed order');
 }''')
 assert not errors,errors
 browser.close()
 print('Character saves, memorials, Block, timeline, and mobile checks passed')
