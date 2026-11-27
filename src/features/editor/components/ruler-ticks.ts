import { UNIT_MM, type Unit } from '@/domain/document/units';

/**
 * Tick marks and labels for a ruler of `length` mm. Positions are in px at the given
 * zoom; `labels` are mm positions and `labelText` gives their text in the unit.
 */
export function rulerTicks(length: number, zoom: number, unit: Unit = 'mm') {
  const scale = (96 / 25.4) * zoom;
  if (unit !== 'mm') return unitTicks(length, zoom, unit, scale);
  const major = zoom < 1 ? 20 : 10;
  const step = zoom < 0.65 ? 5 : zoom < 1 ? 2 : 1;
  const ticks = [];
  for (let value = 0; value <= length; value++) {
    if (value % step !== 0 && value % 5 !== 0 && value !== length) continue;
    ticks.push({
      value,
      position: value * scale,
      size: value % 10 === 0 ? 9 : value % 5 === 0 ? 6 : 3,
    });
  }
  const labels = [];
  for (let value = 0; value <= length; value += major) labels.push(value);
  if (labels.at(-1) !== length) {
    if (length - labels.at(-1)! < major) labels.pop();
    labels.push(length);
  }
  return { scale, ticks, labels, labelText: (mm: number) => String(mm) };
}

/** Inch rulers tick every 1/8 in with labels per inch; point rulers every 10 pt. */
function unitTicks(length: number, zoom: number, unit: Exclude<Unit, 'mm'>, scale: number) {
  const unitMm = UNIT_MM[unit];
  const config =
    unit === 'in'
      ? { minor: zoom < 0.65 ? 0.25 : 0.125, mid: 0.5, major: 1 }
      : { minor: zoom < 0.65 ? 20 : 10, mid: 50, major: zoom < 1 ? 200 : 100 };
  const total = length / unitMm;
  const near = (value: number, step: number) =>
    Math.abs(value / step - Math.round(value / step)) < 1e-6;
  const ticks = [];
  for (let index = 0; index * config.minor <= total + 1e-9; index++) {
    const value = index * config.minor;
    ticks.push({
      value: value * unitMm,
      position: value * unitMm * scale,
      size: near(value, config.major) ? 9 : near(value, config.mid) ? 6 : 3,
    });
  }
  const labels = [];
  for (let value = 0; value <= total + 1e-9; value += config.major) labels.push(value * unitMm);
  return {
    scale,
    ticks,
    labels,
    labelText: (mm: number) => String(Math.round(mm / unitMm)),
  };
}
