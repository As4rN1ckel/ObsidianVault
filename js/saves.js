'use strict';
const CHARACTER_PREFIX='obsidianVault.character.v1.';
const SNAPSHOT_FIELDS=['player','floor','room','roomsCompleted','totalRoomsCleared','floorLayout','currentEnemy','combat','inCombat','merchantStock','runSeed','pendingLoot','lootOpen','lootTitle','characterId','createdAt'];
function characterRecords(){
  const records=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);if(!key.startsWith(CHARACTER_PREFIX))continue;
    try{const record=JSON.parse(localStorage.getItem(key));if(record?.version===1&&record.id&&record.hero&&['active','memorial','completed'].includes(record.status))records.push(record);}catch(_){/* Ignore an unreadable record without changing other characters. */}
  }
  return records.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
function canSaveCharacter(){
  return gameState.started&&!gameState.gameOver&&!gameState.floorTransitioning&&!gameState.turnPending&&(!gameState.inCombat||gameState.combat?.owner==='player');
}
function storageMessage(message){$('save-status').textContent=message;}
function persistCharacter(status='active'){
  const p=gameState.player;if(!p||!gameState.characterId)return false;
  const record={version:1,id:gameState.characterId,status,createdAt:gameState.createdAt,updatedAt:new Date().toISOString(),hero:{name:p.name,classId:p.classId,raceId:p.raceId,level:p.level,floor:gameState.floor,room:gameState.room,roomsCleared:gameState.totalRoomsCleared,goldEarned:p.totalGoldEarned},snapshot:null};
  if(status==='active')record.snapshot=Object.fromEntries(SNAPSHOT_FIELDS.map(key=>[key,structuredClone(gameState[key])]));
  try{localStorage.setItem(CHARACTER_PREFIX+record.id,JSON.stringify(record));storageMessage(status==='memorial'?'Character added to the Memorial.':status==='completed'?'Victory recorded.':'Character saved.');return true;}
  catch(_){storageMessage('Unable to save. Browser storage is unavailable or full.');return false;}
}
function saveCharacter(announce=true){
  if(!canSaveCharacter())return false;
  const saved=persistCharacter();if(saved&&announce)updateLog('Character saved.','info');return saved;
}
function returnToMenu(){
  if(gameState.gameOver){renderMainMenu();return;}
  if(!saveCharacter(false))return;
  renderMainMenu();
}
function prepareMenu(){
  cancelPendingActions();gameState.started=false;gameState.paused=false;gameState.panel=null;
  $modalOverlay.classList.remove('active');$container.classList.add('hub-mode');
}
function renderMainMenu(){
  prepareMenu();
  let records;try{records=characterRecords();}catch(_){records=[];}
  const last=records.find(r=>r.status==='active');
  renderMainArea(`<section class="main-menu"><div class="hub-eyebrow">THE GATES OF THE VAULT</div><h2>Your next descent awaits</h2><div class="menu-actions"><button id="new-character" class="btn btn-primary" onclick="renderHub()">New Character</button><button class="btn" onclick="continueLastCharacter()" ${last?'':'disabled'}>Continue with Last Character${last?`<small>${escapeHtml(last.hero.name)} · Level ${last.hero.level}</small>`:''}</button><button class="btn" onclick="renderCharacterLibrary(false)">Load Character</button><button class="btn" onclick="renderCharacterLibrary(true)">Memorial</button></div><p class="help-text">Characters are saved in this browser.</p></section>`);
}
function continueLastCharacter(){
  try{const record=characterRecords().find(r=>r.status==='active');if(record)loadCharacter(record.id);}catch(_){renderCharacterLibrary(false,'Unable to read browser saves.');}
}
function renderCharacterLibrary(memorial=false,message='',dismissId=null){
  prepareMenu();let records=[];
  try{records=characterRecords().filter(r=>memorial?r.status==='memorial':r.status!=='memorial');}catch(_){message='Unable to read browser saves.';}
  renderMainArea(`<section class="character-library"><button class="btn" onclick="renderMainMenu()">← Main Menu</button><h2>${memorial?'Memorial':'Load Character'}</h2><p role="status">${escapeHtml(message)}</p>${records.map(r=>`<article class="character-card"><h3>${escapeHtml(r.hero.name)}</h3><p>Level ${r.hero.level} · ${escapeHtml(CLASSES[r.hero.classId]?.name||r.hero.classId)} · ${escapeHtml(RACES[r.hero.raceId]?.name||r.hero.raceId)}</p><p>Floor ${r.hero.floor} · Room ${r.hero.room} · ${r.hero.roomsCleared} rooms cleared</p><small>${r.status==='memorial'?'Fallen':r.status==='completed'?'Vault conquered':'Saved'} · ${escapeHtml(new Date(r.updatedAt).toLocaleString())}</small>${r.status==='active'?`<button class="btn btn-primary" data-character-id="${escapeHtml(r.id)}">Load Character</button>`:`<p>${r.hero.goldEarned} gold earned</p>`}${!memorial?`<div class="dismiss-actions">${dismissId===r.id?`<p>Delete ${escapeHtml(r.hero.name)} and their saved progress? This cannot be undone.</p><button class="btn btn-danger" data-confirm-dismiss="${escapeHtml(r.id)}">Delete Character</button><button class="btn" data-cancel-dismiss>Cancel</button>`:`<button class="btn" data-dismiss-character="${escapeHtml(r.id)}">Dismiss Character</button>`}</div>`:''}</article>`).join('')||`<p class="help-text">${memorial?'No fallen adventurers.':'No saved characters yet.'}</p>`}</section>`);
  $mainArea.querySelectorAll('[data-character-id]').forEach(button=>button.addEventListener('click',()=>loadCharacter(button.dataset.characterId)));
  $mainArea.querySelectorAll('[data-dismiss-character]').forEach(button=>button.addEventListener('click',()=>{renderCharacterLibrary(false,'',button.dataset.dismissCharacter);$mainArea.querySelector('[data-cancel-dismiss]').focus();}));
  $mainArea.querySelectorAll('[data-cancel-dismiss]').forEach(button=>button.addEventListener('click',()=>{renderCharacterLibrary();$mainArea.querySelector('[data-dismiss-character]')?.focus();}));
  $mainArea.querySelectorAll('[data-confirm-dismiss]').forEach(button=>button.addEventListener('click',()=>dismissCharacter(button.dataset.confirmDismiss)));

}
function dismissCharacter(id){
  try{
    const record=JSON.parse(localStorage.getItem(CHARACTER_PREFIX+id));
    if(!record||!['active','completed'].includes(record.status)){renderCharacterLibrary(false,'This character is unavailable.');return;}
    localStorage.removeItem(CHARACTER_PREFIX+id);
    renderCharacterLibrary(false,`${record.hero.name} dismissed.`);
  }catch(_){renderCharacterLibrary(false,'Unable to delete this character. Browser storage is unavailable.');}
}
function loadCharacter(id){
  let record;
  try{record=JSON.parse(localStorage.getItem(CHARACTER_PREFIX+id));}catch(_){renderCharacterLibrary(false,'Unable to read this character.');return;}
  if(record?.version!==1||record.status!=='active'||!record.snapshot?.player){renderCharacterLibrary(false,'This character is unavailable.');return;}
  cancelPendingActions();
  for(const key of SNAPSHOT_FIELDS)gameState[key]=structuredClone(record.snapshot[key]);
  Object.assign(gameState,{started:true,gameOver:false,paused:false,panel:null,turnPending:false,floorTransitioning:false});
  const items=[...gameState.player.inventory,...Object.values(gameState.player.equipment),...(gameState.pendingLoot||[]),...(gameState.merchantStock?.equipment||[])].filter(Boolean);
  nextItemId=Math.max(nextItemId,...items.map(item=>(item.uid||0)+1));
  $container.classList.remove('hub-mode');$modalOverlay.classList.remove('active');$logArea.replaceChildren();
  storageMessage('Character loaded.');renderUI();
  // Restore the existing scene without granting rewards or regenerating stock.
  if(gameState.inCombat)renderCombatUI();
  else if(gameState.lootOpen)renderLoot();
  else switch(gameState.floorLayout[gameState.room-1]){
    case 'merchant':showMerchant();break;
    case 'fountain':showHealingFountain();break;
    case 'empty':showEmptyRoom();break;
    default:showEntrance();
  }
  persistCharacter();updateLog(`${gameState.player.name} continues the descent.`,'info');
}
function nextTurnOrder(count=5){
  const c=gameState.combat,p=gameState.player,e=gameState.currentEnemy;if(!c||!e)return [];
  let playerNext=c.playerNext,enemyNext=c.enemyNext;
  const order=[];
  // A player's timestamp advances when their turn starts; an enemy's advances after it acts.
  if(c.owner){order.push(c.owner);if(c.owner==='enemy')enemyNext+=100/e.speed;}
  while(order.length<count){if(playerNext<=enemyNext+1e-8){order.push('player');playerNext+=100/p.speed;}else{order.push('enemy');enemyNext+=100/e.speed;}}
  return order;
}
function turnOrderMarkup(){
  return `<div class="turn-preview"><span>Turn order</span><ol aria-label="Next five turns">${nextTurnOrder().map((owner,i)=>`<li class="${owner}" ${i===0?'aria-current="step"':''} title="${i===0?'Current or next turn':'Upcoming turn'}">${i+1} · ${owner==='player'?'You':'Enemy'}</li>`).join('')}</ol></div>`;
}
