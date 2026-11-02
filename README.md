# Obsidian Vault

A browser dungeon crawler: 10 floors, 10 rooms per floor. No build step or package dependencies.

## Run

From the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open the server in a browser. HTTP serving is required because game definitions load from JSON; opening `index.html` directly as a file will not work.

## Character and equipment

- Attributes: Might, Agility, Intellect, Vitality, Luck.
- Weapons scale Damage with their main attribute. Vitality adds HP and a small amount of Defense; Agility adds Dodge and action speed; Luck adds critical chance and gold finds.
- Wizards use Mana; Fighters and Rogues use Stamina. Skills spend resources, which regenerate each player turn.
- Each level awards **2 AP and 1 CP**. Open **Character** outside combat to spend AP and inspect derived stats; use **Talents & Skills** for CP perks, skill unlocks, and your loadout. Levelling never forces a modal. Each class has nine one-CP talent nodes across three columns: Stats & Attributes, Combat Specialization, and Mastery & Utility.
- **Inventory & Equipment** manages Weapon, Off-Hand, Armor, Backpack, Accessory, and a Consumable belt. New characters start with their class weapon only.
- Backpack starts at 14 slots; gear takes one slot and materials stack to 10 per slot. The potion belt holds six healing potions. Gear can expand backpack capacity; removing it cannot overflow inventory.
- Items have individual definitions without quality tiers. Flat bonuses apply first, then summed percentage modifiers.
- Merchants have 2–5 potions and limited equipment. Sell spare gear and materials at 35% value. Materials currently have no crafting use.
- Each floor has one entrance, one guardian, one fountain and one merchant (rooms 3–9), one or two treasure rooms (rooms 2–9), one empty room, and enemies in remaining rooms. Rooms 10 on floors 1–4 and 6–9 contain elites; floors 5 and 10 end in a boss and Warden respectively. Defeat the floor-10 Warden to win.

## Main menu and character saves

The main menu offers **New Character**, **Continue with Last Character**, **Load Character**, and **Memorial**. Each new adventurer receives a separate save; there is no game-imposed character limit. Saves live in this browser's local storage and are subject to its capacity. Clearing browser data removes them. Use **Dismiss Character** in Load Character to delete an active or completed character; an inline confirmation lets you cancel before removal. Memorial entries are preserved.

Session controls sit below the Adventure Journal. Use **Save Character** outside combat or during your player turn. **Main Menu** also saves before leaving a living run. Loading restores the exact character, floor layout, unresolved loot, merchant stock, enemy, effects, and combat timeline. New characters are saved on creation; later progress requires a manual save or returning through Main Menu. Death replaces that character's playable save with a permanent Memorial entry. Victories are retained as completed character records.

Block absorbs damage from the **next landed hit only**, then expires and counterattacks once. Dodged attacks do not consume Block. The Fighter mastery starting shield follows the same one-hit rule without a counterattack.

The HUD displays Speed, critical/dodge chances, and inventory capacity. Mana/Stamina sits directly below Health in a matching bar with a regeneration badge; XP uses a slim gold progress track below it. Combat previews the current/next turn and the following turns, five entries total, using the actual speed scheduler.

## Files

- `index.html`: page structure.
- `css/styles.css`: visual theme and responsive panels.
- `js/saves.js`: character saves, main menu, character library, memorials, and turn preview.
- `js/game.js`: loading, character creation, exploration, combat and levelling.
- `js/enemies.js`: biome encounter selection, guardian scaling, enemy intent execution, and Warden phase changes.
- `js/skills.js`: talent/loadout presentation, independent skill cooldowns, skill effects and enemy DoT processing.
- `js/systems.js`: derived stats, equipment, inventory, merchants, loot, progression panels.
- `data/`: classes, races, biomes, enemies, bosses, skills, intents, perks, items, enemy loot pools and balance constants. Tune these definitions without editing the combat loop. Item `flat` and `percent` maps can modify attributes and derived stats; percentages use decimal fractions (0.05 = 5%). Rates such as `critChance` use decimal fractions for flat bonuses too (0.02 = two percentage points).

## Validation

With the server running, Python Playwright and system Chromium installed:

```sh
python3 tests/smoke.py
python3 tests/saves.py
```

The smoke test checks new starting stats, combat management locks, material stacks and sales, full-backpack loot recovery, Arcane Bolt, manual battle downtime, enemy loot pools, 2,000 floor layouts and mobile width. Balance values remain initial tuning; a full-run balance playtest is still needed.

Balance update: lower starting HP/attributes and resource capacity; 2 resource regeneration per turn; 30% potion healing; weapon attribute scaling 0.4. Wizards gain Arcane Bolt (3-turn cooldown, level + Intellect scaling, ignores Defense), alongside Magic Shield (5-turn cooldown). Normal enemies drop materials and occasional potions; bosses and treasure can drop equipment. All drops use an explicit take/discard screen; battles wait for manual Continue. Equipment and AP/CP spending are locked during combat.


## Talents & Skills

Players have three active slots shared by starting and unlocked skills. Basic Attack and potions do not use slots. Fighters start with Block, Rogues with Dodge, and Wizards with Magic Shield and Arcane Bolt. New unlocks automatically occupy an empty slot; otherwise slot them manually. Skill slots and CP/AP spending cannot change during combat. Cooldowns reset each battle and count intervening player turns; DoTs tick at the start of enemy actions (even if stunned). Reapplying the same DoT refreshes it without stacking.

| Unlock | Resource cost | Cooldown | Effect |
| --- | --- | --- | --- |
| Shield Bash | 7 Stamina | 4 | 80% weapon damage; stun for one enemy action. No shield requirement. |
| Heavy Strike | 9 Stamina | 5 | 160% weapon damage; ignore half total Defense. |
| Poisoned Blade | 6 Stamina | 3 | 70% weapon damage; three poison ticks based on Agility. |
| Backstab | 8 Stamina | 5 | 140% weapon damage; bypass Defense only when no armor buff is active. |
| Mana Surge | Half current Mana, rounded up; minimum 1 | 6 | Heal 4 + 80% Intellect; reduce other active cooldowns by one. |
| Mana Burn | 9 Mana | 4 | Intellect-based arcane hit and three ticks of 1% enemy Max HP; ignores Defense. |

Stat nodes offer small bonuses. Combat nodes unlock two skills and enhance a signature skill. Utility nodes recover 2 resources and 5% HP after battles. Mastery adds a starting shield for Fighters, Stamina from poison ticks for Rogues, or Mana return from Arcane Bolt for Wizards.

Run `python3 tests/talents.py` alongside the smoke test to validate CP prerequisites, slot limits, combat locks, resource costs, cooldowns, stun/DoT timing, and defense bypass. These checks verify mechanics, not full-run balance.


## Biomes and enemies

Only floors 1–10 are available. Encounters never mix biome pools.

| Floors | Biome | Normal enemies | Room-10 guardian |
| --- | --- | --- | --- |
| 1–5 | Whisperwind Plains | Wolf, Boar, Slime, Wind Sprite, Giant Rat | Elite Slime/Boar/Rat/Wind Sprite on 1–4; Whisperwind Pack Alpha on 5 |
| 6–10 | Thornveil Forest | Stirge, Spider, Carnivore Plant, Vine Blight, Forest Sprite | Elite variant from the Forest pool on 6–9; Thornveil Treant Guardian on 10 |

Normal enemies each have one special ability. Elites have 1.5× HP, 1.15× Damage, +1 Defense and an extra Savage Strike. Bosses use 1.9× HP and 1.2× Damage; the Warden uses 2.2× HP and 1.25× Damage. These multipliers apply to normal floor-scaled stats with each template's offsets. Normal enemy baseline strength has not been globally increased.

The Alpha has Lunging Bite and a one-use howl that boosts Damage by 20%. The Warden has Constricting Vines and Living Bark. At 50% HP it permanently switches to phase 2: armor is removed, Damage increases 15%, and Living Bark is replaced by Wrath of the Roots. Awakening consumes one non-damaging enemy action; the transition happens only once, including when DoTs cross the threshold.

`data/biomes.json` controls floor ranges, normal pools, elite pools, and bosses. Guardian selection is seeded for each floor. `data/intents.json` contains ability descriptions and effect parameters. Both ordinary and elite loot pools live in `data/loot.json`, with elites using `elite_<enemyId>` keys. All enemy pools default to `goldDrop: false` and `goldAmount: 0`. Set both `goldDrop: true` and a positive `goldAmount` to enable a kill reward; Luck's gold modifier then applies. Treasure, floor-clear rewards, and merchant sales still provide gold. Normal enemies drop materials/potions, elites have a 50% equipment chance, and bosses/Warden guarantee equipment.

Starter weapon base Damage is 7 for the Sword and 6 for Staff/Dagger; main-attribute contribution is 0.4 per point. Full-run difficulty and merchant economy still need playtesting with these lower weapon values and no regular kill gold.

Run `python3 tests/enemies.py` for biome boundaries, enemy abilities, elite scaling, gold settings, Warden phases and the final victory flow.
