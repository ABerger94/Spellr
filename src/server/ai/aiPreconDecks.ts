import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { DeckFormat } from '@prisma/client';
import { createDeck, importDecklist, setCommander } from '@/server/deck/deckService';

// AI seats used to literally borrow the host's own deckId, so every AI
// opponent played an exact copy of whatever the human brought. These are a
// small fixed library of real, Scryfall-backed decks owned by a dedicated
// system account instead, so AI seats get their own decklists.
const AI_PRECON_LIBRARY_EMAIL = 'ai-precon-library@spellr.internal';

interface PreconDefinition {
  name: string;
  format: DeckFormat;
  commanderName?: string;
  decklist: string;
}

const PRECON_DEFINITIONS: PreconDefinition[] = [
  {
    name: "Multani's Stompy Ramp",
    format: DeckFormat.COMMANDER,
    commanderName: "Multani, Yavimaya's Avatar",
    decklist: `
      1 Multani, Yavimaya's Avatar
      1 Llanowar Elves
      1 Elvish Mystic
      1 Birds of Paradise
      1 Sakura-Tribe Elder
      1 Wood Elves
      1 Yavimaya Elder
      1 Scavenging Ooze
      1 Beast Whisperer
      1 Acidic Slime
      1 Terastodon
      1 Craterhoof Behemoth
      1 Ghalta, Primal Hunger
      1 Thragtusk
      1 Woodfall Primus
      1 Vorinclex, Monstrous Raider
      1 Solemn Simulacrum
      1 Eternal Witness
      1 Reclamation Sage
      1 Rampant Growth
      1 Cultivate
      1 Kodama's Reach
      1 Nature's Lore
      1 Farseek
      1 Wild Growth
      1 Explosive Vegetation
      1 Beast Within
      1 Overrun
      1 Fog
      1 Nissa, Vastwood Seer
      1 Garruk Wildspeaker
      1 Vivien Reid
      1 Shalai, Voice of Plenty
      1 Hornet Queen
      1 Avenger of Zendikar
      1 Tireless Tracker
      1 Managorger Hydra
      1 Polukranos, World Eater
      1 Rishkar, Peema Renegade
      1 Wolfir Silverheart
      1 Song of the Dryads
      1 Sol Ring
      1 Arcane Signet
      1 Fellwar Stone
      37 Forest
    `,
  },
  {
    name: "Talrand's Draw-Go",
    format: DeckFormat.COMMANDER,
    commanderName: 'Talrand, Sky Summoner',
    decklist: `
      1 Talrand, Sky Summoner
      1 Ponder
      1 Preordain
      1 Brainstorm
      1 Consider
      1 Opt
      1 Fact or Fiction
      1 Mystic Confluence
      1 Cyclonic Rift
      1 Rhystic Study
      1 Mystic Remora
      1 Fblthp, the Lost
      1 Frost Titan
      1 Consecrated Sphinx
      1 Inkwell Leviathan
      1 Stormtide Leviathan
      1 Sphinx's Revelation
      1 Jace, the Mind Sculptor
      1 Jace Beleren
      1 Master of Waves
      1 Reality Shift
      1 Cryptic Command
      1 Swan Song
      1 Counterspell
      1 Mana Leak
      1 Remand
      1 Aetherize
      1 Capsize
      1 Vapor Snag
      1 Unsummon
      1 Blink of an Eye
      1 Baral, Chief of Compliance
      1 Coastal Piracy
      1 Curiosity
      1 Thassa's Oracle
      1 Deceiver Exarch
      1 Trinket Mage
      1 Trophy Mage
      1 Sol Ring
      1 Arcane Signet
      1 Fellwar Stone
      37 Island
    `,
  },
  {
    name: "Krenko's Goblin Horde",
    format: DeckFormat.COMMANDER,
    commanderName: 'Krenko, Mob Boss',
    decklist: `
      1 Krenko, Mob Boss
      1 Goblin Bombardment
      1 Goblin Chieftain
      1 Goblin Rabblemaster
      1 Siege-Gang Commander
      1 Purphoros, God of the Forge
      1 Hellrider
      1 Zada, Hedron Grinder
      1 Chandra, Torch of Defiance
      1 Chandra, Flamecaller
      1 Chandra Nalaar
      1 Fiery Confluence
      1 Wheel of Fortune
      1 Faithless Looting
      1 Lightning Bolt
      1 Lightning Strike
      1 Shock
      1 Fireball
      1 Banefire
      1 Comet Storm
      1 Zealous Conscripts
      1 Goblin Matron
      1 Goblin Warchief
      1 Kiki-Jiki, Mirror Breaker
      1 Thundermaw Hellkite
      1 Inferno Titan
      1 Combustible Gearhulk
      1 Dualcaster Mage
      1 Furnace of Rath
      1 Fervor
      1 Crackle with Power
      1 Krenko, Tin Street Kingpin
      1 Hordeling Outburst
      1 Grim Lavamancer
      1 Young Pyromancer
      1 Guttersnipe
      1 Chain Lightning
      1 Sol Ring
      1 Arcane Signet
      1 Fellwar Stone
      37 Mountain
    `,
  },
  {
    name: "Yawgmoth's Attrition",
    format: DeckFormat.COMMANDER,
    commanderName: 'Yawgmoth, Thran Physician',
    decklist: `
      1 Yawgmoth, Thran Physician
      1 Grave Titan
      1 Massacre Wurm
      1 Bloodghast
      1 Reassembling Skeleton
      1 Nether Traitor
      1 Carrion Feeder
      1 Blood Artist
      1 Zulaport Cutthroat
      1 Cruel Celebrant
      1 Diregraf Ghoul
      1 Gray Merchant of Asphodel
      1 Sign in Blood
      1 Night's Whisper
      1 Read the Bones
      1 Phyrexian Arena
      1 Toxic Deluge
      1 Damnation
      1 Languish
      1 Doom Blade
      1 Go for the Throat
      1 Fatal Push
      1 Hero's Downfall
      1 Liliana, Death's Majesty
      1 Liliana of the Veil
      1 Liliana, the Last Hope
      1 Nekrataal
      1 Plaguecrafter
      1 Yahenni, Undying Partisan
      1 Vampire Nighthawk
      1 Bloodgift Demon
      1 Sheoldred, Whispering One
      1 Massacre Girl
      1 Bitterblossom
      1 Syphon Mind
      1 Butcher of Malakir
      1 Grim Haruspex
      1 Viscera Seer
      1 Sol Ring
      1 Arcane Signet
      1 Fellwar Stone
      37 Swamp
    `,
  },
  {
    name: 'Mono-Red Aggro',
    format: DeckFormat.STANDARD_1V1,
    decklist: `
      4 Goblin Guide
      4 Monastery Swiftspear
      4 Lightning Bolt
      4 Lava Spike
      4 Chain Lightning
      4 Searing Blaze
      4 Shock
      4 Young Pyromancer
      4 Grim Lavamancer
      24 Mountain
    `,
  },
  {
    name: 'Mono-Black Control',
    format: DeckFormat.STANDARD_1V1,
    decklist: `
      4 Doom Blade
      4 Go for the Throat
      4 Fatal Push
      4 Night's Whisper
      4 Sign in Blood
      4 Diregraf Ghoul
      4 Vampire Nighthawk
      4 Gray Merchant of Asphodel
      4 Bloodghast
      24 Swamp
    `,
  },
];

async function getOrCreateLibraryUserId(): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: AI_PRECON_LIBRARY_EMAIL } });
  if (existing) return existing.id;

  // This account never logs in — the hash just needs to satisfy the
  // required column with something nobody could guess.
  const passwordHash = await bcrypt.hash(randomUUID(), 10);
  const user = await prisma.user.create({
    data: { email: AI_PRECON_LIBRARY_EMAIL, passwordHash, displayName: 'Spellr AI Precon Library' },
  });
  return user.id;
}

/** Builds any precon decks that don't exist yet under the library account —
 * a no-op after the first successful call, so it's cheap to call before
 * every AI deck pick rather than requiring a separate setup step. A deck
 * that exists but has zero cards means an earlier attempt hit a transient
 * failure (Scryfall unreachable, etc.) importing it — that's retried rather
 * than left permanently empty. */
export async function ensureAIPreconDecksSeeded(): Promise<void> {
  const userId = await getOrCreateLibraryUserId();
  const existing = await prisma.deck.findMany({
    where: { userId },
    select: { id: true, name: true, _count: { select: { cards: true } } },
  });
  const existingByName = new Map(existing.map((d) => [d.name, d]));

  for (const def of PRECON_DEFINITIONS) {
    const found = existingByName.get(def.name);
    if (found && found._count.cards > 0) continue;

    const deckId = found ? found.id : (await createDeck(userId, def.name, def.format)).id;
    await importDecklist(deckId, def.decklist);

    if (def.commanderName) {
      const commanderCard = await prisma.cardCache.findFirst({
        where: { name: { equals: def.commanderName, mode: 'insensitive' } },
      });
      if (commanderCard) await setCommander(deckId, commanderCard.scryfallId);
    }
  }
}

/** Returns `count` AI precon deck ids for the given format, shuffled so
 * which precon each AI seat gets varies from game to game (and, when there
 * are enough precons for the format, no two AI seats in the same game share
 * one). Falls back to a fresh shuffle if more seats are requested than
 * precons exist. Returns an empty array only if seeding itself failed
 * (e.g. Scryfall unreachable on a cold start) — callers should fall back to
 * the host's own deck in that case. */
export async function pickAIPreconDeckIds(format: DeckFormat, count: number): Promise<string[]> {
  await ensureAIPreconDecksSeeded();
  const userId = await getOrCreateLibraryUserId();
  // Excludes decks that exist but ended up with zero cards (a prior seeding
  // attempt that failed, e.g. Scryfall was unreachable) — better to fall
  // back to the host's own deck than hand an AI seat an empty library.
  const decks = await prisma.deck.findMany({
    where: { userId, format, cards: { some: {} } },
    select: { id: true },
  });
  if (decks.length === 0 || count <= 0) return [];

  const picks: string[] = [];
  while (picks.length < count) {
    const shuffled = [...decks].sort(() => Math.random() - 0.5);
    for (const d of shuffled) {
      if (picks.length >= count) break;
      picks.push(d.id);
    }
  }
  return picks;
}
