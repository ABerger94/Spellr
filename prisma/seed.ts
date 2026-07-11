import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CARDS = [
  {
    scryfallId: 'test-sol-ring',
    oracleId: 'oracle-sol-ring',
    name: 'Sol Ring',
    manaCost: '{1}',
    typeLine: 'Artifact',
    oracleText: '{T}: Add {C}{C}.',
    colors: [],
    colorIdentity: [],
    imageNormal: 'https://cards.scryfall.io/normal/front/f/f/ff58fb42-3184-4159-b02b-d0c2fa50c1e3.jpg',
    imageArtCrop: 'https://cards.scryfall.io/art_crop/front/f/f/ff58fb42-3184-4159-b02b-d0c2fa50c1e3.jpg',
    setCode: 'c21',
    raw: {},
  },
  {
    scryfallId: 'test-command-tower',
    oracleId: 'oracle-command-tower',
    name: 'Command Tower',
    typeLine: 'Land',
    oracleText: '{T}: Add one mana of any color in your commander\'s color identity.',
    colors: [],
    colorIdentity: [],
    imageNormal: 'https://cards.scryfall.io/normal/front/9/6/9628d70a-208e-4386-a5b9-e2b332b76d31.jpg',
    imageArtCrop: 'https://cards.scryfall.io/art_crop/front/9/6/9628d70a-208e-4386-a5b9-e2b332b76d31.jpg',
    setCode: 'c21',
    raw: {},
  },
  {
    scryfallId: 'test-arcane-signet',
    oracleId: 'oracle-arcane-signet',
    name: 'Arcane Signet',
    manaCost: '{1}',
    typeLine: 'Artifact',
    oracleText: '{T}: Add one mana of any color in your commander\'s color identity.',
    colors: [],
    colorIdentity: [],
    imageNormal: 'https://cards.scryfall.io/normal/front/8/7/87b83d54-b3d9-4d3e-8b53-3a3fbaecf14a.jpg',
    imageArtCrop: 'https://cards.scryfall.io/art_crop/front/8/7/87b83d54-b3d9-4d3e-8b53-3a3fbaecf14a.jpg',
    setCode: 'eld',
    raw: {},
  },
  {
    scryfallId: 'test-atraxa',
    oracleId: 'oracle-atraxa',
    name: "Atraxa, Praetors' Voice",
    manaCost: '{G}{W}{U}{B}',
    typeLine: 'Legendary Creature — Phyrexian Angel',
    oracleText: 'Flying, vigilance, deathtouch, lifelink. At the beginning of your end step, proliferate.',
    power: '4',
    toughness: '4',
    colors: ['G', 'W', 'U', 'B'],
    colorIdentity: ['G', 'W', 'U', 'B'],
    imageNormal: 'https://cards.scryfall.io/normal/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg',
    imageArtCrop: 'https://cards.scryfall.io/art_crop/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg',
    setCode: 'c16',
    raw: {},
  },
  {
    scryfallId: 'test-llanowar-elves',
    oracleId: 'oracle-llanowar-elves',
    name: 'Llanowar Elves',
    manaCost: '{G}',
    typeLine: 'Creature — Elf Druid',
    oracleText: '{T}: Add {G}.',
    power: '1',
    toughness: '1',
    colors: ['G'],
    colorIdentity: ['G'],
    imageNormal: 'https://cards.scryfall.io/normal/front/8/f/8f7980d4-da43-4d6d-93ff-fca46479806a.jpg',
    imageArtCrop: 'https://cards.scryfall.io/art_crop/front/8/f/8f7980d4-da43-4d6d-93ff-fca46479806a.jpg',
    setCode: 'dom',
    raw: {},
  },
  {
    // Unconditionally-tapped land fixture, for testing/demoing the
    // "enters the battlefield tapped" auto-tap behavior.
    scryfallId: 'test-guildgate',
    oracleId: 'oracle-guildgate',
    name: 'Selesnya Guildgate',
    typeLine: 'Land — Gate',
    oracleText: 'Selesnya Guildgate enters the battlefield tapped.\n{T}: Add {G} or {W}.',
    colors: [],
    colorIdentity: ['G', 'W'],
    setCode: 'rna',
    raw: {},
  },
  {
    // Conditionally-tapped land fixture (a shock land — the tapped-vs-life
    // choice is the player's, so this must NOT be auto-tapped), paired with
    // test-guildgate above to cover both sides of that behavior.
    scryfallId: 'test-steam-vents',
    oracleId: 'oracle-steam-vents',
    name: 'Steam Vents',
    typeLine: 'Land — Island Mountain',
    oracleText:
      "({T}: Add {U} or {R}.)\nAs Steam Vents enters the battlefield, you may pay 2 life. If you don't, Steam Vents enters the battlefield tapped.",
    colors: [],
    colorIdentity: ['U', 'R'],
    setCode: 'rtr',
    raw: {},
  },
];

async function main() {
  for (const card of CARDS) {
    await prisma.cardCache.upsert({
      where: { scryfallId: card.scryfallId },
      create: card,
      update: card,
    });
  }
  console.log(`Seeded ${CARDS.length} test cards into CardCache.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
