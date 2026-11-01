
'use strict';
// Turn-based exploration and combat; definitions are loaded from /data.
let CLASSES, RACES, ENEMY_TYPES, BOSSES, INTENTS, BALANCE, ITEMS, PERKS, SKILLS, LOOT;
const gameState = {
  player:null, started:false, floor:1, room:1, roomsCompleted:[], totalRoomsCleared:0,
  floorLayout:[],currentEnemy:null,combat:null,inCombat:false,gameOver:false,paused:false,
  turnPending:false,floorTransitioning:false,panel:null,merchantStock:null,
  highScoreFloor:0,highScoreRoom:0,highScoreLevel:0,
  transitionId:0,pendingTimers:new Set(), runSeed:0
};
const RECORD_KEY='obsidianVault.highScore.v1';
const $ = (id) => document.getElementById(id);
const $mainArea=$('main-area'), $logArea=$('log-area'), $modalOverlay=$('modal-overlay');
const $container=$('game-container');
function rand(min,max){return Math.floor(Math.random()*(max-min+1))+min;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function seededRandom(seed){let s=(seed%2147483647+2147483647)%2147483647||1;return()=>{s=s*16807%2147483647;return(s-1)/2147483646;};}
function loadRecord(){try{const r=JSON.parse(localStorage.getItem(RECORD_KEY)||'null');if(r&&Number.isInteger(r.floor)&&r.floor>=0){gameState.highScoreFloor=r.floor;gameState.highScoreRoom=Number.isInteger(r.room)?r.room:0;gameState.highScoreLevel=Number.isInteger(r.level)?r.level:0;}}catch(_){}}
function saveRecord(){try{localStorage.setItem(RECORD_KEY,JSON.stringify({floor:gameState.highScoreFloor,room:gameState.highScoreRoom,level:gameState.highScoreLevel}));}catch(_){}}
function cancelPendingActions(){gameState.transitionId++;for(const t of gameState.pendingTimers)clearTimeout(t);gameState.pendingTimers.clear();}
function scheduleAction(fn,delay=0){const generation=gameState.transitionId;const timer=setTimeout(()=>{gameState.pendingTimers.delete(timer);if(generation===gameState.transitionId&&!gameState.gameOver)fn();},delay);gameState.pendingTimers.add(timer);}
function updateLog(message,type='info'){
  const el=document.createElement('div');el.className='log-entry '+type;el.textContent=message;
  $logArea.appendChild(el);while($logArea.children.length>90)$logArea.firstChild.remove();$logArea.scrollTop=$logArea.scrollHeight;
}
function renderMainArea(html){$mainArea.innerHTML=html;$mainArea.classList.remove('scene-enter');void $mainArea.offsetWidth;$mainArea.classList.add('scene-enter');}
function buildStats(classKey,raceKey){
  return Object.fromEntries(BALANCE.attributes.map(k=>[k,Math.max(1,CLASSES[classKey].attributes[k]+(RACES[raceKey].bonus[k]||0))]));
}

function makePlayer(name,classKey,raceKey){
  const p={name:name.trim().slice(0,20)||'Adventurer',classId:classKey,raceId:raceKey,
    attributes:buildStats(classKey,raceKey),ap:0,cp:0,perks:[],inventory:[],
    equipment:{weapon:createItem(CLASSES[classKey].weapon,0),offhand:null,armor:null,backpack:null,accessory:null},
    hp:Infinity,resource:Infinity,potions:0,gold:0,xp:0,level:1,totalGoldEarned:0,
    cooldownReadyAt:0,boltReadyAt:0,blockHp:0,dodgeReady:false,dodgeBonus:false,magicShieldTurns:0,poisonTurns:0,poisonDamage:0};
  recalculate(p);return p;
}

function critChance(luck){return Math.min(BALANCE.critCap,BALANCE.critBase+Math.max(0,luck)*BALANCE.critPerLuck);}

function xpThreshold(level){return BALANCE.xpBase+level*BALANCE.xpPerLevel;}

function renderHub(){
  cancelPendingActions();gameState.started=false;gameState.inCombat=false;gameState.combat=null;
  $container.classList.add('hub-mode');$modalOverlay.classList.remove('active');
  const previous=gameState.player;
  renderMainArea(`
    <section class="hub" aria-label="Character creation">
      <div class="hub-eyebrow">✦ THE GATES OF THE VAULT ✦</div>
      <h2>Create your Adventurer</h2>
      <p class="hub-intro">Choose who will descend into the Obsidian Vault. Your class grants a signature skill; your race modifies starting attributes.</p>
      <label class="hub-field-label" for="hero-name">ADVENTURER NAME</label>
      <input id="hero-name" class="hub-input" maxlength="20" placeholder="Adventurer" autocomplete="off" value="${escapeHtml(previous?.name||'')}" />
      <div class="hub-field-label">CHOOSE CLASS</div>
      <div class="choice-grid" role="radiogroup" aria-label="Class">
        ${Object.entries(CLASSES).map(([key,c])=>`<label class="choice-card"><input type="radio" name="hero-class" value="${key}" ${key===(previous?.classId||'fighter')?'checked':''}><span class="choice-icon">${c.icon}</span><strong>${c.name}</strong><small>${c.description}</small></label>`).join('')}
      </div>
      <div class="hub-field-label">CHOOSE RACE</div>
      <div class="choice-grid" role="radiogroup" aria-label="Race">
        ${Object.entries(RACES).map(([key,r])=>`<label class="choice-card race-card"><input type="radio" name="hero-race" value="${key}" ${key===(previous?.raceId||'human')?'checked':''}><strong>${r.name}</strong><small>${r.description}</small></label>`).join('')}
      </div>
      <div class="preview-panel"><div class="hub-field-label">STARTING ATTRIBUTES</div><div id="stat-preview" class="preview-stats"></div><div id="skill-preview" class="skill-preview"></div></div>
      <button class="btn btn-primary hub-start" id="begin-run">⚔ Enter the Vault</button>
      <p class="hub-tip">Weapons scale with their main attribute. Vitality grants HP and a little Defense. Earn 2 Attribute Points and 1 Class Point per level; spend them whenever you choose.</p>
      ${gameState.highScoreFloor?`<p class="hub-record">✧ Personal best: Floor ${gameState.highScoreFloor}, Room ${gameState.highScoreRoom} · Level ${gameState.highScoreLevel}</p>`:''}
    </section>`);
  $mainArea.querySelectorAll('input[type=radio]').forEach(el=>el.addEventListener('change',updateHubPreview));
  $('begin-run').addEventListener('click',startRun);
  $('hero-name').addEventListener('keydown',ev=>{if(ev.key==='Enter')startRun();});
  updateHubPreview();
}
function selectedHeroOption(name,fallback){return $mainArea.querySelector(`input[name="${name}"]:checked`)?.value||fallback;}
function updateHubPreview(){
  const klass=selectedHeroOption('hero-class','fighter'),race=selectedHeroOption('hero-race','human');
  const p=makePlayer('',klass,race),c=CLASSES[klass];
  $('stat-preview').innerHTML=BALANCE.attributes.map(k=>`<span><small>${label(k)}</small><b>${p[k]}</b></span>`).join('')+`<span><small>HP / Damage</small><b>${p.maxHp} / ${p.damage}</b></span>`;
  $('skill-preview').textContent=`${c.skill} · ${SKILLS[klass].cost} ${label(c.resource)} · ${c.skillInfo} Starts with ${ITEMS[c.weapon].name} only.`;
}

function startRun(){
  const klass=selectedHeroOption('hero-class','fighter'),race=selectedHeroOption('hero-race','human');
  const rawName=$('hero-name').value;
  if(!CLASSES[klass]||!RACES[race])return;
  cancelPendingActions();
  gameState.player=makePlayer(rawName,klass,race);gameState.started=true;gameState.floor=1;gameState.room=1;
  gameState.roomsCompleted=[];gameState.totalRoomsCleared=0;gameState.floorLayout=[];
  gameState.currentEnemy=null;gameState.combat=null;gameState.inCombat=false;gameState.gameOver=false;
  gameState.paused=false;gameState.turnPending=false;gameState.floorTransitioning=false;
  gameState.pendingLoot=[];gameState.lootOpen=false;gameState.panel=null;gameState.merchantStock=null;gameState.runSeed=rand(1,2_000_000_000);
  $container.classList.remove('hub-mode');$logArea.replaceChildren();
  updateLog(`${gameState.player.name}, the ${RACES[race].name} ${CLASSES[klass].name}, enters the Vault.`,'levelup');
  enterRoom();
}
function renderUI(){
  const p=gameState.player;if(!p)return;
  const hpPct=clamp(p.hp/p.maxHp*100,0,100),needed=xpThreshold(p.level);
  $('hp-bar').style.width=hpPct+'%';$('hp-text').textContent=`${p.hp} / ${p.maxHp}`;
  $('xp-bar').style.width=clamp(p.xp/needed*100,0,100)+'%';$('xp-text').textContent=`${p.xp} / ${needed}`;
  $('hud-identity').textContent=`${p.name} · Lv ${p.level} ${CLASSES[p.classId].name} · ${RACES[p.raceId].name}`;
  $('hud-stats').innerHTML=`<span>Gold <b>${p.gold}</b></span><span>Damage <b>${p.damage}</b></span><span>Defense <b>${p.defense}</b></span><span>${label(CLASSES[p.classId].resource)} <b>${p.resource}/${p.maxResource}</b></span><span>Potions <b>${p.potions}/${BALANCE.potionSlots}</b></span>`;
  $('character-button').textContent=`Character · ${p.ap} AP / ${p.cp} CP`;
  $('character-button').disabled=$('inventory-button').disabled=!canManage();
  $('floor-room-text').textContent=`Floor ${gameState.floor}/${BALANCE.maxFloor} • Room ${gameState.room}/${BALANCE.roomsPerFloor}`;
  renderRoomDots();
}

function renderRoomDots(){
  const holder=$('room-dots');holder.replaceChildren();
  for(let i=1;i<=BALANCE.roomsPerFloor;i++){
    const el=document.createElement('div');el.className='room-dot';
    if(i===BALANCE.roomsPerFloor)el.classList.add('boss');
    if(gameState.roomsCompleted.includes(i))el.classList.add('completed');
    else if(i===gameState.room&&!gameState.gameOver)el.classList.add('current');
    el.title=`Room ${i}${i===BALANCE.roomsPerFloor?' · Boss':''}`;holder.appendChild(el);
  }
}
function completeRoom(){if(!gameState.roomsCompleted.includes(gameState.room)){
  gameState.roomsCompleted.push(gameState.room);gameState.totalRoomsCleared++;
}renderUI();}
function generateFloorLayout(floorNum){
  const rng=seededRandom(gameState.runSeed+floorNum*7919+42),layout=Array(BALANCE.roomsPerFloor).fill('enemy');
  layout[0]='entrance';layout[layout.length-1]='boss';
  const take=(lo,hi,type)=>{const free=[];for(let i=lo-1;i<hi;i++)if(layout[i]==='enemy')free.push(i);const at=free[Math.floor(rng()*free.length)];layout[at]=type;};
  take(3,9,'fountain');take(3,9,'merchant');
  for(let i=0,n=rng()<.5?1:2;i<n;i++)take(2,9,'treasure');
  take(2,9,'empty');return layout;
}

function enterRoom(){
  if(!gameState.started||gameState.gameOver||gameState.paused)return;
  cancelPendingActions();gameState.turnPending=false;gameState.merchantStock=null;
  gameState.inCombat=false;gameState.combat=null;gameState.currentEnemy=null;
  if(gameState.floorLayout.length===0){gameState.floorLayout=generateFloorLayout(gameState.floor);
    if(gameState.floor>1)updateLog(`You descend to Floor ${gameState.floor}.`,'levelup');}
  renderUI();
  switch(gameState.floorLayout[gameState.room-1]){
    case 'entrance':showEntrance();break;
    case 'enemy':startCombat(generateMonster(gameState.floor));break;
    case 'boss':startCombat(generateBoss(gameState.floor),true);break;
    case 'treasure':showTreasureChest();break;
    case 'fountain':showHealingFountain();break;
    case 'merchant':showMerchant(true);break;
    case 'empty':showEmptyRoom();break;
  }
}
function showEntrance(){renderMainArea(`<div class="scene-icon">🚪</div><div class="scene-title">Floor ${gameState.floor} — Entrance Hall</div><div class="scene-desc">Ancient doors open onto a shadowy passage. The Vault waits below.</div><div class="action-buttons"><button class="btn btn-primary" onclick="advanceRoom()">Continue Deeper →</button></div>`);}
function showEmptyRoom(){updateLog('You find an empty chamber.','info');renderMainArea(`<div class="scene-icon">🕯️</div><div class="scene-title">A Quiet Chamber</div><div class="scene-desc">A moment of silence before the danger returns.</div><div class="action-buttons"><button class="btn btn-primary" onclick="advanceRoom()">Continue →</button></div>`);}
function instantiateEnemy(template,floor,boss=false){
  const hp=(boss?BALANCE.bossHpBase+floor*BALANCE.bossHpPerFloor:BALANCE.enemyHpBase+floor*BALANCE.enemyHpPerFloor)+template.hp;
  return {id:template.id,name:template.name+(boss?` (Floor ${floor})`:''),hp,maxHp:hp,
    damage:Math.round(boss?BALANCE.bossDamageBase+floor*BALANCE.bossDamagePerFloor:BALANCE.enemyDamageBase+floor*BALANCE.enemyDamagePerFloor)+template.damage,
    defense:Math.max(0,(boss?2:1)+Math.floor(floor/3)+template.defense),
    speed:Math.max(3,9+template.speed+Math.floor(floor/5)),
    abilities:[...template.abilities],xpReward:(boss?42+floor*10:18+floor*4),
    goldReward:rand(boss?25:6,boss?40+floor*5:13+floor*3),
    isBoss:boss, charged:false,enraged:false,armorHits:0,armorBonus:0,intent:null};
}
function generateMonster(floor){return instantiateEnemy(ENEMY_TYPES[rand(0,ENEMY_TYPES.length-1)],floor);}
function generateBoss(floor){return instantiateEnemy(BOSSES[(floor-1)%BOSSES.length],floor,true);}
function getEnemySymbol(id){
  if(/skeleton|lich|wraith|shadow/.test(id))return '☠';if(/dragon|demon|imp/.test(id))return '♜';
  if(/spider|bat|rat/.test(id))return '✹';if(/slime/.test(id))return '◉';
  if(/guardian|knight|orc|behemoth/.test(id))return '♞';if(/archmage/.test(id))return '✧';return '⚔';
}
function selectEnemyIntent(enemy){
  if(enemy.charged){enemy.intent='heavy';return;}
  if(enemy.abilities.includes('enrage')&&!enemy.enraged&&enemy.hp<=enemy.maxHp*.4){enemy.intent='enrage';return;}
  const specials=enemy.abilities.filter(x=>x!=='enrage');
  enemy.intent=specials.length&&Math.random()<.34?specials[rand(0,specials.length-1)]:'attack';
}
function refreshEnemyIntent(){
  const e=gameState.currentEnemy;if(!e||!gameState.inCombat)return;
  if(e.charged){e.intent='heavy';return;}
  if(e.abilities.includes('enrage')&&!e.enraged&&e.hp<=e.maxHp*.4)e.intent='enrage';
}
function getCombatStatus(){
  const p=gameState.player,e=gameState.currentEnemy,parts=[];
  if(p.blockHp>0)parts.push(`◆ Block ${p.blockHp} HP`);
  if(p.dodgeReady)parts.push('➤ Next hit dodged');
  if(p.dodgeBonus)parts.push('⚔ Next attack +50%');
  if(p.magicShieldTurns>0)parts.push(`✧ Magic Shield: ${p.magicShieldTurns} enemy turns`);
  if(p.poisonTurns>0)parts.push(`☣ Poison: ${p.poisonDamage} × ${p.poisonTurns}`);
  if(e.armorHits>0)parts.push(`Enemy armor: +${e.armorBonus} for ${e.armorHits} hits`);
  if(e.enraged)parts.push('Enemy enraged: +30% Damage');
  return parts;
}
function startCombat(enemy,boss=false){
  gameState.currentEnemy=enemy;gameState.inCombat=true;gameState.turnPending=true;
  const p=gameState.player;p.cooldownReadyAt=0;p.boltReadyAt=0;p.blockHp=0;p.dodgeReady=false;p.dodgeBonus=false;p.magicShieldTurns=0;
  p.poisonTurns=0;p.poisonDamage=0;
  gameState.combat={owner:null,playerTurns:0,enemyTurns:0,
    playerNext:100/p.speed,enemyNext:100/enemy.speed};
  selectEnemyIntent(enemy);
  updateLog(boss?`⚠ BOSS: ${enemy.name} guards the vault!`:`${enemy.name} blocks your path.`,boss?'boss':'combat');
  renderCombatUI();
  continueCombat();
}
function combatAllowed(){return gameState.inCombat&&!gameState.gameOver&&!gameState.paused&&gameState.currentEnemy&&gameState.combat;}
function continueCombat(){
  if(!combatAllowed())return;
  const c=gameState.combat,p=gameState.player,e=gameState.currentEnemy;
  if(e.hp<=0){enemyDefeated();return;}
  if(p.hp<=0){gameOver();return;}
  // Earliest ready time acts first. Ties go to the player, preventing a first-turn disadvantage.
  if(c.playerNext<=c.enemyNext+1e-8){
    c.owner='player';c.playerTurns++;c.playerNext+=100/p.speed;
    if(p.poisonTurns>0){
      p.hp=Math.max(0,p.hp-p.poisonDamage);p.poisonTurns--;
      updateLog(`Poison deals ${p.poisonDamage} damage (${p.poisonTurns} turns left).`,'combat');
      if(p.hp<=0){renderUI();gameOver();return;}
    }
    p.resource=Math.min(p.maxResource,p.resource+BALANCE.resourceRegen);gameState.turnPending=false;renderUI();renderCombatUI();
  }else{
    c.owner='enemy';gameState.turnPending=true;renderCombatUI();
    scheduleAction(()=>{
      if(!combatAllowed()||gameState.combat?.owner!=='enemy')return;
      resolveEnemyAction();
      if(!combatAllowed())return;
      c.enemyTurns++;c.enemyNext+=100/e.speed;c.owner=null;
      renderUI();renderCombatUI();
      scheduleAction(continueCombat,220);
    },420);
  }
}
function skillCooldownRemaining(){
  const p=gameState.player,c=gameState.combat;
  if(!c)return 0;
  return Math.max(0,p.cooldownReadyAt-c.playerTurns);
}
function renderCombatUI(){
  if(!gameState.inCombat||!gameState.currentEnemy)return;
  const e=gameState.currentEnemy,p=gameState.player,c=gameState.combat;
  const intent=INTENTS[e.intent]||INTENTS.attack,turnReady=c?.owner==='player'&&!gameState.turnPending&&!gameState.paused;
  const cd=skillCooldownRemaining(),cls=CLASSES[p.classId];
  const ready=turnReady&&p.resource>=SKILLS[p.classId].cost&&cd===0&&!(p.classId==='fighter'&&p.blockHp>0)&&!(p.classId==='wizard'&&p.magicShieldTurns>0)&&!(p.classId==='rogue'&&p.dodgeReady);
  const extra=getCombatStatus();
  renderMainArea(`
    <div class="enemy-display">
      <div class="enemy-eyebrow">${e.isBoss?'☠ FLOOR GUARDIAN':'⚔ HOSTILE ENCOUNTER'}</div>
      <div class="enemy-portrait" aria-hidden="true"><span>${getEnemySymbol(e.id)}</span></div>
      <div class="enemy-name">${escapeHtml(e.name)}</div>
      <div class="enemy-stats"><span>⚔ DMG ${e.damage}</span><span>◆ DEF ${e.defense+e.armorBonus*(e.armorHits>0)}</span><span>➤ SPD ${e.speed}</span></div>
      <div class="enemy-health-label"><span>ENEMY HEALTH</span><span>${Math.max(0,e.hp)} / ${e.maxHp}</span></div>
      <div class="enemy-hp-bar-outer"><div class="enemy-hp-bar-inner" style="width:${clamp(e.hp/e.maxHp*100,0,100)}%"></div></div>
      <div class="intent-panel"><span class="intent-title">${intent.icon} ENEMY INTENT: ${intent.name}</span><span class="intent-desc">${intent.detail}</span></div>
    </div>
    <div class="turn-banner ${turnReady?'turn-ready':''}">${turnReady?'✦ YOUR TURN':c?.owner==='enemy'?'◈ ENEMY TURN':'◈ PREPARING NEXT TURN'} · Action timeline: ${p.speed} speed vs ${e.speed} speed</div>
    ${extra.length?`<div class="combat-effects">${extra.map(s=>`<span>${escapeHtml(s)}</span>`).join('')}</div>`:''}
    <div class="action-buttons combat-actions">
      <button class="btn btn-danger" onclick="playerAttack()" ${!turnReady?'disabled':''}>⚔ Basic Attack</button>
      <button class="btn btn-success" onclick="playerSkill()" title="${escapeHtml(cls.skillInfo)}" ${!ready?'disabled':''}>${p.classId==='fighter'?'◆':p.classId==='wizard'?'✧':'➤'} ${cls.skill} (${SKILLS[p.classId].cost} ${label(cls.resource)})${cd?` (CD ${cd})`:''}</button>
      ${p.classId==='wizard'?`<button class="btn btn-danger" onclick="arcaneBolt()" ${!turnReady||p.resource<SKILLS.arcaneBolt.cost||c.playerTurns<p.boltReadyAt?'disabled':''}>Arcane Bolt · ${SKILLS.arcaneBolt.cost} Mana${p.boltReadyAt>c.playerTurns?` (CD ${p.boltReadyAt-c.playerTurns})`:''}</button>`:''}
      <button class="btn" onclick="usePotion()" ${!turnReady||p.potions<=0||p.hp>=p.maxHp?'disabled':''}>✚ Potion (${p.potions})</button>
    </div>
    <div class="combat-hint">${cls.skill}: ${cls.skillInfo} Cooldown ${SKILLS[p.classId].cooldown} of your turns. Regain ${BALANCE.resourceRegen} ${label(cls.resource)} each turn.</div>`);
}
function startPlayerAction(){
  if(!combatAllowed()||gameState.turnPending||gameState.combat.owner!=='player')return false;
  gameState.turnPending=true;gameState.combat.owner=null;return true;
}
function finishPlayerAction(){
  renderUI();
  if(!gameState.inCombat)return;
  refreshEnemyIntent();renderCombatUI();
  scheduleAction(continueCombat,290);
}
function calculateDamage(raw,defense){return Math.max(1,Math.round(raw)-Math.max(0,defense));}
function attackDamage(attacker,target,multiplier=1,canCrit=false){
  const variance=rand(-1,2),raw=Math.max(1,Math.round(attacker.damage*multiplier)+variance);
  const crit=canCrit&&Math.random()<(attacker.critChance??critChance(attacker.luck));
  const total=crit?Math.round(raw*1.5):raw;
  const armor=target.defense+(target.armorHits>0?target.armorBonus:0);
  const damage=calculateDamage(total,armor);
  if(target.armorHits>0){target.armorHits--;if(target.armorHits===0)target.armorBonus=0;}
  return {damage,crit};
}
function playerAttack(){
  if(!startPlayerAction())return;
  const p=gameState.player,e=gameState.currentEnemy;
  const bonus=p.dodgeBonus?SKILLS.rogue.attackBonus:1;p.dodgeBonus=false;
  const hit=attackDamage(p,e,bonus,true);e.hp=Math.max(0,e.hp-hit.damage);
  updateLog(`You strike ${e.name} for ${hit.damage} damage${hit.crit?' — CRITICAL!':''}${bonus>1?' (Dodge bonus)':''}.`,'combat');
  if(e.hp<=0){enemyDefeated();return;}
  finishPlayerAction();
}
function playerSkill(){
  if(!combatAllowed()||gameState.combat.owner!=='player'||gameState.turnPending||skillCooldownRemaining()>0)return;
  const p=gameState.player,c=gameState.combat;
  if(p.resource<SKILLS[p.classId].cost)return;
  if((p.classId==='fighter'&&p.blockHp>0)||(p.classId==='wizard'&&p.magicShieldTurns>0)||(p.classId==='rogue'&&p.dodgeReady))return;
  if(!startPlayerAction())return;
  p.resource-=SKILLS[p.classId].cost;
  p.cooldownReadyAt=c.playerTurns+SKILLS[p.classId].cooldown+1;
  switch(p.classId){
    case 'fighter':p.blockHp=Math.max(1,Math.ceil(p.defense*SKILLS.fighter.shieldDefenseScale+p.might*SKILLS.fighter.shieldMightScale));updateLog(`Block raised! Shield absorbs up to ${p.blockHp} damage, countering for 70% on impact.`,'info');break;
    case 'wizard':p.magicShieldTurns=SKILLS.wizard.duration;updateLog('Magic Shield active: -40% damage and 15% reflection for 2 enemy turns.','info');break;
    case 'rogue':p.dodgeReady=true;p.dodgeBonus=true;updateLog('Dodge prepared: evade the next attack and empower your next strike by 50%.','info');break;
  }
  finishPlayerAction();
}
function usePotion(){
  const p=gameState.player;
  if(!p||p.potions<=0||p.hp>=p.maxHp||!startPlayerAction())return;
  p.potions--;const heal=Math.min(p.maxHp-p.hp,Math.max(1,Math.floor(p.maxHp*BALANCE.potionHealing)));
  p.hp+=heal;updateLog(`You drink a potion and recover ${heal} HP.`,'heal');finishPlayerAction();
}
function enemyAttack(multiplier=1,poison=false,drain=false){
  const e=gameState.currentEnemy,p=gameState.player;
  if(p.dodgeReady||Math.random()<p.dodgeChance){p.dodgeReady=false;updateLog(`You evade ${e.name}'s attack completely!`,'heal');return 0;}
  const base=calculateDamage(Math.max(1,Math.round(e.damage*(e.enraged?1.3:1)*multiplier)+rand(-1,2)),p.defense);
  let dmg=base;
  if(Math.random()<p.blockChance){dmg=Math.floor(dmg*.5);updateLog('You block half the incoming damage.','heal');}
  if(p.magicShieldTurns>0)dmg=Math.max(1,Math.ceil(dmg*(1-SKILLS.wizard.reduction)));
  if(p.blockHp>0){
    const absorbed=Math.min(dmg,p.blockHp);p.blockHp-=absorbed;dmg-=absorbed;
    updateLog(`Block absorbs ${absorbed} damage (${p.blockHp} shield left).`,'heal');
    // Counter attacks use the same flat Defense calculation and do not crit.
    const counter=calculateDamage(Math.round(p.damage*.7),e.defense+e.armorBonus*(e.armorHits>0));
    if(e.armorHits>0){e.armorHits--;if(e.armorHits===0)e.armorBonus=0;}
    e.hp=Math.max(0,e.hp-counter);updateLog(`Block counterattacks ${e.name} for ${counter} damage!`,'combat');
  }
  p.hp=Math.max(0,p.hp-dmg);
  updateLog(`${e.name} hits you for ${dmg} damage${p.magicShieldTurns>0?' (Magic Shield)':''}.`,'combat');
  if(p.magicShieldTurns>0&&dmg>0){
    const reflected=Math.max(1,Math.round(dmg*SKILLS.wizard.reflection));e.hp=Math.max(0,e.hp-reflected);
    updateLog(`Magic Shield reflects ${reflected} damage!`,'combat');
  }
  if(poison&&p.hp>0){p.poisonTurns=3;p.poisonDamage=2+Math.floor(gameState.floor/3);updateLog(`Poisoned! ${p.poisonDamage} damage at the start of your next 3 turns.`,'combat');}
  if(drain&&dmg>0&&e.hp>0){const healed=Math.min(e.maxHp-e.hp,Math.max(1,Math.round(dmg*.7)));e.hp+=healed;if(healed)updateLog(`${e.name} drains ${healed} HP.`,'heal');}
  return dmg;
}
function resolveEnemyAction(){
  if(!combatAllowed())return;
  const e=gameState.currentEnemy,p=gameState.player,action=e.intent||'attack';
  if(action==='prepare'){e.charged=true;updateLog(`${e.name} prepares a devastating attack!`,'boss');}
  else if(action==='armor'){e.armorBonus=3;e.armorHits=2;updateLog(`${e.name} raises armor: +3 Defense for 2 incoming attacks.`,'info');}
  else if(action==='enrage'){e.enraged=true;updateLog(`${e.name} ENRAGES! Damage increased by 30%.`,'boss');}
  else if(action==='heavy'){e.charged=false;enemyAttack(1.7);}
  else if(action==='poison')enemyAttack(.7,true);
  else if(action==='drain')enemyAttack(.8,false,true);
  else enemyAttack();
  // Magic Shield lasts 2 enemy actions, including non-damaging enemy actions.
  if(p.magicShieldTurns>0)p.magicShieldTurns--;
  if(p.hp<=0){gameOver();return;}
  if(e.hp<=0){enemyDefeated();return;}
  selectEnemyIntent(e);
}
function awardGold(gold){const p=gameState.player,amount=Math.max(0,Math.round(gold*(1+Math.min(.30,p.luck*.012))));p.gold+=amount;p.totalGoldEarned+=amount;return amount;}
function enemyDefeated(){
  if(!gameState.inCombat||!gameState.currentEnemy)return;
  const e=gameState.currentEnemy,p=gameState.player;
  cancelPendingActions();gameState.turnPending=true;
  const gold=awardGold(e.goldReward);p.xp+=e.xpReward;
  updateLog(`${e.name} defeated! +${e.xpReward} XP and +${gold} Gold.`,'loot');
  gameState.inCombat=false;gameState.currentEnemy=null;gameState.combat=null;
  p.poisonTurns=0;p.poisonDamage=0;p.blockHp=0;p.magicShieldTurns=0;p.dodgeReady=false;p.dodgeBonus=false;
  gameState.turnPending=false;completeRoom();checkLevelUp();
  gameState.lootTitle=`Victory! +${e.xpReward} XP · +${gold} Gold`;
  grantLoot(e.id);

}
function checkLevelUp(onComplete=()=>{}){
  const p=gameState.player;
  while(p.xp>=xpThreshold(p.level)){
    p.xp-=xpThreshold(p.level);p.level++;p.ap+=BALANCE.apPerLevel;p.cp+=BALANCE.cpPerLevel;
    updateLog(`Level ${p.level}! +${BALANCE.apPerLevel} AP, +${BALANCE.cpPerLevel} CP. Open Character whenever ready.`,'levelup');
  }
  renderUI();onComplete();
}

function showTreasureChest(){
  const gold=awardGold(rand(10,25+gameState.floor*5)),xp=rand(5,15+gameState.floor*2);
  gameState.player.xp+=xp;checkLevelUp();
  gameState.lootTitle=`Treasure · +${gold} Gold · +${xp} XP`;grantLoot('treasure');

}
function showHealingFountain(){
  const p=gameState.player,heal=Math.floor(p.maxHp*.5);
  renderMainArea(`<div class="scene-icon">⛲</div><div class="scene-title">Healing Fountain</div><div class="scene-desc">Crystal-clear water flows from a carved basin.<br><br>${p.hp<p.maxHp?`Restore up to ${heal} HP.`:'Your HP is already full.'}</div><div class="action-buttons"><button class="btn btn-success" onclick="useFountain()" ${p.hp>=p.maxHp?'disabled':''}>💧 Use Fountain</button><button class="btn" onclick="skipFountain()">Skip</button></div>`);
}
function resolveFountain(use){
  if(gameState.turnPending||gameState.paused||gameState.gameOver||gameState.inCombat||gameState.floorLayout[gameState.room-1]!=='fountain')return;
  gameState.turnPending=true;
  if(use){const p=gameState.player,heal=Math.min(p.maxHp-p.hp,Math.floor(p.maxHp*.5));p.hp+=heal;updateLog(`The fountain restores ${heal} HP.`,'heal');}
  else updateLog('You pass by the healing fountain.','info');
  completeRoom();scheduleAction(()=>{gameState.turnPending=false;advanceRoom();},300);
}
function useFountain(){resolveFountain(true);}function skipFountain(){resolveFountain(false);}
function advanceRoom(){
  if(gameState.lootOpen||!gameState.started||gameState.gameOver||gameState.paused||gameState.floorTransitioning||gameState.inCombat||gameState.turnPending)return;
  completeRoom();cancelPendingActions();
  if(gameState.room===BALANCE.roomsPerFloor)completeFloor();else{gameState.room++;enterRoom();}
}
function completeFloor(){
  if(gameState.floorTransitioning||gameState.gameOver)return;
  gameState.floorTransitioning=true;completeRoom();
  if(gameState.floor>=BALANCE.maxFloor){winGame();return;}
  const gold=awardGold(rand(10,20+gameState.floor*5)),xp=rand(10,30+gameState.floor*5);
  gameState.player.xp+=xp;
  updateLog(`Floor ${gameState.floor} cleared! +${gold} Gold, +${xp} XP.`,'levelup');
  renderMainArea(`<div class="scene-icon">🏰</div><div class="scene-title">Floor ${gameState.floor} Cleared!</div><div class="scene-desc">The vault continues deeper...</div>`);
  checkLevelUp(()=>scheduleAction(()=>{
    gameState.floor++;gameState.room=1;gameState.roomsCompleted=[];
    gameState.floorLayout=[];gameState.floorTransitioning=false;enterRoom();
  },700));
}
function gameOver(){
  cancelPendingActions();gameState.gameOver=true;gameState.inCombat=false;gameState.turnPending=false;
  const p=gameState.player;
  const isNewHigh=gameState.floor>gameState.highScoreFloor||
    (gameState.floor===gameState.highScoreFloor&&gameState.room>gameState.highScoreRoom)||
    (gameState.floor===gameState.highScoreFloor&&gameState.room===gameState.highScoreRoom&&p.level>gameState.highScoreLevel);
  if(isNewHigh){gameState.highScoreFloor=gameState.floor;gameState.highScoreRoom=gameState.room;gameState.highScoreLevel=p.level;saveRecord();}
  updateLog('You have fallen in the Obsidian Vault.','boss');renderUI();
  renderMainArea(`<div id="game-over-screen" class="active"><div class="go-icon">☠</div><div class="go-title">Game Over</div><div class="go-subtitle">The Vault claims another adventurer...</div>
    <div class="go-stats"><div class="go-section-title">Journey</div>
    <div class="go-stat-row"><span class="go-stat-label">Hero</span><span class="go-stat-value">${escapeHtml(p.name)}</span></div>
    <div class="go-stat-row"><span class="go-stat-label">Class / Race</span><span class="go-stat-value">${CLASSES[p.classId].name} · ${RACES[p.raceId].name}</span></div>
    <div class="go-stat-row"><span class="go-stat-label">Floor / Room</span><span class="go-stat-value">${gameState.floor} / ${gameState.room}</span></div>
    <div class="go-stat-row"><span class="go-stat-label">Rooms Cleared</span><span class="go-stat-value">${gameState.totalRoomsCleared}</span></div>
    <div class="go-stat-row"><span class="go-stat-label">Level</span><span class="go-stat-value">${p.level}</span></div>
    <div class="go-stat-row"><span class="go-stat-label">Gold Earned</span><span class="go-stat-value">${p.totalGoldEarned}</span></div></div>
    ${isNewHigh?'<div class="high-score-msg">🏆 New High Score!</div>':''}
    <button class="btn btn-primary" onclick="renderHub()">Return to Character Hub</button>
    </div>`);
}
function restartGame(){renderHub();}
async function init(){
  try{
    const names=['classes','races','enemies','bosses','intents','balance','items','perks','skills','loot'];
    const loaded=await Promise.all(names.map(async name=>{const r=await fetch(`data/${name}.json`);if(!r.ok)throw new Error(`${name}: HTTP ${r.status}`);return r.json();}));
    [CLASSES,RACES,ENEMY_TYPES,BOSSES,INTENTS,BALANCE,ITEMS,PERKS,SKILLS,LOOT]=loaded;
    loadRecord();renderHub();
  }catch(error){renderMainArea(`<h2>Unable to load game data</h2><p>Serve this folder over HTTP and reload.</p><p>${escapeHtml(error.message)}</p><button class="btn" onclick="location.reload()">Retry</button>`);}
}

init();


function arcaneBolt(){
 const p=gameState.player,c=gameState.combat,skill=SKILLS.arcaneBolt;
 if(p.classId!=='wizard'||!combatAllowed()||gameState.turnPending||c.owner!=='player'||c.playerTurns<p.boltReadyAt||p.resource<skill.cost)return;
 if(!startPlayerAction())return;
 p.resource-=skill.cost;p.boltReadyAt=c.playerTurns+skill.cooldown+1;
 const damage=Math.round(skill.baseDamage+p.level*skill.levelScale+p.intellect*skill.intellectScale);
 gameState.currentEnemy.hp=Math.max(0,gameState.currentEnemy.hp-damage);
 updateLog(`Arcane Bolt deals ${damage} arcane damage (ignores Defense).`,'combat');
 if(gameState.currentEnemy.hp<=0)enemyDefeated();else finishPlayerAction();
}
