/** Provider-agnostic description of the AI's action set — Gemini and Groq
 * each want this in a slightly different wire format, but there should only
 * ever be one place that decides what the eight actions and their
 * parameters are. */

export const AI_SYSTEM_INSTRUCTION =
  'You are playing Magic: The Gathering on a virtual tabletop. The platform does not enforce rules, ' +
  'the stack, mana costs, or combat math — you are responsible for playing reasonably and honestly within ' +
  "the spirit of the game. You can only see your own hand and library size; other players' hands are hidden " +
  'except for their card counts. Drawing for turn is not automatic — call draw_card once near the start of ' +
  'your turn (after any upkeep-trigger decisions, before playing a land or casting spells), the same way a ' +
  'human player would. Any land you play that unconditionally enters tapped is tapped for you automatically — ' +
  'you never need to call anything for that. Cards you control are shown with their rules text in curly braces, ' +
  'e.g. Name [Type] {rules text}; read it and act on it yourself: if a card you cast or a land you play would make you or another player gain ' +
  'or lose life (shock lands, painlands, burn spells, lifegain effects, etc.), call adjust_life for the right ' +
  'seat and amount as part of resolving it — do not just leave life totals unchanged. Likewise use adjust_life ' +
  'for combat damage on an attack you are confident is unblocked.\n\n' +
  'Opening hand: you were already dealt a fresh 7-card hand. On your very first turn only, before doing ' +
  'anything else, decide whether to keep it. Mulligan (call the mulligan function) if it has 0-1 lands, ' +
  '6-7 lands, or is otherwise unplayable — it shuffles your hand back and deals you a fresh 7. Your first ' +
  'mulligan each game is free (nothing owed); avoid going past 2-3 total except for a truly unplayable hand. ' +
  'Once you decide to keep, put exactly as many cards — your worst ones — on the bottom of your library as ' +
  'your prompt\'s "Cards owed on the bottom of your library if you keep now" says (0 after a single free ' +
  "mulligan, 1 after a second, 2 after a third, and so on), using move_card_zone with fromZone 'hand', " +
  "toZone 'library', and position 'bottom', before doing anything else that turn. On every turn after your " +
  'first, ignore the mulligan function entirely — it will fail since the mulligan window has passed. The ' +
  "mulligan function's result includes your actual new hand (newHand) — read it before deciding what to " +
  'bottom or play; do not ask for your hand or wait for it separately, it is given to you immediately.\n\n' +
  'Play like a competent, attentive human, not a bot that shrugs and passes: before deciding on an action, ' +
  "actually read the whole board — every player's battlefield, life totals, and (for your own permanents) " +
  "their rules text — and your own hand, then decide what a good player would do. The prompt clearly marks " +
  'which seat is yours ("THIS IS YOU") versus which are opponents ("an OPPONENT") — every permanent, creature, ' +
  "and instanceId listed under an opponent's seat belongs to them, not you, and can never be the target of " +
  "attack_with, move_card_zone, or any other action that acts on your own cards; only use instanceIds from " +
  'your own seat\'s battlefield for those. Prioritize, in rough order: ' +
  '(1) if your prompt says you have NOT played a land this turn and you have any land in hand, play one — a ' +
  "missed land drop is one of the biggest mistakes you can make and should be treated as mandatory whenever " +
  'you have a land available; (2) cast the best spells you can reasonably afford with the untapped mana your ' +
  'lands provide, prioritizing plays that develop your board, answer an opponent\'s threat, or advance your ' +
  "game plan; (3) attack with creatures when it's favorable — compare each attacker's power against the " +
  "defending player's likely blockers (their untapped creatures) and life total, and prefer attacking a " +
  "player's face over a planeswalker unless the planeswalker is the more urgent threat to remove. Do not pass " +
  'the turn while you still have a land you could play, an affordable and useful spell you could cast, or a ' +
  'clearly favorable attack available — only pass once you have genuinely run out of good options, or after ' +
  'a small number of reasonable actions. It is fine to hold back a card or decline a bad attack when that is ' +
  'correct play, but that should be a deliberate judgment call, not the default.\n\n' +
  'Take a small number of sensible actions for your turn (play a land, cast spells you can reasonably ' +
  'afford, attack if favorable) using the provided functions, briefly explaining your reasoning in the text ' +
  'alongside each function call, then call pass_turn to end your turn.';

const zoneEnum = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'commandZone'];

export type PlainParamSchema =
  | { type: 'object'; properties: Record<string, PlainParamSchema>; required?: string[] }
  | { type: 'string'; description?: string; enum?: string[] }
  | { type: 'integer'; description?: string };

export interface AIActionSpec {
  name: string;
  description: string;
  parameters: PlainParamSchema & { type: 'object' };
}

export const AI_ACTIONS: AIActionSpec[] = [
  {
    name: 'play_card',
    description: 'Play a permanent (land, creature, artifact, enchantment, planeswalker) from your hand or command zone onto the battlefield.',
    parameters: {
      type: 'object',
      properties: { scryfallId: { type: 'string', description: 'The scryfallId of the card to play.' } },
      required: ['scryfallId'],
    },
  },
  {
    name: 'cast_spell',
    description:
      'Cast an instant or sorcery from your hand. Since there is no stack or mana system yet, this simply resolves the spell and puts it in your graveyard.',
    parameters: {
      type: 'object',
      properties: { scryfallId: { type: 'string', description: 'The scryfallId of the instant/sorcery to cast.' } },
      required: ['scryfallId'],
    },
  },
  {
    name: 'attack_with',
    description:
      'Declare an attack with an untapped creature YOU CONTROL, at a specific target. instanceId must be taken ' +
      "from your own seat's battlefield in the prompt (marked \"THIS IS YOU\") — never from an opponent's " +
      "battlefield; you cannot attack with a creature you don't control. There is no automatic combat damage " +
      "or blocking — this taps the creature (unless it has vigilance) and records the attack and its target " +
      "so everyone at the table can see it. If you're confident the attack goes through unblocked, also call " +
      "adjust_life on the defending player for the creature's power.",
    parameters: {
      type: 'object',
      properties: {
        instanceId: { type: 'string', description: "The battlefield instanceId of the attacking creature — must be one of YOUR OWN creatures, never an opponent's." },
        targetType: {
          type: 'string',
          enum: ['player', 'planeswalker'],
          description: "'player' to attack an opponent's face, or 'planeswalker' to attack one of their planeswalkers/battles.",
        },
        targetSeat: { type: 'integer', description: "The seat number of the defending player (whose face, or whose planeswalker, you're attacking)." },
        targetInstanceId: {
          type: 'string',
          description: "Required when targetType is 'planeswalker': the battlefield instanceId of that planeswalker/battle. Omit when targetType is 'player'.",
        },
      },
      required: ['instanceId', 'targetType', 'targetSeat'],
    },
  },
  {
    name: 'move_card_zone',
    description:
      'Move one of your own cards between zones (e.g. discard from hand, sacrifice a permanent to the graveyard, return a permanent to hand). Use instanceId for a card on the battlefield, or scryfallId for a card in any other zone.',
    parameters: {
      type: 'object',
      properties: {
        fromZone: { type: 'string', enum: zoneEnum },
        toZone: { type: 'string', enum: zoneEnum },
        instanceId: { type: 'string', description: 'Required if fromZone is battlefield.' },
        scryfallId: { type: 'string', description: 'Required if fromZone is not battlefield.' },
        position: {
          type: 'string',
          enum: ['top', 'bottom'],
          description: "Only meaningful when toZone is 'library'; defaults to 'top'. Use 'bottom' when putting cards away after keeping a mulliganed hand.",
        },
      },
      required: ['fromZone', 'toZone'],
    },
  },
  {
    name: 'mulligan',
    description:
      'Shuffle your current hand back into your library and draw a fresh 7. Only usable on your very first ' +
      'turn, before taking any other action — it will fail on any later turn.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'adjust_life',
    description:
      "Change a player's life total. Call this yourself whenever a card's rules text says so — shock/painlands " +
      "(you lose life), burn spells and combat damage (target loses life), lifegain effects (you gain life) — " +
      'the platform never applies these automatically.',
    parameters: {
      type: 'object',
      properties: {
        seat: { type: 'integer', description: 'The seat number of the player whose life changes.' },
        delta: { type: 'integer', description: 'The amount to change life by (negative to lose life).' },
      },
      required: ['seat', 'delta'],
    },
  },
  {
    name: 'draw_card',
    description:
      'Draw the top card of your library into your hand. Drawing for turn is never automatic on this platform — ' +
      'call this yourself once near the start of your turn, the same way a human player would, and again for ' +
      'any extra draw a card explicitly grants you.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'pass_turn',
    description: 'End your turn. Call this once you are done taking actions.',
    parameters: { type: 'object', properties: {} },
  },
];
