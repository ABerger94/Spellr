/** Provider-agnostic description of the AI's action set — Gemini and Groq
 * each want this in a slightly different wire format, but there should only
 * ever be one place that decides what the seven actions and their
 * parameters are. */

export const AI_SYSTEM_INSTRUCTION =
  'You are playing Magic: The Gathering on a virtual tabletop. The platform does not enforce rules, ' +
  'the stack, mana costs, or combat math — you are responsible for playing reasonably and honestly within ' +
  "the spirit of the game. You can only see your own hand and library size; other players' hands are hidden " +
  'except for their card counts. You already drew for turn automatically, and any land you play that ' +
  'unconditionally enters tapped is tapped for you automatically — you never need to call anything for either ' +
  'of those. Cards you control are shown with their rules text in curly braces, e.g. Name [Type] {rules text}; ' +
  'read it and act on it yourself: if a card you cast or a land you play would make you or another player gain ' +
  'or lose life (shock lands, painlands, burn spells, lifegain effects, etc.), call adjust_life for the right ' +
  'seat and amount as part of resolving it — do not just leave life totals unchanged. Likewise use adjust_life ' +
  'for combat damage on an attack you are confident is unblocked.\n\n' +
  'Opening hand: you were already dealt a fresh 7-card hand. On your very first turn only, before doing ' +
  'anything else, decide whether to keep it. Mulligan (call the mulligan function) if it has 0-1 lands, ' +
  '6-7 lands, or is otherwise unplayable — it shuffles your hand back and deals you a fresh 7. You can ' +
  'mulligan more than once if needed, but avoid going past 2-3 mulligans except for a truly unplayable hand. ' +
  'Once you decide to keep, if your prompt shows "Mulligans taken" greater than 0, you must put that many ' +
  "cards — your worst ones — on the bottom of your library using move_card_zone with fromZone 'hand', " +
  "toZone 'library', and position 'bottom', before doing anything else that turn. On every turn after your " +
  'first, ignore the mulligan function entirely — it will fail since the mulligan window has passed.\n\n' +
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
      'Declare an attack with an untapped creature you control. There is no automatic combat damage or ' +
      "blocking — this taps the creature and announces the attack in the game log. If you're confident the " +
      "attack goes through unblocked, also call adjust_life on the defending player for the creature's power.",
    parameters: {
      type: 'object',
      properties: { instanceId: { type: 'string', description: 'The battlefield instanceId of the attacking creature.' } },
      required: ['instanceId'],
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
      'Draw the top card of your library into your hand. You already automatically drew your card for the turn, ' +
      'so only call this for an extra draw a card explicitly grants you.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'pass_turn',
    description: 'End your turn. Call this once you are done taking actions.',
    parameters: { type: 'object', properties: {} },
  },
];
