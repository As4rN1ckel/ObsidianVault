# Item data guide

`../items.json` lists the files loaded into the runtime `ITEMS` dictionary. Each file maps stable camelCase IDs to definitions; IDs must be unique across files. Edit the category file rather than the loader or combat loop.

| Field | Meaning |
| --- | --- |
| `slot` | weapon, armor, offhand, backpack, accessory, consumable; materials use `kind: material` |
| `type` | Inventory grouping/subtype (dagger, sword, staff, robe, shield, etc.) |
| `minFloor` | First floor eligible for merchant stock or equipment drops; no automatic stat scaling |
| `price` | Buy value; sell value uses the global sell ratio |
| `mainAttribute`, `weaponDamage` | Base weapon damage plus attribute scaling (0.4); final Damage rounds after summing |
| `flat`, `percent` | Add flat values first, then summed percentage modifiers; rate values use fractions (0.4 = 40%) |
| `flat.backpackSlots` | Extra carried capacity on top of 2 base slots |
| `flat.skillSlots` | Extra active slots on top of 3; must unslot excess abilities before removing the source |
| `flat.maxMana`, `flat.manaRegen` | Wizard-only Mana capacity and regeneration; never increases Stamina |
| `flat.armorPenetration` | Defense fraction ignored by basic attacks and physical skills; combines multiplicatively with skill penetration |
| `onHit.poison` | Basic attacks apply `baseDamage + agilityScale × Agility`, rounded, for `turns` enemy actions |

Vial poison refreshes itself and is separate from Poisoned Blade. Poison damage ignores Defense. War Blade penetration includes temporary enemy armor. No equipment is class-locked; Mana-only bonuses still only apply to Mana users.

The two Ritual Oak Staff mentions in the design are represented by one weapon: the fourth staff in the damage progression, with +1 ability slot. Starter damage is exactly half the former bases: Sword 7 → 3.5, Dagger/Staff 6 → 3.

## Equipment catalog

| ID | Item | Slot / Type | Base damage | Bonuses | First floor |
| --- | --- | --- | --- | --- | --- |
| `butchersKnife` | Butcher's Knife | weapon / dagger | 3 | — | 1 |
| `boneHandleDagger` | Bone-Handle Dagger | weapon / dagger | 5 | — | 3 |
| `coinPurseSwitchblade` | Coin Purse Switchblade | weapon / dagger | 7 | — | 6 |
| `needleblade` | Needleblade | weapon / dagger | 9 | — | 9 |
| `practiceBlade` | Practice Blade | weapon / sword | 3.5 | — | 1 |
| `woodcutlersBlade` | Woodcutler's Blade | weapon / sword | 6 | — | 3 |
| `cleaverSword` | Cleaver-Sword | weapon / sword | 8 | — | 6 |
| `ironShortsword` | Iron Shortsword | weapon / sword | 10 | — | 9 |
| `branchStaff` | Branch Staff | weapon / staff | 3 | — | 1 |
| `pilgrimsWalkingStick` | Pilgrim's Walking Stick | weapon / staff | 5 | — | 3 |
| `apprenticesFocusRod` | Apprentice's Focus Rod | weapon / staff | 7 | — | 6 |
| `ritualOakStaff` | Ritual Oak Staff | weapon / staff | 9 | +1 skillSlots | 9 |
| `alchemistsVialDagger` | Alchemist's Vial Dagger | weapon / dagger | 8 | Poison: 2 + 20% Agility, 3 enemy actions | 8 |
| `blacksmithsWarBlade` | Blacksmith's War Blade | weapon / sword | 12 | -2 speed, +0.4 armorPenetration | 10 |
| `leatherJerkin` | Leather Jerkin | armor / heavy | — | +2 defense | 2 |
| `paddedGambeson` | Padded Gambeson | armor / heavy | — | +3 defense, +1 vitality | 5 |
| `chainmailHauberk` | Chainmail Hauberk | armor / heavy | — | +5 defense, -1 speed | 9 |
| `apprenticeLinenRobe` | Apprentice Linen Robe | armor / robe | — | +1 defense, +1 intellect | 2 |
| `scholarsTravelCloak` | Scholar's Travel Cloak | armor / robe | — | +2 defense, +4 maxMana | 5 |
| `reinforcedCottonRobe` | Reinforced Cotton Robe | armor / robe | — | +3 defense, +2 intellect | 9 |
| `travelersVest` | Traveler's Vest | armor / light | — | +1 defense, +1 agility | 2 |
| `thiefsCoat` | Thief's Coat | armor / light | — | +2 defense, +2 agility | 5 |
| `paddedTunic` | Padded Tunic | armor / light | — | +3 defense, +1 vitality | 9 |
| `woodenBuckler` | Wooden Buckler | offhand / shield | — | +1 defense, +0.02 blockChance | 1 |
| `utilityBracer` | Utility Bracer | offhand / bracer | — | +1 defense, +1 agility | 4 |
| `woodenFocusRod` | Wooden Focus Rod | offhand / focus | — | +1 intellect, +2 maxMana | 1 |
| `spellWeaveGauntlet` | Spell-Weave Gauntlet | offhand / focus | — | +2 intellect, +4 maxMana | 6 |
| `roundWoodenShield` | Round Wooden Shield | offhand / shield | — | +2 defense, +0.03 blockChance | 5 |
| `ironBuckler` | Iron Buckler | offhand / shield | — | +3 defense, +0.05 blockChance | 9 |
| `pouchBelt` | Pouch Belt | backpack / backpack | — | +6 backpackSlots | 1 |
| `canvasSatchel` | Canvas Satchel | backpack / backpack | — | +8 backpackSlots | 3 |
| `merchantsSack` | Merchant's Sack | backpack / backpack | — | +10 backpackSlots | 6 |
| `scoutPack` | Scout Pack | backpack / backpack | — | +12 backpackSlots | 10 |
| `travelersPack` | Traveler's Pack | backpack / backpack | — | +16 backpackSlots | 15 |
| `luckyCharm` | Lucky Charm | accessory / charm | — | +2 luck | 2 |
| `manaWellPendant` | Pendant of the Mana Well | accessory / pendant | — | +6 maxMana, +1 manaRegen | 5 |
| `ironGripRing` | Iron Grip Ring | accessory / ring | — | +1 might, +1 vitality | 3 |

All backpack bonuses are additive: Pouch Belt +6 = 8 total; Canvas Satchel +8 = 10; Merchant's Sack +10 = 12; Scout Pack +12 = 14; Traveler's Pack +16 = 18. Equipped gear occupies its own slots; carried gear takes one slot. Materials stack to 10; potions in the six-slot belt do not consume carried capacity.

Removing or swapping a backpack is rejected if the resulting inventory, including the removed pack, would overflow. Future-floor items stay out of current drops; `minFloor` does not expand the playable dungeon.
