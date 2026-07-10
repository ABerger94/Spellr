import { z } from 'zod';

const zoneName = z.enum(['library', 'hand', 'battlefield', 'graveyard', 'exile', 'commandZone']);
const libraryPosition = z.enum(['top', 'bottom']);
const lookDestination = z.enum(['top', 'bottom', 'graveyard']);

const percent = z.number().min(0).max(100);

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DRAW_CARD'), count: z.number().int().min(1).max(40).optional() }),
  z.object({
    type: z.literal('PLAY_CARD'),
    scryfallId: z.string(),
    fromZone: z.enum(['hand', 'commandZone']),
    x: percent.optional(),
    y: percent.optional(),
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
  z.object({ type: z.literal('PASS_TURN') }),
  z.object({ type: z.literal('SCRY'), count: z.number().int().min(1).max(20) }),
  z.object({ type: z.literal('SURVEIL'), count: z.number().int().min(1).max(20) }),
  z.object({ type: z.literal('RESOLVE_LOOK'), scryfallId: z.string(), destination: lookDestination }),
  z.object({ type: z.literal('SHUFFLE_LIBRARY') }),
  z.object({ type: z.literal('UNTAP_ALL') }),
  z.object({ type: z.literal('RESET_LIFE') }),
  z.object({ type: z.literal('RESET_BOARD') }),
  z.object({ type: z.literal('RESTART_GAME') }),
]);

export type Action = z.infer<typeof actionSchema>;
