import { ALLOWED_FONT_FAMILIES, APP_CONFIG } from '../config.mjs';

export function isValidImageSrc(src) {
  if (typeof src !== 'string') return false;
  return /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\r\n]+$/i.test(src);
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function toFiniteNumber(value, label) {
  if (
    typeof value !== 'number' &&
    (typeof value !== 'string' || !/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))
  ) {
    throw new Error(`${label} harus berupa angka yang valid.`);
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} harus berupa angka yang valid.`);
  }
  return number;
}

export function isValidHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export function validateDocumentData(parsed) {
  if (!Array.isArray(parsed)) {
    throw new Error('Format root JSON harus berupa Array [ ].');
  }
  if (parsed.length === 0) {
    throw new Error('Data harus berisi minimal 1 dokumen.');
  }
  if (parsed.length > (APP_CONFIG.MAX_DOCUMENTS || APP_CONFIG.MAX_DEBTORS)) {
    throw new Error(
      `Data melebihi batas ${APP_CONFIG.MAX_DOCUMENTS || APP_CONFIG.MAX_DEBTORS} dokumen.`,
    );
  }

  let totalItems = 0;
  parsed.forEach((docEntry, docIndex) => {
    const docLabel = `Dokumen ke-${docIndex + 1}`;
    if (!isPlainObject(docEntry)) throw new Error(`${docLabel} harus berupa objek { }.`);
    const documentName =
      typeof docEntry.title === 'string' && docEntry.title.trim()
        ? docEntry.title
        : typeof docEntry.name === 'string' && docEntry.name.trim()
          ? docEntry.name
          : typeof docEntry.debitur === 'string' && docEntry.debitur.trim()
            ? docEntry.debitur
            : null;
    if (!documentName) {
      throw new Error(`${docLabel} harus memiliki "title" berupa teks.`);
    }
    if (!Array.isArray(docEntry.pages)) {
      throw new Error(`${docLabel} harus memiliki array "pages".`);
    }
    if (
      docEntry.pages.length > (APP_CONFIG.MAX_PAGES_PER_DOCUMENT || APP_CONFIG.MAX_PAGES_PER_DEBTOR)
    ) {
      throw new Error(
        `${docLabel} melebihi batas ${APP_CONFIG.MAX_PAGES_PER_DOCUMENT || APP_CONFIG.MAX_PAGES_PER_DEBTOR} halaman.`,
      );
    }

    docEntry.pages.forEach((page, pageIndex) => {
      const pageLabel = `${docLabel}, halaman ke-${pageIndex + 1}`;
      if (!isPlainObject(page)) throw new Error(`${pageLabel} harus berupa objek { }.`);
      if (!Number.isInteger(page.page_number) || page.page_number !== pageIndex + 1) {
        throw new Error(`${pageLabel} harus memiliki "page_number" berurutan mulai dari 1.`);
      }
      if (!Array.isArray(page.items)) throw new Error(`${pageLabel} harus memiliki array "items".`);
      if (page.items.length > APP_CONFIG.MAX_ITEMS_PER_PAGE) {
        throw new Error(`${pageLabel} melebihi batas ${APP_CONFIG.MAX_ITEMS_PER_PAGE} elemen.`);
      }
      totalItems += page.items.length;
      if (totalItems > APP_CONFIG.MAX_TOTAL_ITEMS) {
        throw new Error(`Dokumen melebihi batas total ${APP_CONFIG.MAX_TOTAL_ITEMS} elemen.`);
      }

      page.items.forEach((item, itemIndex) => {
        const itemLabel = `${pageLabel}, elemen ke-${itemIndex + 1}`;
        if (!isPlainObject(item)) throw new Error(`${itemLabel} harus berupa objek { }.`);

        const type = item.type === undefined ? 'text' : item.type;
        if (type !== 'text' && type !== 'image') {
          throw new Error(`${itemLabel} memiliki "type" yang tidak didukung.`);
        }
        if (typeof item.text !== 'string') {
          throw new Error(`${itemLabel} harus memiliki "text" berupa string.`);
        }

        const x = toFiniteNumber(item.x, `${itemLabel}: x`);
        const y = toFiniteNumber(item.y, `${itemLabel}: y`);
        if (x < 0 || x > APP_CONFIG.PAPER_WIDTH_MM || y < 0 || y > APP_CONFIG.PAPER_HEIGHT_MM) {
          throw new Error(`${itemLabel} berada di luar batas kertas.`);
        }

        if (item.rotation !== undefined) {
          const rotation = toFiniteNumber(item.rotation, `${itemLabel}: rotation`);
          if (rotation < -360 || rotation > 360)
            throw new Error(`${itemLabel} memiliki rotasi di luar batas -360 sampai 360 derajat.`);
        }
        if (
          item.z_index !== undefined &&
          (!Number.isInteger(item.z_index) || item.z_index < -1000 || item.z_index > 1000)
        ) {
          throw new Error(`${itemLabel} memiliki z_index yang tidak valid.`);
        }
        if (item.locked !== undefined && typeof item.locked !== 'boolean') {
          throw new Error(`${itemLabel} memiliki locked yang bukan boolean.`);
        }

        if (type === 'image') {
          if (!isValidImageSrc(item.text))
            throw new Error(
              `${itemLabel} memiliki sumber gambar yang tidak aman atau tidak didukung.`,
            );
          if (item.text.length > APP_CONFIG.MAX_IMAGE_FILE_SIZE_BYTES * 1.5) {
            throw new Error(`${itemLabel} melebihi batas ukuran gambar.`);
          }
          const width = toFiniteNumber(item.width, `${itemLabel}: width`);
          const height = toFiniteNumber(item.height, `${itemLabel}: height`);
          if (width <= 0 || height <= 0)
            throw new Error(`${itemLabel} harus memiliki ukuran gambar positif.`);
          if (x + width > APP_CONFIG.PAPER_WIDTH_MM || y + height > APP_CONFIG.PAPER_HEIGHT_MM) {
            throw new Error(`${itemLabel} melewati batas kertas.`);
          }
        } else {
          if (item.width !== undefined) {
            const width = toFiniteNumber(item.width, `${itemLabel}: width`);
            if (width <= 0 || x + width > APP_CONFIG.PAPER_WIDTH_MM)
              throw new Error(`${itemLabel} memiliki lebar di luar batas kertas.`);
          }
          if (item.height !== undefined) {
            const height = toFiniteNumber(item.height, `${itemLabel}: height`);
            if (height <= 0 || y + height > APP_CONFIG.PAPER_HEIGHT_MM)
              throw new Error(`${itemLabel} memiliki tinggi di luar batas kertas.`);
          }
          if (item.font_size !== undefined) {
            const fontSize = toFiniteNumber(item.font_size, `${itemLabel}: font_size`);
            if (fontSize < APP_CONFIG.MIN_FONT_SIZE_PT || fontSize > APP_CONFIG.MAX_FONT_SIZE_PT) {
              throw new Error(
                `${itemLabel} memiliki ukuran font di luar batas ${APP_CONFIG.MIN_FONT_SIZE_PT}-${APP_CONFIG.MAX_FONT_SIZE_PT} pt.`,
              );
            }
          }
        }

        if (item.font_family !== undefined && !ALLOWED_FONT_FAMILIES.has(item.font_family)) {
          throw new Error(`${itemLabel} menggunakan font yang tidak didukung.`);
        }
        ['bold', 'italic', 'underline'].forEach((property) => {
          if (item[property] !== undefined && typeof item[property] !== 'boolean') {
            throw new Error(`${itemLabel} memiliki ${property} yang bukan boolean.`);
          }
        });
        ['color', 'bg_color'].forEach((property) => {
          if (item[property] !== undefined && !isValidHexColor(item[property])) {
            throw new Error(`${itemLabel} memiliki ${property} yang tidak valid.`);
          }
        });
      });
    });
  });

  return parsed;
}

export function parseDocumentJson(text) {
  return validateDocumentData(JSON.parse(text));
}
