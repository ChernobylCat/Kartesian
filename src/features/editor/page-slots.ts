/**
 * Every canvas page has a slot key `<documentId>-<index>`. It keys ruler guides for
 * all pages, and is the page id of "virtual" pages: blank pages rendered only so the
 * whole background is visible. Adding content to a virtual page materializes it through
 * the command's `pageNumber`.
 */
export const pageSlotKey = (documentId: string, index: number) => `${documentId}-${index}`;

/** 1-based page number when `pageId` is a slot key of `documentId`, otherwise undefined. */
export function slotPageNumber(pageId: string | null, documentId: string): number | undefined {
  const prefix = `${documentId}-`;
  if (!pageId?.startsWith(prefix)) return undefined;
  const index = Number(pageId.slice(prefix.length));
  return Number.isInteger(index) && index >= 0 ? index + 1 : undefined;
}
