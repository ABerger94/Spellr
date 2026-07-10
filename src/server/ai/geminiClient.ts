import { GoogleGenerativeAI, SchemaType, type FunctionDeclaration } from '@google/generative-ai';
import { env } from '@/lib/env';

const zoneEnum = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'commandZone'];

export const AI_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'play_card',
    description: 'Play a permanent (land, creature, artifact, enchantment, planeswalker) from your hand or command zone onto the battlefield.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { scryfallId: { type: SchemaType.STRING, description: 'The scryfallId of the card to play.' } },
      required: ['scryfallId'],
    },
  },
  {
    name: 'cast_spell',
    description:
      'Cast an instant or sorcery from your hand. Since there is no stack or mana system yet, this simply resolves the spell and puts it in your graveyard.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { scryfallId: { type: SchemaType.STRING, description: 'The scryfallId of the instant/sorcery to cast.' } },
      required: ['scryfallId'],
    },
  },
  {
    name: 'attack_with',
    description: 'Declare an attack with an untapped creature you control. There is no automatic combat damage — this taps the creature and announces the attack in the game log.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { instanceId: { type: SchemaType.STRING, description: 'The battlefield instanceId of the attacking creature.' } },
      required: ['instanceId'],
    },
  },
  {
    name: 'move_card_zone',
    description:
      'Move one of your own cards between zones (e.g. discard from hand, sacrifice a permanent to the graveyard, return a permanent to hand). Use instanceId for a card on the battlefield, or scryfallId for a card in any other zone.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        fromZone: { type: SchemaType.STRING, format: 'enum', enum: zoneEnum },
        toZone: { type: SchemaType.STRING, format: 'enum', enum: zoneEnum },
        instanceId: { type: SchemaType.STRING, description: 'Required if fromZone is battlefield.' },
        scryfallId: { type: SchemaType.STRING, description: 'Required if fromZone is not battlefield.' },
      },
      required: ['fromZone', 'toZone'],
    },
  },
  {
    name: 'adjust_life',
    description: 'Change a player\'s life total (e.g. to resolve a burn spell or lifegain effect).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        seat: { type: SchemaType.INTEGER, description: 'The seat number of the player whose life changes.' },
        delta: { type: SchemaType.INTEGER, description: 'The amount to change life by (negative to lose life).' },
      },
      required: ['seat', 'delta'],
    },
  },
  {
    name: 'draw_card',
    description: 'Draw the top card of your library into your hand.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'pass_turn',
    description: 'End your turn. Call this once you are done taking actions.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
];

export function getModel() {
  if (!env.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  const client = new GoogleGenerativeAI(env.geminiApiKey);
  return client.getGenerativeModel({
    model: env.geminiModel,
    systemInstruction:
      'You are playing Magic: The Gathering on a virtual tabletop. The platform does not enforce rules, ' +
      'the stack, mana costs, or combat math — you are responsible for playing reasonably and honestly within ' +
      "the spirit of the game. You can only see your own hand and library size; other players' hands are hidden " +
      'except for their card counts. Take a small number of sensible actions for your turn (play a land, cast ' +
      'spells you can reasonably afford, attack if favorable) using the provided functions, briefly explaining ' +
      'your reasoning in the text alongside each function call, then call pass_turn to end your turn.',
    tools: [{ functionDeclarations: AI_FUNCTION_DECLARATIONS }],
  });
}
