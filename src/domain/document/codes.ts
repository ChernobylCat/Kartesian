/**
 * Barcodes (Code 128, EAN-13) and QR codes as SVG, drawn to fill an item's box.
 * Values that cannot be encoded (for example an unfilled `{{key}}` placeholder in a
 * template) are drawn as a labelled outline instead.
 */
import qrcode from 'qrcode-generator';

import { drawingSvg, type Rect, type Shape } from './shapes';

/** An unfilled merge placeholder such as `{{nik}}`. */
const UNFILLED = /\{\{[^{}]*\}\}/;

/** Module widths of Code 128 symbols 0–106 (106 is the stop pattern). */
const CODE128 = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
];
const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;
const STOP = 106;

/**
 * Code 128 symbol values for printable ASCII, using code set C (two digits per
 * symbol) for runs of four or more digits and code set B otherwise.
 */
export function code128Symbols(value: string): number[] | undefined {
  if (!value || !/^[\x20-\x7e]+$/.test(value)) return undefined;
  const symbols: number[] = [];
  let set: 'B' | 'C' | undefined;
  let index = 0;
  const digitRun = (from: number) => /^\d*/.exec(value.slice(from))![0].length;
  while (index < value.length) {
    const run = digitRun(index);
    // Code set C pays off for 4+ digits, or 2+ when the whole value is digits.
    const useC = run >= 4 || (run >= 2 && run === value.length - index && index === 0);
    if (useC) {
      const pairs = Math.floor(run / 2);
      if (set !== 'C') symbols.push(set ? CODE_C : START_C);
      set = 'C';
      for (let pair = 0; pair < pairs; pair++, index += 2)
        symbols.push(Number(value.slice(index, index + 2)));
      continue;
    }
    if (set !== 'B') symbols.push(set ? CODE_B : START_B);
    set = 'B';
    symbols.push(value.charCodeAt(index) - 32);
    index++;
  }
  const checksum =
    symbols.reduce((sum, symbol, position) => sum + symbol * (position === 0 ? 1 : position), 0) %
    103;
  return [...symbols, checksum, STOP];
}

/** Bar/space widths (in modules) for a Code 128 value. */
export function code128Modules(value: string): number[] | undefined {
  const symbols = code128Symbols(value);
  return symbols?.flatMap((symbol) => [...CODE128[symbol]!].map(Number));
}

const EAN_L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];
const EAN_G = [
  '0100111',
  '0110011',
  '0011011',
  '0100001',
  '0011101',
  '0111001',
  '0000101',
  '0010001',
  '0001001',
  '0010111',
];
const EAN_R = [
  '1110010',
  '1100110',
  '1101100',
  '1000010',
  '1011100',
  '1001110',
  '1010000',
  '1000100',
  '1001000',
  '1110100',
];
const EAN_PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];

/** EAN-13 check digit for the first 12 digits. */
export function ean13CheckDigit(twelve: string) {
  const sum = [...twelve].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1),
    0,
  );
  return (10 - (sum % 10)) % 10;
}

/**
 * EAN-13 module pattern ('1' bar, '0' space) for 12 digits (check digit added) or
 * 13 digits (check digit verified).
 */
export function ean13Pattern(value: string): string | undefined {
  const digits = value.replace(/\s/g, '');
  if (!/^\d{12,13}$/.test(digits)) return undefined;
  const check = ean13CheckDigit(digits.slice(0, 12));
  if (digits.length === 13 && Number(digits[12]) !== check) return undefined;
  const full = digits.slice(0, 12) + check;
  const parity = EAN_PARITY[Number(full[0])]!;
  let pattern = '101';
  for (let index = 1; index <= 6; index++)
    pattern += (parity[index - 1] === 'L' ? EAN_L : EAN_G)[Number(full[index])];
  pattern += '01010';
  for (let index = 7; index <= 12; index++) pattern += EAN_R[Number(full[index])];
  return `${pattern}101`;
}

/** Bars from a module run list, scaled to fill the width with a quiet zone each side. */
function runBars(runs: boolean[], width: number, height: number, quiet: number): Rect[] {
  const unit = width / (runs.length + quiet * 2);
  const bars: Rect[] = [];
  let start = -1;
  runs.forEach((dark, index) => {
    if (dark && start < 0) start = index;
    if ((!dark || index === runs.length - 1) && start >= 0) {
      const end = dark ? index + 1 : index;
      bars.push({ x: (quiet + start) * unit, y: 0, width: (end - start) * unit, height });
      start = -1;
    }
  });
  return bars;
}

/** QR modules for a value (UTF-8, error correction M), or undefined if it cannot fit. */
export function qrModules(value: string): boolean[][] | undefined {
  if (!value) return undefined;
  try {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']!;
    const code = qrcode(0, 'M');
    code.addData(value, 'Byte');
    code.make();
    const count = code.getModuleCount();
    return Array.from({ length: count }, (_, row) =>
      Array.from({ length: count }, (_, column) => code.isDark(row, column)),
    );
  } catch {
    return undefined;
  }
}

/**
 * Shapes for a barcode or QR code filling a box. A template's `{{key}}` (filled in by
 * the CSV merge) and values that cannot be encoded become a labelled placeholder.
 */
export function codeShapes(
  kind: 'barcode' | 'qr',
  value: string,
  format: 'code128' | 'ean13',
  width: number,
  height: number,
  color: string,
): Shape[] {
  const placeholder: Shape[] = [{ kind: 'placeholder', text: value }];
  if (UNFILLED.test(value)) return placeholder;
  if (kind === 'qr') {
    const modules = qrModules(value);
    if (!modules) return placeholder;
    const count = modules.length;
    const side = Math.min(width, height);
    const unit = side / (count + 8);
    const left = (width - side) / 2 + 4 * unit;
    const top = (height - side) / 2 + 4 * unit;
    const bars = modules.flatMap((row, y) =>
      row.flatMap((dark, x) =>
        dark ? [{ x: left + x * unit, y: top + y * unit, width: unit, height: unit }] : [],
      ),
    );
    return [{ kind: 'bars', bars, color }];
  }
  if (format === 'ean13') {
    const pattern = ean13Pattern(value);
    if (!pattern) return placeholder;
    return [
      {
        kind: 'bars',
        bars: runBars(
          [...pattern].map((bit) => bit === '1'),
          width,
          height,
          9,
        ),
        color,
      },
    ];
  }
  const modules = code128Modules(value);
  if (!modules) return placeholder;
  const runs = modules.flatMap((size, index) => Array<boolean>(size).fill(index % 2 === 0));
  return [{ kind: 'bars', bars: runBars(runs, width, height, 10), color }];
}

export const barcodeSvg = (
  value: string,
  format: 'code128' | 'ean13',
  width: number,
  height: number,
  color: string,
) =>
  drawingSvg({ width, height, shapes: codeShapes('barcode', value, format, width, height, color) });

export const qrSvg = (value: string, width: number, height: number, color: string) =>
  drawingSvg({ width, height, shapes: codeShapes('qr', value, 'code128', width, height, color) });
