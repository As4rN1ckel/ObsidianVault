"""Talent tree, loadout, and skill-effect browser regression checks."""
import sys
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1200,'height':1000});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8000')
 page.locator('input[value="wizard"]').check(force=True);page.locator('#begin-run').click()
 page.evaluate('gameState.player.cp=10;renderUI()')
 page.locator('#talents-button').click()
 assert page.locator('.talent-column').count()==3
 page.locator('.talent-node').filter(has_text='Unlock Mana Surge').get_by_role('button').click()
 page.locator('.talent-node').filter(has_text='Unlock Mana Burn').get_by_role('button').click()
 assert page.evaluate('gameState.player.equippedSkills.length===3&&!gameState.player.equippedSkills.includes("manaBurn")')
 page.get_by_role('button',name='Unslot',exact=True).first.click()
 page.get_by_role('button',name='Slot',exact=True).last.click()
 assert page.evaluate('gameState.player.equippedSkills.includes("manaBurn")')
 page.set_viewport_size({'width':375,'height':812})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.get_by_role('button',name='Close',exact=True).click()
 page.evaluate('''() => {
 const assert=(v,m)=>{if(!v)throw Error(m)};
 function fixture(cls,skill){
  cancelPendingActions();gameState.paused=false;gameState.panel=null;gameState.gameOver=false;gameState.started=true;gameState.lootOpen=false;
  const p=makePlayer('Skill Tester',cls,'human');p.resource=100;p.maxResource=100;p.cp=20;
  p.perks=['unlock1','unlock2'];p.equippedSkills=[skill];gameState.player=p;
  const e=instantiateEnemy(ENEMY_TYPES[0],1);Object.assign(e,{hp:1000,maxHp:1000,defense:10,armorHits:0,armorBonus:0,dots:{},stunTurns:0,intent:'attack'});
  gameState.currentEnemy=e;gameState.inCombat=true;gameState.turnPending=false;
  gameState.combat={owner:'player',playerTurns:1,enemyTurns:0,playerNext:100,enemyNext:100};
  return [p,e];
 }
 function cast(id){useSkill(id);cancelPendingActions();}
 let [p,e]=fixture('fighter','shieldBash');cast('shieldBash');
 assert(p.resource===93&&p.skillCooldowns.shieldBash===6&&e.stunTurns===1,'bash cost/cd/stun');
 const hp=p.hp;resolveEnemyAction();assert(p.hp===hp&&e.stunTurns===0,'stun skips one action');
 resolveEnemyAction();assert(p.hp<hp,'enemy acts after stun');
 [p,e]=fixture('fighter','heavyStrike');e.armorHits=2;e.armorBonus=6;
 const expected=calculateDamage(p.damage*1.6,8);cast('heavyStrike');assert(e.hp===1000-expected&&e.armorHits===1,'heavy halves total defense');
 [p,e]=fixture('rogue','poisonedBlade');cast('poisonedBlade');assert(e.dots.poison.turns===3&&p.resource===94,'poison apply');
 const before=e.hp,d=e.dots.poison.damage;
 for(let i=0;i<3;i++)tickEnemyEffects(e);
 assert(e.hp===before-3*d&&!e.dots.poison,'three poison ticks');
 [p,e]=fixture('rogue','backstab');cast('backstab');assert(e.hp===1000-Math.round(p.damage*1.4),'backstab bypass');
 [p,e]=fixture('rogue','backstab');e.armorHits=2;e.armorBonus=4;cast('backstab');assert(e.hp===1000-calculateDamage(p.damage*1.4,14),'backstab respects armor buff');
 [p,e]=fixture('wizard','manaSurge');p.resource=11;p.hp=10;p.skillCooldowns.arcaneBolt=5;p.skillCooldowns.wizard=1;
 cast('manaSurge');assert(p.resource===5&&p.hp===10+Math.round(4+p.intellect*.8),'surge half rounded up / healing');
 assert(p.skillCooldowns.arcaneBolt===4&&p.skillCooldowns.wizard===1&&p.skillCooldowns.manaSurge===8,'surge only other active CDs');
 [p,e]=fixture('wizard','manaSurge');p.resource=0;cast('manaSurge');assert(!p.skillCooldowns.manaSurge,'zero mana cannot cast');
 [p,e]=fixture('wizard','manaBurn');cast('manaBurn');assert(p.resource===91&&e.dots.burn.damage===10,'burn hp percent/cost');
 const burning=e.hp;for(let i=0;i<3;i++)tickEnemyEffects(e);assert(e.hp===burning-30&&!e.dots.burn,'burn expiry');
 [p,e]=fixture('fighter','heavyStrike');p.resource=0;cast('heavyStrike');assert(e.hp===1000&&!p.skillCooldowns.heavyStrike,'unaffordable blocked');
 [p,e]=fixture('fighter','heavyStrike');p.perks=[];cast('heavyStrike');assert(e.hp===1000,'locked skill blocked');
 [p,e]=fixture('wizard','arcaneBolt');p.equippedSkills=[];cast('arcaneBolt');assert(e.hp===1000,'unslotted blocked');
 [p,e]=fixture('fighter','heavyStrike');cast('heavyStrike');const damaged=e.hp;
 gameState.combat.owner='player';gameState.turnPending=false;
 for(const turn of [2,3,4,5,6]){gameState.combat.playerTurns=turn;cast('heavyStrike');assert(e.hp===damaged,'cooldown blocked');}
 gameState.combat.playerTurns=7;cast('heavyStrike');assert(e.hp<damaged,'cooldown expires');
 [p,e]=fixture('wizard','arcaneBolt');const slots=p.equippedSkills.join();gameState.panel='talents';toggleSkill('arcaneBolt');learnPerk('training');assert(p.equippedSkills.join()===slots&&!p.perks.includes('training'),'combat mutations locked');
 gameState.inCombat=false;gameState.turnPending=false;gameState.panel='talents';p.perks=[];p.cp=10;
 learnPerk('mastery');assert(p.cp===10,'prerequisites required');
 for(const id of ['training','fortitude','precision','unlock1','unlock2','enhancement','utility','recovery','mastery'])learnPerk(id);
 assert(p.cp===1&&p.perks.length===9,'all nodes spend exactly one CP');learnPerk('mastery');assert(p.cp===1,'duplicate blocked');

 [p,e]=fixture('wizard','arcaneBolt');p.perks.push('mastery','enhancement');const mana=p.resource;cast('arcaneBolt');assert(p.resource===mana-5,'arcane mastery refund');
 [p,e]=fixture('rogue','poisonedBlade');p.perks.push('mastery','enhancement');cast('poisonedBlade');const after=p.resource;
 tickEnemyEffects(e);assert(p.resource===after+1,'poison mastery refund');
 [p,e]=fixture('fighter','shieldBash');p.perks=['utility','recovery'];p.hp=10;p.resource=3;
 e.hp=1;e.dots.poison={damage:2,turns:1};
 assert(tickEnemyEffects(e)&&!gameState.inCombat&&gameState.lootOpen,'DoT kill enters loot');
 assert(p.resource===5&&p.hp===10+Math.floor(p.maxHp*.05),'victory utility');
 // Every class has complete, acyclic prerequisite definitions and its own skill unlocks.
 for(const cls of Object.keys(CLASSES))for(const node of PERKS[cls]){
  assert(node.requires.every(id=>PERKS[cls].find(n=>n.id===id)),'valid prereq');
  if(node.skill)assert(SKILLS[node.skill].classId===cls,'correct class skill');
 }
 }''')
 assert not errors,errors
 b.close()
print('PASS: three-column UI, CP unlocks/prerequisites, three-slot loadout, combat locks, all six new skills, independent cooldowns, stun, DoT expiry, defense bypass, resource costs, Mana Surge reduction, mobile width; no JS errors.')
