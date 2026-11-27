import { z } from 'zod';
import { DEFAULT_PAPER, type Paper } from './paper';
import { t } from '@/i18n/core';

export const LIMITS = Object.freeze({
  documents: 100,
  pages: 100,
  items: 1000,
  total: 5000,
  imageBytes: 2 * 1024 ** 2,
  settingsBytes: 5 * 1024 ** 2,
  pdfBytes: 25 * 1024 ** 2,
  pdfPages: 50,
  pdfPixels: 20_000_000,
  backupBytes: 150 * 1024 ** 2,
});
export const FONTS = [
  'Arial, sans-serif',
  'Courier New, Courier, monospace',
  'Times New Roman, Times, serif',
  'Georgia, serif',
  'Verdana, sans-serif',
  'Plus Jakarta Sans, sans-serif',
] as const;
export const imageSource = /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\r\n]+$/i;
/** Finite number, also accepting numeric strings written by the legacy editor. */
export const numericInput = z
  .union([
    z.number(),
    z
      .string()
      .trim()
      .regex(/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i),
  ])
  .transform(Number)
  .pipe(z.number().finite());
const color = z.string().regex(/^#[0-9a-f]{6}$/i);

/** Item kinds. Every kind except `text` needs an explicit width and height. */
export const ITEM_TYPES = ['text', 'image', 'mark', 'line', 'rect', 'barcode', 'qr'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export const BOXED_TYPES: ReadonlySet<ItemType> = new Set([
  'image',
  'mark',
  'line',
  'rect',
  'barcode',
  'qr',
]);
export const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
/** `mark` items store their glyph in `text`. */
export const MARK_GLYPHS = ['check', 'cross', 'dot'] as const;
/** `line` items store their direction in `text`; the line spans the item's box. */
export const LINE_DIRECTIONS = ['horizontal', 'vertical', 'diagonal', 'antidiagonal'] as const;
export const BARCODE_FORMATS = ['code128', 'ean13'] as const;

/** Item schema for one sheet size; coordinates must stay on that sheet. */
function createItemSchema(paper: Paper) {
  return z
    .object({
      type: z.enum(ITEM_TYPES).optional(),
      text: z.string(),
      x: numericInput.pipe(
        z
          .number()
          .min(0)
          .max(paper.width, { error: () => t('validation.xOutside') }),
      ),
      y: numericInput.pipe(
        z
          .number()
          .min(0)
          .max(paper.height, { error: () => t('validation.yOutside') }),
      ),
      width: numericInput.pipe(z.number().positive()).optional(),
      height: numericInput.pipe(z.number().positive()).optional(),
      font_family: z.enum(FONTS).optional(),
      font_size: numericInput.optional(),
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
      underline: z.boolean().optional(),
      color: color.optional(),
      bg_color: color.optional(),
      rotation: numericInput.pipe(z.number().min(-360).max(360)).optional(),
      z_index: z.number().int().min(-1000).max(1000).optional(),
      locked: z.boolean().optional(),
      // Text layout for form fields.
      text_align: z.enum(TEXT_ALIGNS).optional(),
      /** Extra space between characters, in mm. */
      letter_spacing: numericInput.pipe(z.number().min(0).max(50)).optional(),
      /** Splits the box into equal cells, one character per cell (e.g. ID number boxes). */
      comb_cells: z.number().int().min(1).max(100).optional(),
      /** Multiple of the font size. */
      line_height: numericInput.pipe(z.number().min(0.5).max(4)).optional(),
      /** `shrink` lowers the font size until the text fits its box (minimum 4 pt). */
      fit: z.enum(['shrink']).optional(),
      /** Line or border thickness in mm for `line` and `rect` items. */
      stroke_width: numericInput.pipe(z.number().min(0.05).max(20)).optional(),
      barcode_format: z.enum(BARCODE_FORMATS).optional(),
      /** Items sharing a group id are selected and moved together. */
      group_id: z.string().min(1).max(100).optional(),
    })
    .passthrough()
    .superRefine((item, ctx) => {
      const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
      if (item.width !== undefined && item.x + item.width > paper.width)
        fail(t('validation.widthOverflow'));
      if (item.height !== undefined && item.y + item.height > paper.height)
        fail(t('validation.heightOverflow'));
      const type = item.type ?? 'text';
      if (BOXED_TYPES.has(type) && (!item.width || !item.height))
        fail(type === 'image' ? t('validation.imageSize') : t('validation.boxSize'));
      if (type === 'image') {
        if (!imageSource.test(item.text) || item.text.length > LIMITS.imageBytes * 1.5)
          fail(t('validation.imageSource'));
      } else if (item.font_size !== undefined && (item.font_size < 4 || item.font_size > 72))
        fail(t('validation.fontSize'));
      if (type === 'mark' && !(MARK_GLYPHS as readonly string[]).includes(item.text))
        fail(t('validation.markGlyph'));
      if (type === 'line' && !(LINE_DIRECTIONS as readonly string[]).includes(item.text))
        fail(t('validation.lineDirection'));
      if ((type === 'barcode' || type === 'qr') && (!item.text.trim() || item.text.length > 500))
        fail(t('validation.codeValue'));
      if (item.comb_cells !== undefined && !item.width) fail(t('validation.combWidth'));
    });
}
/**
 * JSON keys that may hold a document's name, in priority order. `title` is what new
 * documents use. The others come from older JSON files and are still read and written
 * back unchanged, so importing and exporting never renames a user's keys.
 */
export const TITLE_KEYS = ['title', 'name', 'debitur'] as const;
export type TitleKey = (typeof TITLE_KEYS)[number];
const titleFields = Object.fromEntries(
  TITLE_KEYS.map((key) => [key, z.string().optional()]),
) as Record<TitleKey, z.ZodOptional<z.ZodString>>;
function createDocumentSchema(paper: Paper) {
  const itemSchema = createItemSchema(paper);
  return z
    .array(
      z
        .object({
          ...titleFields,
          pages: z
            .array(
              z
                .object({
                  page_number: z.number().int(),
                  items: z.array(itemSchema).max(LIMITS.items),
                })
                .passthrough(),
            )
            .max(LIMITS.pages)
            .superRefine((pages, ctx) =>
              pages.forEach((page, index) => {
                if (page.page_number !== index + 1)
                  ctx.addIssue({ code: 'custom', message: t('validation.pageOrder') });
              }),
            ),
        })
        .passthrough(),
    )
    .min(1)
    .max(LIMITS.documents)
    .superRefine((data, ctx) => {
      if (
        data.reduce(
          (total, docEntry) =>
            total + docEntry.pages.reduce((sum, page) => sum + page.items.length, 0),
          0,
        ) > LIMITS.total
      )
        ctx.addIssue({
          code: 'custom',
          message: t('validation.totalItems', { max: LIMITS.total }),
        });
    });
}
type DocumentSchema = ReturnType<typeof createDocumentSchema>;
const schemas = new Map<string, DocumentSchema>();
/**
 * Document schema for a sheet size. Schemas are cached because parsing runs per edit,
 * so every message is resolved at parse time to follow the active language.
 */
export function documentSchema(paper: Paper = DEFAULT_PAPER): DocumentSchema {
  const key = `${paper.width}x${paper.height}`;
  let schema = schemas.get(key);
  if (!schema) schemas.set(key, (schema = createDocumentSchema(paper)));
  return schema;
}
export type LegacyItem = z.infer<ReturnType<typeof createItemSchema>>;
export type LegacyDocument = z.infer<DocumentSchema>;
/** Parses and validates the JSON document format against the given sheet size. */
export function parseLegacy(raw: string | unknown, paper: Paper = DEFAULT_PAPER): LegacyDocument {
  const result = documentSchema(paper).safeParse(
    typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw,
  );
  if (!result.success)
    throw new Error(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'),
    );
  return result.data;
}
