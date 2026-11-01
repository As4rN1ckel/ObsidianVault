"""Run against a local HTTP server: python3 tests/smoke.py [base_url].
Requires Playwright and Chromium (no repository dependencies).
"""
import sys
from playwright.sync_api import sync_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8000'
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page()
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    assert page.goto(URL).status==200
    page.get_by_role('heading',name='Create your Adventurer').wait_for()
    page.locator('#hero-name').fill('Smoke Hero')
    page.locator('#begin-run').click()
    assert page.evaluate('gameState.player.inventory.length===0 && gameState.player.potions===0 && Object.values(gameState.player.equipment).filter(Boolean).length===1')
    # Exercise actual controls for deferred levelling and tree prerequisites.
    page.evaluate('gameState.player.xp=xpThreshold(1)+xpThreshold(2);checkLevelUp()')
    assert page.evaluate('gameState.player.level===3 && gameState.player.ap===4 && gameState.player.cp===2 && !gameState.paused')
    page.locator('#character-button').click()
    page.get_by_role('button',name='+1 · 1 AP').first.click()
    page.get_by_role('button',name='Learn · 1 CP').first.click()
    page.get_by_role('button',name='Learn · 1 CP').nth(1).click()
    assert page.evaluate('gameState.player.ap===3 && gameState.player.cp===0 && gameState.player.perks.includes("precision")')
    page.get_by_role('button',name='Close',exact=True).click()
    # Deterministic domain checks, including all floor layout constraints.
    page.evaluate('''() => {
      const assert=(v,m)=>{if(!v)throw Error(m)};
      for(let seed=0;seed<200;seed++){
        gameState.runSeed=seed;
        for(let f=1;f<=30;f++){
          const a=generateFloorLayout(f),count=t=>a.filter(x=>x===t).length;
          assert(a.length===10&&a[0]==='entrance'&&a[9]==='boss','floor boundaries');
          assert(count('merchant')===1&&count('fountain')===1&&count('empty')===1,'special counts');
          assert(count('treasure')>=1&&count('treasure')<=2,'treasure count');
          for(const t of ['merchant','fountain'])assert(a.indexOf(t)>=2&&a.indexOf(t)<=8,'special range');
        }
      }
      for(const c of Object.keys(CLASSES)){
        const p=makePlayer('Test',c,'human');
        assert(p.hp>0&&p.damage>0&&p.resource===p.maxResource,'class stats');
        const before=p.damage;p.attributes[p.equipment.weapon.mainAttribute]++;recalculate(p);assert(p.damage>before,'weapon scaling');
        const old=p.maxHp;p.equipment.accessory=createItem('charm',1);recalculate(p);assert(p.maxHp>old,'percent gear');
      }
      const p=gameState.player;
      gameState.floorLayout=generateFloorLayout(1);gameState.room=gameState.floorLayout.indexOf('merchant')+1;
      p.gold=10000;enterRoom();assert(gameState.merchantStock.potions>=2&&gameState.merchantStock.potions<=5,'stock bounds');
    }''')
    # Buy gear and use UI to equip, unequip, and sell it.
    page.get_by_role('button',name='Buy ·',exact=False).nth(1).click()
    assert page.evaluate('gameState.player.inventory.length===1')
    page.locator('#inventory-button').click()
    page.get_by_role('button',name='Equip',exact=True).click()
    page.get_by_role('button',name='Close',exact=True).click()
    page.evaluate('''() => {
      const assert=(v,m)=>{if(!v)throw Error(m)};const p=gameState.player,s=gameState.merchantStock;
      const n=s.potions;for(let i=0;i<n;i++)buyPotion();assert(s.potions===0,'finite potions');const g=p.gold;buyPotion();assert(p.gold===g,'sold out');
      const item=createItem('core');p.inventory.push(item);const gold=p.gold;sellItem(item.uid);assert(p.gold===gold+sellPrice(item),'sale');
      p.inventory=[];p.potions=BALANCE.potionSlots;for(let i=0;i<p.backpackSlots;i++)p.inventory.push(createItem('cloth'));assert(!canReceivePotion(),'capacity');assert(!addLoot(createItem('potion')),'overflow');
      p.inventory=[];p.potions=0;
    }''')
    # Failed backpack changes are atomic; potion storage round-trips safely.
    page.evaluate("""() => {
      const assert=(v,m)=>{if(!v)throw Error(m)};const p=gameState.player;
      openPanel('inventory');p.equipment.backpack=createItem('backpack',2);recalculate(p);
      const small=createItem('backpack',0);p.inventory=[small];
      while(p.inventory.length<22)p.inventory.push(createItem('cloth'));
      const equipped=p.equipment.backpack.uid;equip(small.uid);
      assert(p.equipment.backpack.uid===equipped&&p.inventory.length===22,'smaller pack overflow rejected');
      unequip('backpack');assert(p.equipment.backpack.uid===equipped,'full pack unequip rejected');
      p.inventory=[];unequip('backpack');assert(p.backpackSlots===14,'base pack restored');
      p.inventory=[];p.potions=1;stowPotion();assert(p.potions===0&&p.inventory[0].id==='potion','store potion');
      equip(p.inventory[0].uid);assert(p.potions===1&&p.inventory.length===0,'equip potion');
      closePanel();
    }""")
    # Start a real combat and exercise a class skill, resource cost, and next turn.
    page.evaluate('gameState.room=2;gameState.floorLayout[1]="enemy";enterRoom()')
    page.get_by_role('button',name='Block (').wait_for()
    page.wait_for_function('gameState.combat?.owner==="player" && !gameState.turnPending')
    resource=page.evaluate('gameState.player.resource')
    page.get_by_role('button',name='Block (').click()
    assert page.evaluate('gameState.player.resource')==resource-10
    page.wait_for_function('gameState.combat?.owner==="player" && !gameState.turnPending')
    assert page.evaluate('gameState.player.resource')>=resource-10
    page.locator('#character-button').click()
    hp=page.evaluate('gameState.player.hp')
    page.wait_for_timeout(700)
    assert page.evaluate('gameState.player.hp')==hp
    page.get_by_role('button',name='Close',exact=True).click()
    page.get_by_role('button',name='Basic Attack').click()
    # Floor 30 ends the run and never generates floor 31.
    page.evaluate('cancelPendingActions();gameState.inCombat=false;gameState.turnPending=false;gameState.floor=30;gameState.room=10;completeFloor()')
    page.get_by_text('The Vault is conquered',exact=True).wait_for()
    assert page.evaluate('gameState.gameOver && gameState.floor===30')
    page.get_by_role('button',name='Return to Character Hub').click()
    page.locator('#begin-run').click()
    assert page.evaluate('gameState.player.ap===0 && gameState.player.cp===0 && gameState.player.inventory.length===0 && gameState.player.potions===0')
    page.set_viewport_size({'width':375,'height':812})
    page.locator('#inventory-button').click()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert not errors,errors
    browser.close()
print('PASS: startup, AP/CP UI, perk prerequisites, 6,000 floor layouts, all class formulas, shops, equipment, capacity, combat resources/pause, floor-30 victory, restart, mobile layout; no JS errors.')
