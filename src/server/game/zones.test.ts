import test from 'node:test';
import assert from 'node:assert/strict';
import { mulliganHand } from './zones';

test('mulliganHand puts the selected cards on the bottom and draws the reduced hand size', () => {
  const zones = {
    library: ['lib-1', 'lib-2', 'lib-3', 'lib-4', 'lib-5', 'lib-6', 'lib-7', 'lib-8', 'lib-9'],
    hand: ['hand-1', 'hand-2', 'hand-3', 'hand-4', 'hand-5', 'hand-6', 'hand-7'],
    battlefield: [],
    graveyard: [],
    exile: [],
    commandZone: [],
  };

  const result = mulliganHand(zones, 5, ['hand-1', 'hand-2']);

  assert.equal(result.drawnScryfallIds.length, 5);
  assert.equal(result.zones.hand.length, 5);
  assert.ok(result.zones.library.includes('hand-1'));
  assert.ok(result.zones.library.includes('hand-2'));
  assert.ok(!result.zones.hand.includes('hand-1'));
  assert.ok(!result.zones.hand.includes('hand-2'));
});
