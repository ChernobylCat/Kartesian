/**
 * Display units. Coordinates are always stored in millimetres; inches and points are
 * only for showing and typing values.
 */
export const UNITS = ['mm', 'in', 'pt'] as const;
export type Unit = (typeof UNITS)[number];

/** Millimetres per unit. */
export const UNIT_MM: Record<Unit, number> = { mm: 1, in: 25.4, pt: 25.4 / 72 };
/** Decimals shown and accepted per unit (0.1 mm ≈ 0.004 in ≈ 0.3 pt). */
export const UNIT_DECIMALS: Record<Unit, number> = { mm: 1, in: 3, pt: 1 };
/** Input step per unit. */
export const UNIT_STEP: Record<Unit, number> = { mm: 0.1, in: 0.01, pt: 0.5 };

export const isUnit = (value: unknown): value is Unit =>
  typeof value === 'string' && (UNITS as readonly string[]).includes(value);

const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** A stored millimetre value in the display unit, rounded for display. */
export const toUnit = (mm: number, unit: Unit) => roundTo(mm / UNIT_MM[unit], UNIT_DECIMALS[unit]);
/** A typed display value back in millimetres, on the stored 0.1 mm grid. */
export const fromUnit = (value: number, unit: Unit) => roundTo(value * UNIT_MM[unit], 1);
