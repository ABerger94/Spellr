// WOTC's Commander Brackets system (1-5): a shared vocabulary for describing
// a Commander deck/table's power level, from casual to competitive.
export const BRACKET_NAMES: Record<number, string> = {
  1: 'Exhibition',
  2: 'Core',
  3: 'Upgraded',
  4: 'Optimized',
  5: 'cEDH',
};

export const BRACKET_OPTIONS = [1, 2, 3, 4, 5];

export function bracketTagLabel(bracket: number): string {
  return `B${bracket} · ${BRACKET_NAMES[bracket] ?? 'Unknown'}`;
}
