import { z } from 'zod';

const zoneName = z.enum(['library', 'hand', 'battlefield', 'graveyard', 'exile', 'commandZone']);
const libraryPosition = z.enum(['top', 'bottom']);
const lookDestination = z.enum(['top', 'bottom', 'graveyard']);

const percent = z.number().min(0).max(100);
const manaColor = z.enum(['W', 'U', 'B', 'R', 'G', 'C']);

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DRAW_CARD'), count: z.number().int().min(1).max(40).optional() }),
  z.object({ type: z.literal('MULLIGAN') }),
  z.object({
    type: z.literal('PLAY_CARD'),
    scryfallId: z.string(),
    fromZone: z.enum(['hand', 'commandZone']),
    x: percent.optional(),
    y: percent.optional(),
    // Modal double-faced cards (e.g. Sink into Stupor // Sophoric Springs)
    // are chosen before/while casting, not after — this plays the card
    // already showing its back face rather than requiring a separate flip
    // once it's on the battlefield.
    transformed: z.boolean().optional(),
  }),
  z.object({ type: z.literal('TAP_CARD'), instanceId: z.string() }),
  z.object({ type: z.literal('UNTAP_CARD'), instanceId: z.string() }),
  z.object({
    type: z.literal('MOVE_CARD'),
    fromZone: zoneName,
    toZone: zoneName,
    instanceId: z.string().optional(),
    scryfallId: z.string().optional(),
    position: libraryPosition.optional(),
    x: percent.optional(),
    y: percent.optional(),
  }),
  z.object({ type: z.literal('ADJUST_LIFE'), seat: z.number().int(), delta: z.number().int() }),
  z.object({
    type: z.literal('ADJUST_COMMANDER_DAMAGE'),
    seat: z.number().int(),
    fromSeat: z.number().int(),
    delta: z.number().int(),
  }),
  z.object({
    type: z.literal('ADJUST_PLAYER_COUNTER'),
    seat: z.number().int(),
    counterType: z.string().min(1).max(20),
    delta: z.number().int().min(-99).max(99),
  }),
  z.object({ type: z.literal('PASS_TURN') }),
  z.object({ type: z.literal('SCRY'), count: z.number().int().min(1).max(20) }),
  z.object({ type: z.literal('SURVEIL'), count: z.number().int().min(1).max(20) }),
  z.object({ type: z.literal('RESOLVE_LOOK'), scryfallId: z.string(), destination: lookDestination }),
  z.object({ type: z.literal('SHUFFLE_LIBRARY') }),
  z.object({ type: z.literal('SEARCH_LIBRARY') }),
  z.object({ type: z.literal('UNTAP_ALL') }),
  z.object({ type: z.literal('RESET_LIFE') }),
  z.object({ type: z.literal('RESET_BOARD') }),
  z.object({ type: z.literal('RESTART_GAME') }),
  z.object({ type: z.literal('MILL'), count: z.number().int().min(1).max(40) }),
  z.object({ type: z.literal('RANDOM_DISCARD') }),
  z.object({ type: z.literal('REVEAL_HAND') }),
  z.object({ type: z.literal('ROLL_DICE'), sides: z.number().int().refine((n) => [4, 6, 8, 10, 12, 20, 100].includes(n), 'Unsupported die size') }),
  z.object({ type: z.literal('FLIP_COIN') }),
  z.object({
    type: z.literal('ADJUST_COUNTER'),
    instanceId: z.string(),
    counterType: z.string().min(1).max(20),
    delta: z.number().int().min(-99).max(99),
  }),
  z.object({ type: z.literal('FLIP_CARD'), instanceId: z.string() }),
  z.object({ type: z.literal('ATTACH_CARD'), instanceId: z.string(), targetInstanceId: z.string().nullable() }),
  z.object({ type: z.literal('ADJUST_MANA'), color: manaColor, delta: z.number().int().min(-99).max(99) }),
  z.object({ type: z.literal('EMPTY_MANA_POOL') }),
  z.object({ type: z.literal('CREATE_TOKEN'), scryfallId: z.string(), x: percent.optional(), y: percent.optional() }),
  z.object({ type: z.literal('REMOVE_TOKEN'), instanceId: z.string() }),
  z.object({ type: z.literal('END_GAME') }),
  z.object({ type: z.literal('CHAT_MESSAGE'), text: z.string().trim().min(1).max(500) }),
]);

export type Action = z.infer<typeof actionSchema>;
