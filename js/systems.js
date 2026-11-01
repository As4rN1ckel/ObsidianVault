'use strict';
const label=k=>k.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());
let nextItemId=1,panelOpener=null;
function createItem(id,tierIndex=0){
  const def=ITEMS[id],tier=def.kind==='material'||id==='potion'?null:BALANCE.tiers[tierIndex];
  const item={...structuredClone(def),id,uid:nextItemId++,tier:tier?.id||null,name:tier?`${tier.name} ${def.name}`:def.name,price:Math.round(def.price*(tier?.priceMultiplier||1))};
  if(tier){for(const key of ['flat','percent'])if(item[key])for(const stat in item[key])item[key][stat]*=tier.multiplier;
    if(item.weaponDamage)item.weaponDamage=Math.round(item.weaponDamage*tier.multiplier);}
  return item;
}
function recalculate(p){
  const flat={},percent={};
  const effects=[...Object.values(p.equipment).filter(Boolean),...PERKS[p.classId].filter(x=>p.perks.includes(x.id))];
  for(const effect of effects)for(const [kind,target] of [['flat',flat],['percent',percent]])for(const [key,value] of Object.entries(effect[kind]||{}))target[key]=(target[key]||0)+value;
  const value=(key,base)=> (base+(flat[key]||0))*(1+(percent[key]||0));
  for(const key of BALANCE.attributes)p[key]=Math.max(1,value(key,p.attributes[key]));
  const weapon=p.equipment.weapon;
  p.maxHp=Math.max(1,Math.round(value('maxHp',BALANCE.hpBase+p.vitality*BALANCE.hpPerVitality)));
  p.damage=Math.max(1,Math.round(value('damage',weapon?(weapon.weaponDamage+p[weapon.mainAttribute]*BALANCE.damagePerAttribute):1)));
  p.defense=Math.max(0,Math.floor(value('defense',p.vitality*BALANCE.defensePerVitality)));
  p.maxResource=Math.max(1,Math.round(value('maxResource',BALANCE.resourceBase+(CLASSES[p.classId].resource==='mana'?p.intellect:p.vitality)*BALANCE.resourcePerAttribute)));
  p.critChance=clamp(value('critChance',critChance(p.luck)),0,BALANCE.critCap);
  p.dodgeChance=clamp(value('dodgeChance',BALANCE.dodgeBase+p.agility*BALANCE.dodgePerAgility),0,BALANCE.dodgeCap);
  p.blockChance=clamp(value('blockChance',BALANCE.blockBase),0,BALANCE.blockCap);
  p.speed=Math.max(1,Math.round(value('speed',BALANCE.speedBase+p.agility*BALANCE.speedPerAgility)));
  p.backpackSlots=Math.max(BALANCE.backpackSlots,Math.floor(value('backpackSlots',BALANCE.backpackSlots)));
  p.hp=clamp(p.hp,0,p.maxHp);p.resource=clamp(p.resource,0,p.maxResource);
}
function canManage(){return gameState.started&&!gameState.gameOver&&!gameState.floorTransitioning&&!gameState.turnPending&&(!gameState.inCombat||gameState.combat?.owner==='player');}
function openPanel(tab){
  if(!canManage()&&!gameState.panel)return;
  if(!gameState.panel)panelOpener=document.activeElement;
  gameState.panel=tab;gameState.paused=true;$modalOverlay.classList.add('active');renderPanel();
  $('close-panel').focus();
}
function closePanel(){
  if(!gameState.panel)return;
  gameState.panel=null;gameState.paused=false;$modalOverlay.classList.remove('active');renderUI();
  if(gameState.inCombat)renderCombatUI();
  if(isMerchant())showMerchant();
  else if(!gameState.inCombat&&gameState.floorLayout[gameState.room-1]==='fountain')showHealingFountain();
  if(panelOpener?.isConnected)panelOpener.focus();
}
document.addEventListener('keydown',e=>{if(!document.getElementById('modal-overlay')?.classList.contains('active'))return;if(e.key==='Escape')closePanel();if(e.key==='Tab'){const controls=[...document.querySelectorAll('#management-panel button:not(:disabled)')];const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
function statCards(p){
  const stats={maxHp:p.maxHp,damage:p.damage,defense:p.defense,critChance:percentText(p.critChance),[CLASSES[p.classId].resource]:`${p.resource}/${p.maxResource}`,blockChance:percentText(p.blockChance),dodgeChance:percentText(p.dodgeChance),speed:p.speed};
  return `<div class="stat-grid">${Object.entries(stats).map(([k,v])=>`<span>${label(k)}<b>${v}</b></span>`).join('')}</div>`;
}
function percentText(v){return `${Math.round(v*1000)/10}%`;}
function renderPanel(message=''){
  const p=gameState.player,character=gameState.panel==='character';
  $('management-panel').innerHTML=`<div class="panel-header"><h2 id="panel-title">${character?'Character & Progression':'Inventory & Equipment'}</h2><button id="close-panel" class="btn" onclick="closePanel()">Close</button></div>
  <p class="help-text">${escapeHtml(p.name)} · Level ${p.level} ${CLASSES[p.classId].name}</p>
  <nav class="panel-nav"><button class="btn" onclick="openPanel('character')">Character · ${p.ap} AP / ${p.cp} CP</button><button class="btn" onclick="openPanel('inventory')">Inventory · ${p.inventory.length}/${p.backpackSlots}</button></nav>
  <div class="panel-message" role="status">${escapeHtml(message)}</div>${character?characterMarkup(p):inventoryMarkup(p)}`;
}
function characterMarkup(p){
  const explanations={might:'Scales Might weapons and Fighter Block.',agility:'Scales Agility weapons, Dodge and action speed.',intellect:'Scales Intellect weapons and Mana capacity.',vitality:'Grants 7 HP, 0.2 Defense and Stamina capacity per point.',luck:'Increases critical chance and gold finds.'};
  return `<section class="panel-section"><h3>Attributes · ${p.ap} AP available</h3>${BALANCE.attributes.map(k=>`<div class="item-row"><div><strong>${label(k)} · ${Math.round(p[k]*10)/10}</strong><small>Base ${p.attributes[k]} · ${explanations[k]}</small></div><button class="btn" onclick="spendAttribute('${k}')" ${p.ap<1?'disabled':''}>+1 · 1 AP</button></div>`).join('')}</section>
  <section class="panel-section"><h3>Combat stats</h3>${statCards(p)}<p class="help-text">Damage = weapon base + ${BALANCE.damagePerAttribute} × weapon main attribute, then gear modifiers. Defense = gear + floor(Vitality × ${BALANCE.defensePerVitality}). Block halves a hit; Dodge avoids it. Flat bonuses apply before summed percentage modifiers.</p></section>
  <section class="panel-section"><h3>${CLASSES[p.classId].name} perks · ${p.cp} CP available</h3><p class="help-text">Each node costs 1 CP. Small placeholder bonuses; follow the branches to unlock mastery. Unspent AP and CP remain available.</p><div class="perk-tree">${PERKS[p.classId].map((perk,i)=>`${i===1||i===3?'<div class="tree-connector" aria-hidden="true">↓</div>':''}<div class="perk ${p.perks.includes(perk.id)?'learned':''}"><strong>${perk.name}</strong><small>${perk.description}</small><small>${perk.requires.length?'Requires: '+perk.requires.map(id=>PERKS[p.classId].find(x=>x.id===id).name).join(' + '):'Starting node'}</small><button class="btn" onclick="learnPerk('${perk.id}')" ${p.cp<1||p.perks.includes(perk.id)||!perk.requires.every(x=>p.perks.includes(x))?'disabled':''}>${p.perks.includes(perk.id)?'Learned':'Learn · 1 CP'}</button></div>`).join('')}</div></section>`;
}
function spendAttribute(key){const p=gameState.player;if(gameState.panel!=='character'||p.ap<1||!BALANCE.attributes.includes(key))return;p.ap--;p.attributes[key]++;recalculate(p);renderUI();renderPanel();}
function learnPerk(id){const p=gameState.player,perk=PERKS[p.classId].find(x=>x.id===id);if(gameState.panel!=='character'||!perk||p.cp<1||p.perks.includes(id)||!perk.requires.every(x=>p.perks.includes(x)))return;p.cp--;p.perks.push(id);recalculate(p);renderUI();renderPanel();}
function itemDescription(item){return [item.slot?label(item.slot):item.category,...(item.weaponDamage?[`${item.weaponDamage} base Damage + ${label(item.mainAttribute)} scaling`]:[]),...Object.entries(item.flat||{}).map(([k,v])=>`+${Math.round(v*100)/100} ${label(k)}`),...Object.entries(item.percent||{}).map(([k,v])=>`+${percentText(v)} ${label(k)}`),item.description||''].filter(Boolean).join(' · ');}
function itemRow(item,actions){return `<div class="item-row tier-${item.tier||'none'}"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(itemDescription(item))}</small></div><div class="item-actions">${actions}</div></div>`;}
function inventoryMarkup(p){
  return `<section class="panel-section"><h3>Equipment</h3>${Object.entries(p.equipment).map(([slot,item])=>item?itemRow(item,`<button class="btn" onclick="unequip('${slot}')">Unequip</button>`):`<div class="item-row"><span>${label(slot)} · Empty</span></div>`).join('')}
  <div class="item-row"><div><strong>Consumable · Healing Potions ${p.potions}/${BALANCE.potionSlots}</strong><small>One equipped potion per belt slot. Drinking consumes an action in combat.</small></div><button class="btn" onclick="stowPotion()" ${p.potions<1||p.inventory.length>=p.backpackSlots?'disabled':''}>Store</button><button class="btn" onclick="drinkOutsideCombat()" ${gameState.inCombat||p.potions<1||p.hp>=p.maxHp?'disabled':''}>Drink</button></div></section>
  <section class="panel-section"><h3>Backpack · ${p.inventory.length}/${p.backpackSlots} slots</h3><p class="help-text">Each item or material uses one slot. Equip or sell loot to make room. Iron → Steel → Obsidian are quality tiers, not materials.</p>${p.inventory.map(item=>itemRow(item,`${item.slot?`<button class="btn" onclick="equip(${item.uid})">${item.id==='potion'?'Move to belt':'Equip'}</button>`:''}<button class="btn" onclick="discardItem(${item.uid})">Discard</button>`)).join('')||'<p class="help-text">Your backpack is empty. Find loot in battles and treasure rooms.</p>'}</section>`;
}
function equip(uid){
 const p=gameState.player;if(gameState.panel!=='inventory')return;const index=p.inventory.findIndex(x=>x.uid===uid),item=p.inventory[index];if(!item?.slot)return;
 if(item.id==='potion'){if(p.potions>=BALANCE.potionSlots){renderPanel('Potion belt is full.');return;}p.potions++;p.inventory.splice(index,1);}
 else {
   const preview=structuredClone(p),old=p.equipment[item.slot];preview.equipment[item.slot]=item;recalculate(preview);
   if(p.inventory.length-1+(old?1:0)>preview.backpackSlots){renderPanel('Make room before equipping a smaller backpack.');return;}
   p.inventory.splice(index,1);p.equipment[item.slot]=item;if(old)p.inventory.push(old);recalculate(p);
 }

 renderUI();renderPanel();
}
function unequip(slot){
 const p=gameState.player;if(gameState.panel!=='inventory'||!p.equipment[slot])return;
 const old=p.equipment[slot],preview=structuredClone(p);preview.equipment[slot]=null;recalculate(preview);
 if(p.inventory.length+1>preview.backpackSlots){renderPanel('Not enough backpack space to unequip.');return;}
 p.equipment[slot]=null;recalculate(p);p.inventory.push(old);renderUI();renderPanel();
}
function discardItem(uid){const p=gameState.player;if(gameState.panel!=='inventory')return;const i=p.inventory.findIndex(x=>x.uid===uid);if(i<0)return;const item=p.inventory[i];p.inventory.splice(i,1);renderPanel(`Discarded ${item.name}.`);}
function drinkOutsideCombat(){const p=gameState.player;if(gameState.panel!=='inventory'||gameState.inCombat||p.potions<1||p.hp>=p.maxHp)return;p.potions--;p.hp=Math.min(p.maxHp,p.hp+Math.floor(p.maxHp*BALANCE.potionHealing));renderUI();renderPanel();}
function addLoot(item){const p=gameState.player;if(item.id==='potion'&&p.potions<BALANCE.potionSlots){p.potions++;updateLog('Found a healing potion; equipped in belt.','loot');return true;}if(p.inventory.length>=p.backpackSlots){updateLog(`Backpack full: left ${item.name} behind.`,'info');return false;}p.inventory.push(item);updateLog(`Found ${item.name}.`,'loot');return true;}
function randomEquipment(){const ids=Object.keys(ITEMS).filter(id=>ITEMS[id].slot&&ITEMS[id].slot!=='consumable');const tier=gameState.floor>=20?rand(1,2):gameState.floor>=10?rand(0,1):0;return createItem(ids[rand(0,ids.length-1)],tier);}
function grantLoot(guaranteed=false){
 const materials=Object.keys(ITEMS).filter(id=>ITEMS[id].kind==='material'&&(gameState.floor>=6||ITEMS[id].category==='Basic'));
 addLoot(createItem(materials[rand(0,materials.length-1)]));
 if(guaranteed||Math.random()<.25)addLoot(randomEquipment());
 if(guaranteed||Math.random()<.3)addLoot(createItem('potion'));
}
function isMerchant(){return gameState.started&&!gameState.gameOver&&!gameState.inCombat&&gameState.floorLayout[gameState.room-1]==='merchant';}
function showMerchant(announce=false){
 if(!gameState.merchantStock)gameState.merchantStock={potions:rand(2,5),equipment:Array.from({length:rand(2,4)},()=>randomEquipment())};
 const p=gameState.player,stock=gameState.merchantStock;
 if(announce)updateLog('A merchant trades equipment, potions and materials. Stock is limited.','info');
 renderMainArea(`<div class="scene-icon">⚖</div><div class="scene-title">Wandering Merchant</div><p class="help-text">${p.gold} gold · Buy supplies or sell loot for ${Math.round(BALANCE.sellRatio*100)}% of its value.</p><div class="merchant-list"><h3>Limited stock</h3>${itemRow(createItem('potion'),`<span>${stock.potions} left</span><button class="btn" onclick="buyPotion()" ${stock.potions<1||p.gold<ITEMS.potion.price||!canReceivePotion()?'disabled':''}>Buy · ${ITEMS.potion.price}g</button>`)}${stock.equipment.map(item=>itemRow(item,`<button class="btn" onclick="buyGear(${item.uid})" ${p.gold<item.price||p.inventory.length>=p.backpackSlots?'disabled':''}>Buy · ${item.price}g</button>`)).join('')}
 <h3>Sell from backpack</h3>${p.inventory.map(item=>itemRow(item,`<button class="btn" onclick="sellItem(${item.uid})">Sell · ${sellPrice(item)}g</button>`)).join('')||'<p class="help-text">No items to sell. Unequip gear through Inventory to sell it.</p>'}${p.potions?`<button class="btn" onclick="sellPotion()">Sell belt potion · ${sellPrice(ITEMS.potion)}g</button>`:''}</div><div class="action-buttons"><button class="btn btn-primary" onclick="advanceRoom()">Walk Away →</button></div>`);
}
function canTrade(){return isMerchant()&&!gameState.paused&&!gameState.turnPending;}
function canReceivePotion(){const p=gameState.player;return p.potions<BALANCE.potionSlots||p.inventory.length<p.backpackSlots;}
function buyPotion(){const p=gameState.player,s=gameState.merchantStock,cost=ITEMS.potion.price;if(!canTrade()||!s||s.potions<1||p.gold<cost||!canReceivePotion())return;p.gold-=cost;s.potions--;addLoot(createItem('potion'));renderUI();showMerchant();}
function buyGear(uid){const p=gameState.player,s=gameState.merchantStock;if(!canTrade()||!s)return;const i=s.equipment.findIndex(x=>x.uid===uid),item=s.equipment[i];if(!item||p.gold<item.price||p.inventory.length>=p.backpackSlots)return;p.gold-=item.price;s.equipment.splice(i,1);p.inventory.push(item);renderUI();showMerchant();}
function sellPrice(item){return Math.max(1,Math.floor(item.price*BALANCE.sellRatio));}
function sellItem(uid){const p=gameState.player;if(!canTrade())return;const i=p.inventory.findIndex(x=>x.uid===uid);if(i<0)return;p.gold+=sellPrice(p.inventory[i]);p.inventory.splice(i,1);renderUI();showMerchant();}
function sellPotion(){const p=gameState.player;if(!canTrade()||p.potions<1)return;p.potions--;p.gold+=sellPrice(ITEMS.potion);renderUI();showMerchant();}
function winGame(){
 cancelPendingActions();gameState.gameOver=true;gameState.inCombat=false;
 if(gameState.highScoreFloor<=BALANCE.maxFloor){gameState.highScoreFloor=BALANCE.maxFloor;gameState.highScoreRoom=BALANCE.roomsPerFloor;gameState.highScoreLevel=Math.max(gameState.highScoreLevel,gameState.player.level);saveRecord();}
 renderUI();renderMainArea(`<div class="scene-icon">♛</div><div class="scene-title">The Vault is conquered</div><div class="scene-desc">All ${BALANCE.maxFloor} floors cleared. ${escapeHtml(gameState.player.name)} returns from the depths.</div><button class="btn btn-primary" onclick="renderHub()">Return to Character Hub</button>`);
}

function stowPotion(){const p=gameState.player;if(gameState.panel!=='inventory'||p.potions<1||p.inventory.length>=p.backpackSlots)return;p.potions--;p.inventory.push(createItem('potion'));renderUI();renderPanel();}
