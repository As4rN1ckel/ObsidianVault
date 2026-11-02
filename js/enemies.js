'use strict';
function biomeForFloor(floor){const biome=BIOMES.find(b=>floor>=b.minFloor&&floor<=b.maxFloor);if(!biome)throw Error('No biome for floor '+floor);return biome;}
function guardianKind(floor){const biome=biomeForFloor(floor);return floor===biome.bossFloor?(BOSSES.find(e=>e.id===biome.boss).kind):'elite';}
function instantiateEnemy(template,floor,kind=template.kind||'normal'){
 if(typeof kind==='boolean')kind=kind?(template.kind||'boss'):'normal';
 const scale=BALANCE.encounters[kind],hp=Math.max(1,Math.round((BALANCE.enemyHpBase+floor*BALANCE.enemyHpPerFloor+template.hp)*scale.hpMultiplier));
 return {id:template.id,lootId:kind==='elite'?'elite_'+template.id:template.id,
 name:(kind==='elite'?'Elite ':'')+template.name,kind,biome:template.biome,symbol:template.symbol,
 hp,maxHp:hp,damage:Math.max(1,Math.round((Math.round(BALANCE.enemyDamageBase+floor*BALANCE.enemyDamagePerFloor)+template.damage)*scale.damageMultiplier)),
 defense:Math.max(0,1+Math.floor(floor/3)+template.defense+scale.defenseBonus),speed:Math.max(3,9+template.speed+Math.floor(floor/5)),
 abilities:[...template.abilities,...(kind==='elite'?['savage']:[])],xpReward:Math.round((18+floor*4)*scale.xpMultiplier),
 isBoss:kind==='boss'||kind==='warden',isElite:kind==='elite',armorHits:0,armorBonus:0,intent:null,charged:false,enraged:false,
 dots:{},stunTurns:0,usedAbilities:[],phase:1,phase2:template.phase2?structuredClone(template.phase2):null,phaseTransitionPending:false};
}
function generateMonster(floor){const biome=biomeForFloor(floor),id=biome.enemies[rand(0,biome.enemies.length-1)];return instantiateEnemy(ENEMY_TYPES.find(e=>e.id===id),floor);}
function generateBoss(floor){
 const biome=biomeForFloor(floor);
 if(floor===biome.bossFloor)return instantiateEnemy(BOSSES.find(e=>e.id===biome.boss),floor);
 // Seeded guardian selection stays consistent for the floor throughout a run.
 const rng=seededRandom(gameState.runSeed+floor*101),id=biome.elitePool[Math.floor(rng()*biome.elitePool.length)];
 return instantiateEnemy(ENEMY_TYPES.find(e=>e.id===id),floor,'elite');
}
function getEnemySymbol(id){return [...ENEMY_TYPES,...BOSSES].find(e=>e.id===id)?.symbol||'◆';}
function updateEnemyPhase(enemy){
 if(!enemy.phase2||enemy.phase!==1||enemy.hp<=0||enemy.hp>enemy.maxHp*enemy.phase2.threshold)return false;
 enemy.phase=2;enemy.abilities=[...enemy.phase2.abilities];enemy.armorHits=0;enemy.armorBonus=0;
 enemy.damage=Math.round(enemy.damage*enemy.phase2.damageMultiplier);enemy.charged=false;
 enemy.phaseTransitionPending=true;enemy.intent='awakening';
 updateLog(`${enemy.name}: Phase 2! Bark shatters; damage rises 15%. The awakening consumes its next action.`,'boss');return true;
}
function selectEnemyIntent(enemy){
 if(enemy.phaseTransitionPending){enemy.intent='awakening';return;}
 if(enemy.charged){enemy.intent=enemy.charged;return;}
 const abilities=enemy.abilities.filter(id=>!INTENTS[id].once||!enemy.usedAbilities.includes(id));
 enemy.intent=abilities.length&&Math.random()<.4?abilities[rand(0,abilities.length-1)]:'attack';
}
function refreshEnemyIntent(){const e=gameState.currentEnemy;if(e&&gameState.inCombat)updateEnemyPhase(e);}
function enemyGold(enemy){const pool=LOOT[enemy.lootId||enemy.id];return pool?.goldDrop===true?Math.max(0,Math.floor(pool.goldAmount||0)):0;}
function resolveEnemyAction(){
 if(!combatAllowed())return;
 const e=gameState.currentEnemy,p=gameState.player;
 if(tickEnemyEffects(e))return;
 updateEnemyPhase(e);
 if(e.stunTurns>0){e.stunTurns--;if(p.magicShieldTurns>0)p.magicShieldTurns--;updateLog(`${e.name} is stunned and skips an action.`,'info');return;}
 const id=e.intent||'attack',action=INTENTS[id];
 if(action.effect==='prepare'){e.charged=action.followup;updateLog(`${e.name} prepares ${INTENTS[action.followup].name}.`,'combat');}
 else if(action.effect==='transition'){e.phaseTransitionPending=false;updateLog('The Warden awakens. Watch for Wrath of the Roots.','boss');}
 else if(action.effect==='buff'){e.damage=Math.round(e.damage*action.damageMultiplier);updateLog(`${e.name} howls: +20% Damage.`,'combat');}
 else if(action.effect==='armor'||action.effect==='restoreArmor'){e.armorBonus=action.armorBonus;e.armorHits=action.armorHits;}
 if(action.healPercent){const heal=Math.min(e.maxHp-e.hp,Math.max(1,Math.round(e.maxHp*action.healPercent)));e.hp+=heal;updateLog(`${e.name} restores ${heal} HP.`,'heal');}
 if(action.effect==='attack'){
  e.charged=false;
  const damage=enemyAttack(action.multiplier||1);
  if(damage>0&&p.hp>0&&e.hp>0){
   if(action.poisonTurns){p.poisonTurns=action.poisonTurns;p.poisonDamage=action.poisonDamage;updateLog(`Poison: ${p.poisonDamage} damage for ${p.poisonTurns} of your turns.`,'combat');}
   if(action.drain){const heal=Math.min(e.maxHp-e.hp,Math.round(damage*action.drain));e.hp+=heal;updateLog(`${e.name} drains ${heal} HP.`,'heal');}
   if(action.resourceDrain){const amount=Math.min(p.resource,action.resourceDrain);p.resource-=amount;updateLog(`Vines drain ${amount} ${label(CLASSES[p.classId].resource)}.`,'combat');}
   if(action.delay){gameState.combat.playerNext+=100/p.speed*action.delay;updateLog('The gust delays your next action.','info');}
  }
 }
 if(action.once)e.usedAbilities.push(id);
 if(p.magicShieldTurns>0)p.magicShieldTurns--;
 if(p.hp<=0){gameOver();return;}
 if(e.hp<=0){enemyDefeated();return;}
 updateEnemyPhase(e);selectEnemyIntent(e);
}
