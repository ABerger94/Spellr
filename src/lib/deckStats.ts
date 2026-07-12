export type ManaColorCode = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

export const MANA_COLOR_ORDER: ManaColorCode[] = ['W', 'U', 'B', 'R', 'G', 'C'];

export interface DeckStatCard {
  quantity: number;
  isCommander: boolean;
  cardCache: {
    typeLine: string | null;
    manaCost: string | null;
    oracleText: string | null;
    colorIdentity: string[];
  };
}

interface ManaCostInfo {
  cmc: number;
  pips: Partial<Record<ManaColorCode, number>>;
}

/** Parses a Scryfall mana cost string ("{2}{W}{W}", "{X}{R}", "{W/U}", ...)
 * into a converted mana cost and a per-color pip count. Follows the official
 * mana value rules closely enough for a deckbuilding curve/color estimate:
 * X/Y/Z count as 0, hybrid symbols count their full numeric or 1-color
 * value, and every color letter present in a symbol counts as a pip for
 * that color (so a hybrid card contributes to both colors' totals). */
function parseManaCost(cost: string | null): ManaCostInfo {
  const pips: Partial<Record<ManaColorCode, number>> = {};
  if (!cost) return { cmc: 0, pips };

  let cmc = 0;
  const symbols = cost.match(/\{([^}]+)\}/g) ?? [];
  for (const raw of symbols) {
    const token = raw.slice(1, -1).toUpperCase();

    if (/^\d+$/.test(token)) {
      cmc += Number(token);
      continue;
    }
    if (token === 'X' || token === 'Y' || token === 'Z') {
      continue; // 0 off the stack, per the mana value rules
    }

    const parts = token.split('/'); // hybrid ("W/U"), Phyrexian ("W/P"), or generic-hybrid ("2/W")
    const numericPart = parts.find((p) => /^\d+$/.test(p));
    cmc += numericPart ? Number(numericPart) : 1;

    for (const part of parts) {
      const color = part as ManaColorCode;
      if (MANA_COLOR_ORDER.includes(color)) {
        pips[color] = (pips[color] ?? 0) + 1;
      }
    }
  }

  return { cmc, pips };
}

const CARD_TYPES = ['Land', 'Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment'];

function typesOnLine(typeLine: string | null): string[] {
  if (!typeLine) return [];
  // Only the part before "—" carries card types; everything after is subtypes.
  const frontHalf = typeLine.split('—')[0];
  return CARD_TYPES.filter((t) => frontHalf.includes(t));
}

function isLand(typeLine: string | null): boolean {
  return typesOnLine(typeLine).includes('Land');
}

/** Cards phrase a scoped-down "any color" in several ways: Command Tower /
 * Arcane Signet key off the commander's color identity; Fellwar Stone /
 * Reflecting Pool / Exotic Orchard key off what lands you (or opponents)
 * control. None of these can actually produce every color in a deck that
 * isn't already that color, so all of them get capped to the deck's own
 * color identity rather than the full WUBRG. */
const RESTRICTED_ANY_COLOR = /commander|land you control|lands you control|land your opponents control|lands your opponents control|opponent/i;

/** Which colors a card can add to a pool, read off its own oracle text —
 * covers lands, mana rocks, and dorks alike since they all phrase it as
 * "Add {W}" (or "Add one mana of any color"). A heuristic, not a rules
 * engine: conditional/situational mana abilities are counted the same as
 * unconditional ones.
 *
 * "Any color" is only unconditionally 5-color (Chromatic Lantern, Gilded
 * Lotus, ...) when nothing scopes it down — see RESTRICTED_ANY_COLOR for
 * the common qualifiers that cap it to `deckColorIdentity` instead, or a
 * mono-U/R deck would wrongly show green/black/white sources just from
 * running Command Tower or Fellwar Stone. */
function producedColors(oracleText: string | null, deckColorIdentity: Set<ManaColorCode>): Set<ManaColorCode> {
  const colors = new Set<ManaColorCode>();
  if (!oracleText) return colors;

  // Sentence-by-sentence so a qualifier only scopes down the "any color"
  // clause it actually appears next to.
  const sentences = oracleText.split(/(?<=\.)\s+/);
  for (const sentence of sentences) {
    if (/mana of any color|any color of mana/i.test(sentence)) {
      if (RESTRICTED_ANY_COLOR.test(sentence)) {
        deckColorIdentity.forEach((c) => colors.add(c));
      } else {
        (['W', 'U', 'B', 'R', 'G'] as ManaColorCode[]).forEach((c) => colors.add(c));
      }
    }

    const addClauses = sentence.match(/add[^.]*\.?/gi) ?? [];
    for (const clause of addClauses) {
      const symbols = clause.match(/\{([WUBRGC])\}/gi) ?? [];
      for (const s of symbols) {
        colors.add(s.slice(1, -1).toUpperCase() as ManaColorCode);
      }
    }
  }
  return colors;
}

function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < kk; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

/** Hypergeometric P(drawing at least `atLeast` successes among `drawn` cards
 * from a `deckSize`-card deck containing `successes` total success-cards) —
 * the same math behind any "how many lands should I run" calculator. */
export function hypergeometricAtLeast(deckSize: number, successes: number, drawn: number, atLeast: number): number {
  if (atLeast <= 0) return 1;
  if (successes <= 0) return 0;
  const total = combinations(deckSize, drawn);
  if (total === 0) return 0;
  let pLessThan = 0;
  const maxK = Math.min(atLeast - 1, drawn, successes);
  for (let k = 0; k <= maxK; k++) {
    pLessThan += (combinations(successes, k) * combinations(deckSize - successes, drawn - k)) / total;
  }
  return Math.max(0, Math.min(1, 1 - pLessThan));
}

export interface CurveBucket {
  label: string;
  count: number;
}

export interface ColorSourceStat {
  color: ManaColorCode;
  pips: number;
  sources: number;
  openingHandProbability: number;
  bySecondDrawStepProbability: number;
}

export interface DeckStats {
  totalCards: number;
  landCount: number;
  nonlandCount: number;
  averageCmc: number;
  manaCurve: CurveBucket[];
  typeBreakdown: { type: string; count: number }[];
  colorStats: ColorSourceStat[];
  landProbabilities: { atLeast: number; probability: number }[];
}

const CURVE_BUCKETS = ['0', '1', '2', '3', '4', '5', '6+'];
const OPENING_HAND = 7;
const BY_SECOND_DRAW_STEP = 10; // opening hand + 3 draws, a common "early game" checkpoint

/** The colors "any color in your commander's color identity" (Command
 * Tower, Arcane Signet, ...) actually resolves to: the commander's own
 * color identity when one is set, or the union of every card's color
 * identity in the deck as a fallback (1v1 decks have no commander, and an
 * in-progress Commander deck might not have one chosen yet either). */
function resolveDeckColorIdentity(cards: DeckStatCard[]): Set<ManaColorCode> {
  const commanderCards = cards.filter((c) => c.isCommander);
  const source = commanderCards.length > 0 ? commanderCards : cards;
  const identity = new Set<ManaColorCode>();
  for (const { cardCache } of source) {
    for (const color of cardCache.colorIdentity) {
      if (MANA_COLOR_ORDER.includes(color as ManaColorCode)) identity.add(color as ManaColorCode);
    }
  }
  return identity;
}

export function computeDeckStats(cards: DeckStatCard[]): DeckStats {
  const deckColorIdentity = resolveDeckColorIdentity(cards);

  let totalCards = 0;
  let landCount = 0;
  let nonlandCmcSum = 0;
  let nonlandCount = 0;
  const curveCounts = new Map<string, number>(CURVE_BUCKETS.map((b) => [b, 0]));
  const typeCounts = new Map<string, number>();
  const pipTotals: Partial<Record<ManaColorCode, number>> = {};
  const sourceTotals: Partial<Record<ManaColorCode, number>> = {};

  for (const { quantity, cardCache } of cards) {
    totalCards += quantity;
    const land = isLand(cardCache.typeLine);
    if (land) landCount += quantity;

    for (const type of typesOnLine(cardCache.typeLine)) {
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + quantity);
    }

    const { cmc, pips } = parseManaCost(cardCache.manaCost);
    if (!land) {
      nonlandCount += quantity;
      nonlandCmcSum += cmc * quantity;
      const bucket = cmc >= 6 ? '6+' : String(Math.max(0, Math.floor(cmc)));
      curveCounts.set(bucket, (curveCounts.get(bucket) ?? 0) + quantity);
      for (const [color, count] of Object.entries(pips) as [ManaColorCode, number][]) {
        pipTotals[color] = (pipTotals[color] ?? 0) + count * quantity;
      }
    }

    for (const color of producedColors(cardCache.oracleText, deckColorIdentity)) {
      sourceTotals[color] = (sourceTotals[color] ?? 0) + quantity;
    }
  }

  const colorStats: ColorSourceStat[] = MANA_COLOR_ORDER.filter((c) => c !== 'C')
    .filter((c) => (pipTotals[c] ?? 0) > 0 || (sourceTotals[c] ?? 0) > 0)
    .map((color) => {
      const sources = sourceTotals[color] ?? 0;
      return {
        color,
        pips: pipTotals[color] ?? 0,
        sources,
        openingHandProbability: hypergeometricAtLeast(totalCards, sources, OPENING_HAND, 1),
        bySecondDrawStepProbability: hypergeometricAtLeast(totalCards, sources, Math.min(BY_SECOND_DRAW_STEP, totalCards), 1),
      };
    });

  const landProbabilities = [2, 3, 4].map((atLeast) => ({
    atLeast,
    probability: hypergeometricAtLeast(totalCards, landCount, OPENING_HAND, atLeast),
  }));

  return {
    totalCards,
    landCount,
    nonlandCount,
    averageCmc: nonlandCount > 0 ? nonlandCmcSum / nonlandCount : 0,
    manaCurve: CURVE_BUCKETS.map((label) => ({ label, count: curveCounts.get(label) ?? 0 })),
    typeBreakdown: [...typeCounts.entries()]
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count })),
    colorStats,
    landProbabilities,
  };
}
