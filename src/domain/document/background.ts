export type ImageSize = { width: number; height: number };
type Rect = { x: number; y: number; width: number; height: number };

// Match object-fit: contain / object-position: center on the fixed F4 sheet.
export function backgroundBounds(image: ImageSize): Rect {
  if (
    !(image.width > 0 && image.height > 0) ||
    !Number.isFinite(image.width) ||
    !Number.isFinite(image.height)
  )
    throw new Error('Dimensi background tidak valid.');
  const scale = Math.min(210 / image.width, 330 / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { x: (210 - width) / 2, y: (330 - height) / 2, width, height };
}

// Detector results (including saved legacy candidates) are normalized to the
// full 210 × 330 sheet. Keep that storage contract and map only at its consumers.
export function fitBackgroundRect<T extends Rect>(rect: T, image: ImageSize): T {
  const bounds = backgroundBounds(image);
  return {
    ...rect,
    x: bounds.x + (rect.x / 210) * bounds.width,
    y: bounds.y + (rect.y / 330) * bounds.height,
    width: (rect.width / 210) * bounds.width,
    height: (rect.height / 330) * bounds.height,
  };
}
