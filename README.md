# Obsidian Vault

A browser dungeon crawler: 30 floors, 10 rooms per floor. No build step or package dependencies.

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
- Each level awards **2 AP and 1 CP**. Open **Character** between actions to spend points, inspect derived stats, and learn class perks. Levelling never forces a modal. Perks currently have small placeholder effects.
- **Inventory & Equipment** manages Weapon, Off-Hand, Armor, Backpack, Accessory, and a Consumable belt. New characters start with their class weapon only.
- Backpack starts at 14 slots; each item/material takes one slot. The potion belt holds six healing potions. Gear can expand backpack capacity; removing it cannot overflow inventory.
- Gear quality tiers: **Iron → Steel → Obsidian**. Flat bonuses apply first, then summed percentage modifiers. Higher tiers appear on later floors.
- Merchants have 2–5 potions and limited equipment. Sell spare gear and materials at 35% value. Materials currently have no crafting use.
- Each floor has one entrance, one boss, one fountain and one merchant (rooms 3–9), one or two treasure rooms (rooms 2–9), one empty room, and enemies in remaining rooms. Defeat the floor-30 boss to win.

Only the personal best is saved in browser local storage; active runs are not saved.

## Files

- `index.html`: page structure.
- `css/styles.css`: visual theme and responsive panels.
- `js/game.js`: loading, character creation, exploration, combat and levelling.
- `js/systems.js`: derived stats, equipment, inventory, merchants, loot, progression panels.
- `data/`: classes, races, enemies, bosses, skills, intents, perks, items and balance constants. Tune these definitions without editing the combat loop. Item `flat` and `percent` maps can modify attributes and derived stats; percentages use decimal fractions (0.05 = 5%). Rates such as `critChance` use decimal fractions for flat bonuses too (0.02 = two percentage points).

## Validation

With the server running, Python Playwright and system Chromium installed:

```sh
python3 tests/smoke.py
```

The smoke test checks browser startup, character progression controls, floor constraints over 6,000 layouts, formulas for all classes, inventory capacity, merchant transactions, combat resource spending and pausing, victory, restart and mobile width. Balance values are initial tuning, not a guarantee that every build can clear 30 floors.
