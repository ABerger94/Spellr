import { z } from 'zod';

const zoneName = z.enum(['library', 'hand', 'battlefield', 'graveyard', 'exile', 'commandZone']);

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DRAW_CARD') }),
  z.object({ type: z.literal('PLAY_CARD'), scryfallId: z.string(), fromZone: z.enum(['hand', 'commandZone']) }),
  z.object({ type: z.literal('TAP_CARD'), instanceId: z.string() }),
  z.object({ type: z.literal('UNTAP_CARD'), instanceId: z.string() }),
  z.object({
    type: z.literal('MOVE_CARD'),
    fromZone: zoneName,
    toZone: zoneName,
    instanceId: z.string().optional(),
    scryfallId: z.string().optional(),
  }),
  z.object({ type: z.literal('ADJUST_LIFE'), seat: z.number().int(), delta: z.number().int() }),
  z.object({ type: z.literal('PASS_TURN') }),
]);

export type Action = z.infer<typeof actionSchema>;
