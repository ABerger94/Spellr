import { z } from 'zod';

const zoneName = z.enum(['library', 'hand', 'battlefield', 'graveyard', 'exile', 'commandZone']);
const libraryPosition = z.enum(['top', 'bottom']);
const lookDestination = z.enum(['top', 'bottom', 'graveyard']);

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DRAW_CARD'), count: z.number().int().min(1).max(40).optional() }),
  z.object({ type: z.literal('PLAY_CARD'), scryfallId: z.string(), fromZone: z.enum(['hand', 'commandZone']) }),
  z.object({ type: z.literal('TAP_CARD'), instanceId: z.string() }),
  z.object({ type: z.literal('UNTAP_CARD'), instanceId: z.string() }),
  z.object({
    type: z.literal('MOVE_CARD'),
    fromZone: zoneName,
    toZone: zoneName,
    instanceId: z.string().optional(),
    scryfallId: z.string().optional(),
    position: libraryPosition.optional(),
  }),
  z.object({ type: z.literal('ADJUST_LIFE'), seat: z.number().int(), delta: z.number().int() }),
  z.object({ type: z.literal('PASS_TURN') }),
  z.object({ type: z.literal('SCRY'), count: z.number().int().min(1).max(20) }),
  z.object({ type: z.literal('SURVEIL'), count: z.number().int().min(1).max(20) }),
  z.object({ type: z.literal('RESOLVE_LOOK'), scryfallId: z.string(), destination: lookDestination }),
]);

export type Action = z.infer<typeof actionSchema>;
