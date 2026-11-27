import { z } from 'zod';

export const LIMITS = Object.freeze({
  width: 210,
  height: 330,
  debtors: 100,
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
const finite = z
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

export const itemSchema = z
  .object({
    type: z.enum(['text', 'image']).optional(),
    text: z.string(),
    x: finite.pipe(z.number().min(0).max(210)),
    y: finite.pipe(z.number().min(0).max(330)),
    width: finite.pipe(z.number().positive()).optional(),
    height: finite.pipe(z.number().positive()).optional(),
    font_family: z.enum(FONTS).optional(),
    font_size: finite.optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    color: color.optional(),
    bg_color: color.optional(),
    rotation: finite.pipe(z.number().min(-360).max(360)).optional(),
    z_index: z.number().int().min(-1000).max(1000).optional(),
    locked: z.boolean().optional(),
  })
  .passthrough()
  .superRefine((item, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (item.width !== undefined && item.x + item.width > 210)
      fail('Lebar elemen melewati batas kertas.');
    if (item.height !== undefined && item.y + item.height > 330)
      fail('Tinggi elemen melewati batas kertas.');
    if (item.type === 'image') {
      if (!imageSource.test(item.text) || item.text.length > LIMITS.imageBytes * 1.5)
        fail('Sumber atau ukuran gambar tidak valid.');
      if (!item.width || !item.height) fail('Gambar memerlukan ukuran positif.');
    } else if (item.font_size !== undefined && (item.font_size < 4 || item.font_size > 72))
      fail('Ukuran font harus 4–72 pt.');
  });
export const legacySchema = z
  .array(
    z
      .object({
        title: z.string().optional(),
        debitur: z.string().optional(),
        name: z.string().optional(),
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
                ctx.addIssue({ code: 'custom', message: 'page_number harus berurutan mulai 1.' });
            }),
          ),
      })
      .passthrough()
      .superRefine((docEntry, ctx) => {
        const label = docEntry.title ?? docEntry.name ?? docEntry.debitur;
        if (!label || typeof label !== 'string' || label.trim().length === 0) {
          ctx.addIssue({ code: 'custom', message: 'Title atau nama dokumen wajib diisi.' });
        }
      }),
  )
  .min(1)
  .max(LIMITS.debtors)
  .superRefine((data, ctx) => {
    if (
      data.reduce(
        (total, docEntry) =>
          total + docEntry.pages.reduce((sum, page) => sum + page.items.length, 0),
        0,
      ) > LIMITS.total
    )
      ctx.addIssue({ code: 'custom', message: 'Dokumen melebihi 5.000 elemen.' });
  });
export type LegacyItem = z.infer<typeof itemSchema>;
export type LegacyDocument = z.infer<typeof legacySchema>;
export function parseLegacy(raw: string | unknown): LegacyDocument {
  const result = legacySchema.safeParse(
    typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw,
  );
  if (!result.success)
    throw new Error(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'),
    );
  return result.data;
}
