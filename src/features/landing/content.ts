import type { Locale } from '@/i18n/core';

/** Copy for one language of the landing page. Icons and layout live in LandingPage. */
export type LandingCopy = {
  meta: { title: string; description: string };
  skip: string;
  home: string;
  nav: { label: string; steps: string; features: string; privacy: string };
  /** Link to the other language, written in that language. */
  switchLanguage: { href: string; label: string; lang: Locale };
  openEditor: string;
  hero: {
    eyebrow: string;
    title: string;
    lede: string;
    secondary: string;
    meta: string;
    alt: string;
    caption: string;
    tag: string;
  };
  steps: { kicker: string; title: string; items: { title: string; body: string }[] };
  features: {
    kicker: string;
    title: string;
    items: { title: string; body: string }[];
    specs: { value: string; unit: string; label: string }[];
  };
  privacy: {
    kicker: string;
    title: string;
    body: string;
    points: { title: string; body: string }[];
  };
  cta: { title: string; body: string };
  footer: { license: string; label: string; editor: string; source: string };
};

export const LANDING: Record<Locale, LandingCopy> = {
  id: {
    meta: {
      title: 'Kartesian — Cetak data tepat di formulir pracetak',
      description:
        'Editor cetak koordinat di browser. Tempatkan teks, gambar, barcode, dan QR di atas formulir pracetak atau PDF dengan ketelitian 0,1 mm, isi dari CSV, lalu cetak atau ekspor ke PDF tanpa server dan tanpa akun.',
    },
    skip: 'Lewati ke konten',
    home: 'Kartesian, beranda',
    nav: { label: 'Navigasi halaman', steps: 'Cara kerja', features: 'Fitur', privacy: 'Privasi' },
    switchLanguage: { href: '/en/', label: 'English', lang: 'en' },
    openEditor: 'Buka editor',
    hero: {
      eyebrow: 'Editor cetak koordinat untuk formulir pracetak',
      title: 'Data jatuh tepat di kolomnya.',
      lede: 'Kartesian menempatkan teks dan gambar di atas formulir pracetak atau PDF dengan ketelitian 0,1 mm. Susun sekali, isi banyak dokumen sekaligus dari CSV, lalu cetak dari browser atau ekspor ke PDF. Tanpa server dan tanpa akun.',
      secondary: 'Lihat cara kerja',
      meta: 'Gratis dan open source · Apache 2.0 · Bekerja offline',
      alt: 'Kanvas editor Kartesian: formulir F4 dari PDF panduan dengan nama, NIK, dan alamat yang sudah diposisikan di kolomnya, serta penggaris milimeter di tepi kanvas.',
      caption: 'Tampilan editor Kartesian',
      tag: 'x 66,0 · y 69,4 mm',
    },
    steps: {
      kicker: 'Cara kerja',
      title: 'Dari formulir kosong ke hasil cetak dalam tiga langkah.',
      items: [
        {
          title: 'Pasang formulirnya',
          body: 'Unggah PDF formulir (hingga 25 MB dan 50 halaman). Halamannya tampil di bawah kanvas sebagai panduan posisi.',
        },
        {
          title: 'Tandai field',
          body: 'Deteksi otomatis membaca AcroForm, tabel, kotak, dan garis isian. Tinjau kandidatnya, lalu terapkan sebagai placeholder seperti {{nama}}.',
        },
        {
          title: 'Kalibrasi, lalu cetak',
          body: 'Geser offset X/Y sesuai printer Anda, lalu cetak langsung dari browser atau ekspor ke PDF dan HTML mandiri, untuk semua dokumen atau sebagian saja.',
        },
      ],
    },
    features: {
      kicker: 'Fitur',
      title: 'Dibuat untuk pekerjaan yang harus pas sampai milimeter.',
      items: [
        {
          title: 'Kertas apa saja',
          body: 'A3, A4, A5, B5, F4, Letter, Legal, atau ukuran kustom, potret maupun lanskap. Ketelitian 0,1 mm, dengan tampilan dalam milimeter, inci, atau poin.',
        },
        {
          title: 'Edit secara visual',
          body: 'Drag, resize ke 8 arah, rata dan distribusi, grid dengan snap, panel layer, grup, salin-tempel antar dokumen, plus undo/redo sampai 50 langkah.',
        },
        {
          title: 'Gabung data dari CSV',
          body: 'Satu baris CSV menjadi satu dokumen, hingga 100 dokumen. Format nilai seperti rupiah, terbilang, dan tanggal langsung di placeholder: {{nominal|rupiah}}.',
        },
        {
          title: 'Teks yang pas di kolom',
          body: 'Rata kiri, tengah, atau kanan, jarak huruf dan baris, kotak per huruf untuk NIK, dan perkecil otomatis agar teks panjang tetap muat.',
        },
        {
          title: 'Barcode, QR, dan tanda',
          body: 'Code 128, EAN-13, dan QR yang bisa diisi dari data, serta centang, silang, garis, dan kotak penutup untuk formulir.',
        },
        {
          title: 'Cetak, PDF, atau HTML',
          body: 'Ekspor PDF vektor tanpa dialog cetak, atau cetak sebagian dokumen dan rentang halaman. Offset ±50 mm mengoreksi pergeseran printer.',
        },
        {
          title: 'Workspace dan templat',
          body: 'Simpan beberapa workspace untuk pekerjaan berbeda, dan jadikan layout yang sering dipakai sebagai templat.',
        },
        {
          title: 'Deteksi field opsional',
          body: 'PDF.js bekerja di browser. Untuk dokumen hasil scan, pasang service lokal PyMuPDF atau PaddleOCR.',
        },
        {
          title: 'Tetap jalan offline',
          body: 'Setelah dibuka sekali, editor, pembaca PDF, dan font tersimpan di perangkat. Bisa dipasang sebagai aplikasi.',
        },
      ],
      specs: [
        { value: '0,1', unit: 'mm', label: 'ketelitian posisi' },
        { value: '7', unit: '+ kustom', label: 'ukuran kertas' },
        { value: '±50', unit: 'mm', label: 'offset printer' },
        { value: '100', unit: 'dok.', label: 'per workspace' },
      ],
    },
    privacy: {
      kicker: 'Privasi',
      title: 'Data Anda tidak pernah meninggalkan perangkat.',
      body: 'Data nasabah, nomor identitas, dan nominal biasanya tidak boleh keluar dari kantor. Kartesian tidak punya server tempat data dikirim.',
      points: [
        {
          title: 'Tersimpan lokal.',
          body: 'Workspace, PDF, dan gambar disimpan di IndexedDB browser Anda. Backup bisa diunduh kapan saja.',
        },
        {
          title: 'Satu tab, satu penulis.',
          body: 'Bila editor terbuka di dua tab, tab kedua menjadi hanya-baca agar data tidak saling menimpa.',
        },
        {
          title: 'Deteksi tetap di mesin Anda.',
          body: 'Service PyMuPDF dan PaddleOCR berjalan di localhost, bukan di cloud.',
        },
      ],
    },
    cta: {
      title: 'Siapkan layout pertama Anda.',
      body: 'Tidak perlu mendaftar. Editor langsung terbuka di browser.',
    },
    footer: {
      license: 'Dirilis dengan lisensi Apache 2.0.',
      label: 'Tautan kaki',
      editor: 'Editor',
      source: 'Kode sumber',
    },
  },
  en: {
    meta: {
      title: 'Kartesian — Print data exactly where the form expects it',
      description:
        'A coordinate print editor in your browser. Place text, images, barcodes and QR codes on pre-printed forms or PDFs to within 0.1 mm, fill them from a CSV, then print or export a PDF with no server and no account.',
    },
    skip: 'Skip to content',
    home: 'Kartesian, home',
    nav: {
      label: 'Page navigation',
      steps: 'How it works',
      features: 'Features',
      privacy: 'Privacy',
    },
    switchLanguage: { href: '/', label: 'Bahasa Indonesia', lang: 'id' },
    openEditor: 'Open the editor',
    hero: {
      eyebrow: 'Coordinate print editor for pre-printed forms',
      title: 'Every value lands in its box.',
      lede: 'Kartesian places text and images on pre-printed forms or PDFs to within 0.1 mm. Lay it out once, fill many documents at a time from a CSV, then print from the browser or export a PDF. No server, no account.',
      secondary: 'See how it works',
      meta: 'Free and open source · Apache 2.0 · Works offline',
      alt: 'The Kartesian editor canvas: an F4 form from a PDF guide with a name, ID number and address already placed in their fields, and millimetre rulers along the edges.',
      caption: 'The Kartesian editor',
      tag: 'x 66.0 · y 69.4 mm',
    },
    steps: {
      kicker: 'How it works',
      title: 'From a blank form to a printed page in three steps.',
      items: [
        {
          title: 'Add the form',
          body: 'Upload the form as a PDF (up to 25 MB and 50 pages). Its pages appear under the canvas as a placement guide.',
        },
        {
          title: 'Mark the fields',
          body: 'Automatic detection reads AcroForms, tables, boxes and fill-in lines. Review the candidates, then apply them as placeholders such as {{name}}.',
        },
        {
          title: 'Calibrate, then print',
          body: 'Adjust the X/Y offset for your printer, then print straight from the browser or export a PDF or standalone HTML file, for every document or only some.',
        },
      ],
    },
    features: {
      kicker: 'Features',
      title: 'Built for work that has to fit to the millimetre.',
      items: [
        {
          title: 'Any paper size',
          body: 'A3, A4, A5, B5, F4, Letter, Legal or a custom size, in portrait or landscape. Precise to 0.1 mm, shown in millimetres, inches or points.',
        },
        {
          title: 'Visual editing',
          body: 'Drag, resize from 8 handles, align and distribute, snap to a grid, use layers and groups, copy and paste between documents, with up to 50 steps of undo.',
        },
        {
          title: 'Merge data from a CSV',
          body: 'Each CSV row becomes a document, up to 100 of them. Format values such as currency, amounts in words and dates right in the placeholder: {{amount|number}}.',
        },
        {
          title: 'Text that fits the box',
          body: 'Left, centre or right alignment, letter and line spacing, one box per character for ID numbers, and shrink to fit so long values are never cut off.',
        },
        {
          title: 'Barcodes, QR and marks',
          body: 'Code 128, EAN-13 and QR codes that can be filled from data, plus ticks, crosses, lines and cover boxes for forms.',
        },
        {
          title: 'Print, PDF or HTML',
          body: 'Export a vector PDF without the print dialog, or print only some documents and page ranges. Offsets of up to ±50 mm correct printer drift.',
        },
        {
          title: 'Workspaces and templates',
          body: 'Keep separate workspaces for different jobs, and save layouts you reuse as templates.',
        },
        {
          title: 'Optional field detection',
          body: 'PDF.js runs in the browser. For scanned documents, install the local PyMuPDF or PaddleOCR service.',
        },
        {
          title: 'Works offline',
          body: 'After the first visit, the editor, PDF reader and fonts stay on your device. It can be installed as an app.',
        },
      ],
      specs: [
        { value: '0.1', unit: 'mm', label: 'placement precision' },
        { value: '7', unit: '+ custom', label: 'paper sizes' },
        { value: '±50', unit: 'mm', label: 'printer offset' },
        { value: '100', unit: 'docs', label: 'per workspace' },
      ],
    },
    privacy: {
      kicker: 'Privacy',
      title: 'Your data never leaves your device.',
      body: 'Customer details, ID numbers and amounts usually must not leave the office. Kartesian has no server to send them to.',
      points: [
        {
          title: 'Stored locally.',
          body: 'Workspaces, PDFs and images are kept in your browser’s IndexedDB. Download a backup at any time.',
        },
        {
          title: 'One tab, one writer.',
          body: 'If the editor is open in two tabs, the second becomes read-only so they never overwrite each other.',
        },
        {
          title: 'Detection stays on your machine.',
          body: 'The PyMuPDF and PaddleOCR services run on localhost, not in the cloud.',
        },
      ],
    },
    cta: {
      title: 'Set up your first layout.',
      body: 'No sign-up needed. The editor opens right in your browser.',
    },
    footer: {
      license: 'Released under the Apache 2.0 licence.',
      label: 'Footer links',
      editor: 'Editor',
      source: 'Source code',
    },
  },
};
