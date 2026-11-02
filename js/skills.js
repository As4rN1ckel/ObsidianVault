'use strict';
function unlockedSkills(p){return Object.keys(SKILLS).filter(id=>SKILLS[id].classId===p.classId&&(SKILLS[id].starting||PERKS[p.classId].some(node=>node.skill===id&&p.perks.includes(node.id))));}
function skillCost(id,p=gameState.player){const skill=SKILLS[id];return skill.costFraction?Math.max(1,Math.ceil(p.resource*skill.costFraction)):skill.cost;}
function skillCD(id){return Math.max(0,(gameState.player.skillCooldowns[id]||0)-(gameState.combat?.playerTurns||0));}
function skillBlocked(id,p){return (id==='fighter'&&p.blockHp>0)||(id==='wizard'&&p.magicShieldTurns>0)||(id==='rogue'&&p.dodgeReady);}
function skillButtons(turnReady){
 const p=gameState.player;
 return p.equippedSkills.map(id=>{const skill=SKILLS[id],cd=skillCD(id),cost=skillCost(id);return `<button class="btn btn-success" onclick="useSkill('${id}')" title="${escapeHtml(skill.description)}" ${!turnReady||cd||p.resource<cost||skillBlocked(id,p)?'disabled':''}>${skill.name} · ${cost} ${label(CLASSES[p.classId].resource)}${cd?` (CD ${cd})`:''}</button>`;}).join('');
}
function talentsMarkup(p){
 const unlocked=unlockedSkills(p);
 return `<section class="panel-section"><h3>Active loadout · ${p.equippedSkills.length}/${BALANCE.skillSlots} slots</h3><p class="help-text">Basic Attack and potions use no slots. Starting and unlocked skills share the same slots. Change your loadout outside combat. Cooldowns count your turns; a 3-turn cooldown means 3 intervening player turns.</p>${unlocked.map(id=>{const skill=SKILLS[id],equipped=p.equippedSkills.includes(id);return `<div class="item-row"><div><strong>${skill.name}</strong><small>${skill.description}</small><small>${skill.costFraction?'50% current Mana (rounded up)':skill.cost+' '+label(CLASSES[p.classId].resource)} · ${skill.cooldown}-turn cooldown</small></div><button class="btn" onclick="toggleSkill('${id}')" ${!equipped&&p.equippedSkills.length>=BALANCE.skillSlots?'disabled':''}>${equipped?'Unslot':'Slot'}</button></div>`;}).join('')}</section>
 <section class="panel-section"><h3>${CLASSES[p.classId].name} talent tree · ${p.cp} CP</h3><p class="help-text">Every node costs 1 CP. Prerequisites are listed on each node. Skill unlocks fill an empty slot automatically.</p><div class="talent-columns">${[['stats','Stats & Attributes'],['combat','Combat Specialization'],['mastery','Mastery & Utility']].map(([column,title])=>`<section class="talent-column"><h4>${title}</h4>${PERKS[p.classId].filter(node=>node.column===column).map(node=>{const learned=p.perks.includes(node.id),ready=node.requires.every(id=>p.perks.includes(id));return `<article class="talent-node ${learned?'learned':''}"><strong>${node.name}</strong><p>${node.description}</p><small>${node.requires.length?'Requires: '+node.requires.map(id=>PERKS[p.classId].find(n=>n.id===id).name).join(' + '):'Entry node'}</small><button class="btn" onclick="learnPerk('${node.id}')" ${learned||!ready||p.cp<1?'disabled':''}>${learned?'Learned':'Learn · 1 CP'}</button></article>`;}).join('')}</section>`).join('')}</div></section>`;
}
function toggleSkill(id){
 const p=gameState.player;
 if(gameState.inCombat||!canManage()||gameState.panel!=='talents'||!unlockedSkills(p).includes(id))return;
 const index=p.equippedSkills.indexOf(id);
 if(index>=0)p.equippedSkills.splice(index,1);else if(p.equippedSkills.length<BALANCE.skillSlots)p.equippedSkills.push(id);
 renderPanel();
}
function skillHit(raw,ignore=0){
 const e=gameState.currentEnemy,armor=e.defense+(e.armorHits>0?e.armorBonus:0);
 const damage=calculateDamage(raw,Math.floor(armor*(1-ignore)));
 e.hp=Math.max(0,e.hp-damage);
 if(e.armorHits>0&&ignore<1){e.armorHits--;if(!e.armorHits)e.armorBonus=0;}
 return damage;
}
function useSkill(id){
 const p=gameState.player,c=gameState.combat,skill=SKILLS[id];
 if(!skill||!combatAllowed()||c.owner!=='player'||gameState.turnPending||!p.equippedSkills.includes(id)||!unlockedSkills(p).includes(id)||skillCD(id)>0||p.resource<skillCost(id)||skillBlocked(id,p))return;
 const cost=skillCost(id);
 if(!startPlayerAction())return;
 p.resource-=cost;p.skillCooldowns[id]=c.playerTurns+skill.cooldown+1;
 const e=gameState.currentEnemy,enhanced=p.perks.includes('enhancement'),master=p.perks.includes('mastery');
 let damage=0;
 switch(id){
 case 'fighter':p.blockHp=Math.max(1,Math.ceil(p.defense*skill.shieldDefenseScale+p.might*skill.shieldMightScale));p.counterReady=true;updateLog(`Block: ${p.blockHp} shield.`,'info');break;
 case 'rogue':p.dodgeReady=true;p.dodgeBonus=true;updateLog('Dodge readied; next basic attack empowered.','info');break;
 case 'wizard':p.magicShieldTurns=skill.duration;updateLog('Magic Shield raised.','info');break;
 case 'arcaneBolt':damage=skillHit((skill.baseDamage+p.level*skill.levelScale+p.intellect*skill.intellectScale)*(enhanced?1.15:1),1);if(master)p.resource=Math.min(p.maxResource,p.resource+2);break;
 case 'shieldBash':damage=skillHit(p.damage*skill.multiplier*(enhanced?1.25:1));e.stunTurns=1;break;
 case 'heavyStrike':damage=skillHit(p.damage*skill.multiplier,skill.ignoreDefense);break;
 case 'poisonedBlade':damage=skillHit(p.damage*skill.multiplier);e.dots.poison={damage:Math.max(1,Math.round(skill.dotBase+p.agility*skill.dotScale)+(enhanced?1:0)),turns:skill.duration};break;
 case 'backstab':damage=skillHit(p.damage*skill.multiplier,e.armorHits>0?0:1);break;
 case 'manaSurge':{
  const heal=Math.min(p.maxHp-p.hp,Math.round(skill.healBase+p.intellect*skill.healScale));p.hp+=heal;
  for(const key of Object.keys(p.skillCooldowns))if(key!==id&&p.skillCooldowns[key]>c.playerTurns)p.skillCooldowns[key]=Math.max(c.playerTurns,p.skillCooldowns[key]-1);
  updateLog(`Mana Surge restores ${heal} HP and reduces other active cooldowns by 1.`,'heal');break;
 }
 case 'manaBurn':damage=skillHit(skill.baseDamage+p.intellect*skill.intellectScale,1);e.dots.burn={damage:Math.max(1,Math.round(e.maxHp*skill.dotPercent)),turns:skill.duration};break;
 }
 if(damage)updateLog(`${skill.name} deals ${damage} damage.`,'combat');
 if(e.hp<=0)enemyDefeated();else finishPlayerAction();
}
// Effects tick at the start of enemy actions, before stun; reapplication refreshes, not stacks.
function tickEnemyEffects(enemy){
 const p=gameState.player;
 for(const [id,dot] of Object.entries(enemy.dots||{})){
  enemy.hp=Math.max(0,enemy.hp-dot.damage);dot.turns--;
  updateLog(`${label(id)} deals ${dot.damage} damage (${dot.turns} ticks left).`,'combat');
  if(id==='poison'&&p.classId==='rogue'&&p.perks.includes('mastery'))p.resource=Math.min(p.maxResource,p.resource+1);
  if(dot.turns<=0)delete enemy.dots[id];
  if(enemy.hp<=0){enemyDefeated();return true;}
 }
 return false;
}
