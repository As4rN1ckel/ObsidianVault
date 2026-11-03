'use strict';
const label=k=>k.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());
let nextItemId=1,panelOpener=null;
function createItem(id){if(!ITEMS[id])throw Error('Unknown item: '+id);return {...structuredClone(ITEMS[id]),id,uid:nextItemId++,quantity:1};}
function recalculate(p){
  const flat={},percent={};
  const manaUser=CLASSES[p.classId].resource==='mana';
  const effects=[...Object.values(p.equipment).filter(Boolean),...PERKS[p.classId].filter(x=>p.perks.includes(x.id))];
  for(const effect of effects)for(const [kind,target] of [['flat',flat],['percent',percent]])for(const [key,value] of Object.entries(effect[kind]||{}))target[key]=(target[key]||0)+value;
  const value=(key,base)=> (base+(flat[key]||0))*(1+(percent[key]||0));
  for(const key of BALANCE.attributes)p[key]=Math.max(1,value(key,p.attributes[key]));
  const weapon=p.equipment.weapon;
  p.maxHp=Math.max(1,Math.round(value('maxHp',BALANCE.hpBase+p.vitality*BALANCE.hpPerVitality)));
  p.damage=Math.max(1,Math.round(value('damage',weapon?(weapon.weaponDamage+p[weapon.mainAttribute]*BALANCE.damagePerAttribute):1)));
  p.defense=Math.max(0,Math.floor(value('defense',p.vitality*BALANCE.defensePerVitality)));
  p.maxResource=Math.max(1,Math.round(value('maxResource',BALANCE.resourceBase+(manaUser?p.intellect:p.vitality)*BALANCE.resourcePerAttribute+(manaUser?(flat.maxMana||0):0))));
  p.critChance=clamp(value('critChance',critChance(p.luck)),0,BALANCE.critCap);
  p.dodgeChance=clamp(value('dodgeChance',BALANCE.dodgeBase+p.agility*BALANCE.dodgePerAgility),0,BALANCE.dodgeCap);
  p.blockChance=clamp(value('blockChance',BALANCE.blockBase),0,BALANCE.blockCap);
  p.speed=Math.max(1,Math.round(value('speed',BALANCE.speedBase+p.agility*BALANCE.speedPerAgility)));
  p.backpackSlots=Math.max(BALANCE.backpackSlots,Math.floor(value('backpackSlots',BALANCE.backpackSlots)));
  p.resourceRegen=Math.max(0,value('resourceRegen',BALANCE.resourceRegen+(manaUser?(flat.manaRegen||0):0)));
  p.skillSlots=Math.max(1,Math.floor(value('skillSlots',BALANCE.skillSlots)));
  p.armorPenetration=clamp(value('armorPenetration',0),0,1);
  p.hp=clamp(p.hp,0,p.maxHp);p.resource=clamp(p.resource,0,p.maxResource);
}
function canManage(){return gameState.started&&!gameState.gameOver&&!gameState.floorTransitioning&&!gameState.turnPending&&!gameState.inCombat;}
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
  if(gameState.lootOpen)renderLoot();
  else if(isMerchant())showMerchant();
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
  $('management-panel').innerHTML=`<div class="panel-header"><h2 id="panel-title">${character?'Character':gameState.panel==='talents'?'Talents & Skills':'Inventory & Equipment'}</h2><button id="close-panel" class="btn" onclick="closePanel()">Close</button></div>
  <p class="help-text">${escapeHtml(p.name)} · Level ${p.level} ${CLASSES[p.classId].name}</p>
  <nav class="panel-nav"><button class="btn" onclick="openPanel('character')">Character · ${p.ap} AP</button><button class="btn" onclick="openPanel('talents')">Talents & Skills · ${p.cp} CP</button><button class="btn" onclick="openPanel('inventory')">Inventory · ${p.inventory.length}/${p.backpackSlots}</button></nav>
  <div class="panel-message" role="status">${escapeHtml(message)}</div>${character?characterMarkup(p):gameState.panel==='talents'?talentsMarkup(p):inventoryMarkup(p)}`;
}
function characterMarkup(p){
  const explanations={might:'Scales Might weapons and Fighter Block.',agility:'Scales Agility weapons, Dodge and action speed.',intellect:'Scales Intellect weapons and Mana capacity.',vitality:'Grants 5 HP, 0.2 Defense and Stamina capacity per point.',luck:'Increases critical chance and gold finds.'};
  return `<section class="panel-section"><h3>Attributes · ${p.ap} AP available</h3>${BALANCE.attributes.map(k=>`<div class="item-row"><div><strong>${label(k)} · ${Math.round(p[k]*10)/10}</strong><small>Base ${p.attributes[k]} · ${explanations[k]}</small></div><button class="btn" onclick="spendAttribute('${k}')" ${p.ap<1?'disabled':''}>+1 · 1 AP</button></div>`).join('')}</section>
  <section class="panel-section"><h3>Combat stats</h3>${statCards(p)}<p class="help-text">Damage = weapon base + ${BALANCE.damagePerAttribute} × weapon main attribute, then gear modifiers. Defense = gear + floor(Vitality × ${BALANCE.defensePerVitality}). Block halves a hit; Dodge avoids it. Flat bonuses apply before summed percentage modifiers.</p></section>
  `;
}
function spendAttribute(key){if(gameState.inCombat)return;const p=gameState.player;if(gameState.panel!=='character'||p.ap<1||!BALANCE.attributes.includes(key))return;p.ap--;p.attributes[key]++;recalculate(p);renderUI();renderPanel();}
function learnPerk(id){if(gameState.inCombat)return;const p=gameState.player,perk=PERKS[p.classId].find(x=>x.id===id);if(gameState.panel!=='talents'||!perk||p.cp<1||p.perks.includes(id)||!perk.requires.every(x=>p.perks.includes(x)))return;p.cp--;p.perks.push(id);if(perk.skill&&p.equippedSkills.length<p.skillSlots)p.equippedSkills.push(perk.skill);recalculate(p);renderUI();renderPanel();}
function signedStat(key,value,percent=false){
 const rate=percent||['critChance','dodgeChance','blockChance','armorPenetration'].includes(key);
 const name={maxMana:'Max Mana',manaRegen:'Mana / turn',resourceRegen:'Resource / turn',skillSlots:'Ability slots',backpackSlots:'Backpack slots'}[key]||label(key);
 return `${value>=0?'+':''}${rate?percentText(value):Math.round(value*100)/100} ${name}`;
}
function itemDescription(item){return [item.type?label(item.type):label(item.slot||item.kind),...(item.weaponDamage?[`${item.weaponDamage} base Damage · ${label(item.mainAttribute)} scaling`]:[]),...Object.entries(item.flat||{}).map(([k,v])=>signedStat(k,v)),...Object.entries(item.percent||{}).map(([k,v])=>signedStat(k,v,true)),item.description||''].filter(Boolean).join(' · ');}
function itemRow(item,actions){return `<div class="item-row"><div><strong>${escapeHtml(item.name)}${(item.quantity||1)>1?' ×'+item.quantity:''}</strong><small>${escapeHtml(itemDescription(item))}</small></div><div class="item-actions">${actions}</div></div>`;}
function equipmentComparison(item,p){
 if(!item.slot||item.slot==='consumable')return '';
 const preview=structuredClone(p);preview.equipment[item.slot]=item;recalculate(preview);
 const stats=['damage','defense','speed','maxHp','maxResource','resourceRegen','skillSlots','backpackSlots','critChance','dodgeChance','blockChance','armorPenetration'];
 const changes=stats.filter(k=>Math.abs(preview[k]-p[k])>.00001).map(k=>`<span class="${preview[k]>p[k]?'gain':'loss'}">${escapeHtml(signedStat(k,preview[k]-p[k]))}</span>`).join('');
 return `<div class="gear-comparison">${changes||'<span>No combat stat change</span>'}</div>`;
}
function inventoryMarkup(p){
 const groups=[['weapon','Weapons'],['offhand','Off-hands'],['armor','Armor'],['backpack','Backpacks'],['accessory','Accessories'],['consumable','Consumables'],['material','Materials']];
 return `<section class="panel-section"><h3>Equipped gear</h3><div class="equipment-grid">${Object.entries(p.equipment).map(([slot,item])=>`<section class="equipment-slot"><h4>${slot==='offhand'?'Off-hand':label(slot)}</h4>${item?itemRow(item,`<button class="btn" onclick="unequip('${slot}')">Unequip</button>`):'<p class="help-text">Empty</p>'}</section>`).join('')}</div>
 <div class="item-row"><div><strong>Potion belt · ${p.potions}/${BALANCE.potionSlots}</strong><small>Healing Potions · 30% Max HP</small></div><div class="item-actions"><button class="btn" onclick="stowPotion()" ${p.potions<1||p.inventory.length>=p.backpackSlots?'disabled':''}>Store</button><button class="btn" onclick="drinkOutsideCombat()" ${p.potions<1||p.hp>=p.maxHp?'disabled':''}>Drink</button></div></div></section>
 <section class="panel-section"><h3>Carried items · ${p.inventory.length}/${p.backpackSlots} slots</h3><p class="help-text">${escapeHtml(p.equipment.backpack?.name||'No backpack')} · 2 base + ${p.backpackSlots-2} gear slots · Materials stack to ${BALANCE.materialStack}.</p>${groups.map(([slot,title])=>{const items=p.inventory.filter(item=>(item.slot||item.kind)===slot).sort((a,b)=>(a.type||'').localeCompare(b.type||'')||(a.minFloor||0)-(b.minFloor||0)||a.name.localeCompare(b.name));return items.length?`<section class="inventory-group"><h4>${title} · ${items.length}</h4>${items.map(item=>`<div class="inventory-entry">${itemRow(item,`${item.slot?`<button class="btn" onclick="equip(${item.uid})">${item.id==='potion'?'Move to belt':'Equip'}</button>`:''}<button class="btn" onclick="discardItem(${item.uid})">Discard</button>`)}${equipmentComparison(item,p)}</div>`).join('')}</section>`:'';}).join('')||'<p class="help-text">Your backpack is empty.</p>'}</section>`;
}
function equip(uid){if(gameState.inCombat)return;
 const p=gameState.player;if(gameState.panel!=='inventory')return;const index=p.inventory.findIndex(x=>x.uid===uid),item=p.inventory[index];if(!item?.slot)return;
 if(item.id==='potion'){if(p.potions>=BALANCE.potionSlots){renderPanel('Potion belt is full.');return;}p.potions++;p.inventory.splice(index,1);}
 else {
   const preview=structuredClone(p),old=p.equipment[item.slot];preview.equipment[item.slot]=item;recalculate(preview);
   if(p.equippedSkills.length>preview.skillSlots){renderPanel('Unslot an ability in Talents & Skills before removing this weapon.');return;}
   if(p.inventory.length-1+(old?1:0)>preview.backpackSlots){renderPanel('Make room before equipping a smaller backpack.');return;}
   p.inventory.splice(index,1);p.equipment[item.slot]=item;if(old)p.inventory.push(old);recalculate(p);
 }

 renderUI();renderPanel();
}
function unequip(slot){if(gameState.inCombat)return;
 const p=gameState.player;if(gameState.panel!=='inventory'||!p.equipment[slot])return;
 const old=p.equipment[slot],preview=structuredClone(p);preview.equipment[slot]=null;recalculate(preview);
 if(p.equippedSkills.length>preview.skillSlots){renderPanel('Unslot an ability in Talents & Skills before removing this weapon.');return;}
 if(p.inventory.length+1>preview.backpackSlots){renderPanel('Not enough backpack space to unequip.');return;}
 p.equipment[slot]=null;recalculate(p);p.inventory.push(old);renderUI();renderPanel();
}
function discardItem(uid){if(gameState.inCombat)return;const p=gameState.player;if(gameState.panel!=='inventory')return;const i=p.inventory.findIndex(x=>x.uid===uid);if(i<0)return;const item=p.inventory[i];p.inventory.splice(i,1);renderPanel(`Discarded ${item.name}.`);}
function drinkOutsideCombat(){const p=gameState.player;if(gameState.panel!=='inventory'||gameState.inCombat||p.potions<1||p.hp>=p.maxHp)return;p.potions--;p.hp=Math.min(p.maxHp,p.hp+Math.floor(p.maxHp*BALANCE.potionHealing));renderUI();renderPanel();}
function addLoot(item){
 const p=gameState.player;
 if(item.id==='potion'&&p.potions<BALANCE.potionSlots){p.potions++;return true;}
 if(item.kind==='material'){
   let left=item.quantity||1;
   const stacks=p.inventory.filter(x=>x.id===item.id);
   const room=stacks.reduce((n,x)=>n+BALANCE.materialStack-x.quantity,0)+(p.backpackSlots-p.inventory.length)*BALANCE.materialStack;
   if(room<left)return false;
   for(const stack of stacks){const n=Math.min(left,BALANCE.materialStack-stack.quantity);stack.quantity+=n;left-=n;}
   while(left>0){const n=Math.min(left,BALANCE.materialStack);p.inventory.push({...item,uid:nextItemId++,quantity:n});left-=n;}return true;
 }
 if(p.inventory.length>=p.backpackSlots)return false;p.inventory.push(item);return true;
}
function equipmentPool(floor=gameState.floor){return Object.keys(ITEMS).filter(id=>ITEMS[id].slot&&ITEMS[id].slot!=='consumable'&&ITEMS[id].minFloor<=floor);}
function randomEquipment(){const ids=equipmentPool();return createItem(ids[rand(0,ids.length-1)]);}
function grantLoot(source='treasure'){
 const pool=source==='treasure'?{materials:['scrap','leather','cloth','ore','residue','core'],minQuantity:1,maxQuantity:3,equipmentChance:1,potionChance:1}:LOOT[source];
 if(!pool)throw Error('Missing loot pool: '+source);
 const item=createItem(pool.materials[rand(0,pool.materials.length-1)]);item.quantity=rand(pool.minQuantity,pool.maxQuantity);
 gameState.pendingLoot=[item];
 if(Math.random()<pool.equipmentChance)gameState.pendingLoot.push(randomEquipment());
 if(Math.random()<pool.potionChance)gameState.pendingLoot.push(createItem('potion'));
 gameState.lootOpen=true;renderLoot();
}
function renderLoot(message=''){
 renderMainArea(`<div class="scene-title">${gameState.lootTitle||'Treasure recovered'}</div><p class="help-text">Choose what to keep. Open Inventory to discard carried items and make room.</p><p role="status">${escapeHtml(message)}</p><div class="merchant-list">${gameState.pendingLoot.map(item=>itemRow(item,`<button class="btn" onclick="takeLoot(${item.uid})">Take</button><button class="btn" onclick="leaveLoot(${item.uid})">Discard</button>`)).join('')||'<p>All loot resolved.</p>'}</div><button class="btn btn-primary" onclick="finishLoot()" ${gameState.pendingLoot.length?'disabled':''}>Continue →</button>`);
}
function takeLoot(uid){if(!gameState.lootOpen||gameState.paused||gameState.inCombat)return;const i=gameState.pendingLoot.findIndex(x=>x.uid===uid);if(i<0)return;if(!addLoot(gameState.pendingLoot[i])){renderLoot('Not enough space. Discard a carried item in Inventory, or discard this drop.');return;}gameState.pendingLoot.splice(i,1);renderUI();renderLoot();}
function leaveLoot(uid){if(!gameState.lootOpen||gameState.paused)return;gameState.pendingLoot=gameState.pendingLoot.filter(x=>x.uid!==uid);renderLoot();}
function finishLoot(){if(!gameState.lootOpen||gameState.pendingLoot.length||gameState.paused)return;gameState.lootOpen=false;advanceRoom();}
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
function sellPrice(item){return Math.max(1,Math.floor(item.price*BALANCE.sellRatio)*(item.quantity||1));}
function sellItem(uid){const p=gameState.player;if(!canTrade())return;const i=p.inventory.findIndex(x=>x.uid===uid);if(i<0)return;p.gold+=sellPrice(p.inventory[i]);p.inventory.splice(i,1);renderUI();showMerchant();}
function sellPotion(){const p=gameState.player;if(!canTrade()||p.potions<1)return;p.potions--;p.gold+=sellPrice(ITEMS.potion);renderUI();showMerchant();}
function winGame(){
 cancelPendingActions();gameState.gameOver=true;gameState.inCombat=false;
 persistCharacter('completed');
 if(gameState.highScoreFloor<=BALANCE.maxFloor){gameState.highScoreFloor=BALANCE.maxFloor;gameState.highScoreRoom=BALANCE.roomsPerFloor;gameState.highScoreLevel=Math.max(gameState.highScoreLevel,gameState.player.level);saveRecord();}
 renderUI();renderMainArea(`<div class="scene-icon">♛</div><div class="scene-title">The Warden has fallen</div><div class="scene-desc">All ${BALANCE.maxFloor} floors cleared through Whisperwind Plains and Thornveil Forest. ${escapeHtml(gameState.player.name)} returns from the depths.</div><button class="btn btn-primary" onclick="renderMainMenu()">Main Menu</button>`);
}

function stowPotion(){if(gameState.inCombat)return;const p=gameState.player;if(gameState.panel!=='inventory'||p.potions<1||p.inventory.length>=p.backpackSlots)return;p.potions--;p.inventory.push(createItem('potion'));renderUI();renderPanel();}
