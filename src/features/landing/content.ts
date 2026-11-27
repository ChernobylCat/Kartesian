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
        'Editor cetak koordinat di browser. Tempatkan teks dan gambar di atas formulir pracetak atau PDF dengan ketelitian 0,1 mm, lalu cetak tanpa server dan tanpa akun.',
    },
    skip: 'Lewati ke konten',
    home: 'Kartesian, beranda',
    nav: { label: 'Navigasi halaman', steps: 'Cara kerja', features: 'Fitur', privacy: 'Privasi' },
    switchLanguage: { href: '/en/', label: 'English', lang: 'en' },
    openEditor: 'Buka editor',
    hero: {
      eyebrow: 'Editor cetak koordinat untuk formulir pracetak',
      title: 'Data jatuh tepat di kolomnya.',
      lede: 'Kartesian menempatkan teks dan gambar di atas formulir pracetak atau PDF dengan ketelitian 0,1 mm. Susun sekali, isi untuk banyak dokumen, lalu cetak dari browser. Tanpa server dan tanpa akun.',
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
          body: 'Geser offset X/Y sesuai printer Anda, cetak langsung dari browser, atau ekspor ke HTML mandiri.',
        },
      ],
    },
    features: {
      kicker: 'Fitur',
      title: 'Dibuat untuk pekerjaan yang harus pas sampai milimeter.',
      items: [
        {
          title: 'Kertas apa saja',
          body: 'A3, A4, A5, B5, F4, Letter, Legal, atau ukuran kustom, potret maupun lanskap. Koordinat milimeter dengan ketelitian 0,1 mm dan snapping magnetik.',
        },
        {
          title: 'Edit secara visual',
          body: 'Drag, resize ke 8 arah, multi-seleksi, rata dan distribusi, plus undo/redo sampai 50 langkah.',
        },
        {
          title: 'Satu layout, banyak dokumen',
          body: 'Isi hingga 100 dokumen dengan layout yang sama. Datanya bisa diubah langsung lewat panel JSON.',
        },
        {
          title: 'Deteksi field opsional',
          body: 'PDF.js bekerja di browser. Untuk dokumen hasil scan, pasang service lokal PyMuPDF atau PaddleOCR.',
        },
        {
          title: 'Kalibrasi printer',
          body: 'Offset hingga ±50 mm mengoreksi pergeseran printer tanpa mengubah layout yang sudah tersusun.',
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
        'A coordinate print editor in your browser. Place text and images on pre-printed forms or PDFs to within 0.1 mm, then print with no server and no account.',
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
      lede: 'Kartesian places text and images on pre-printed forms or PDFs to within 0.1 mm. Lay it out once, fill it for many documents, and print from the browser. No server, no account.',
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
          body: 'Adjust the X/Y offset for your printer, print straight from the browser, or export a standalone HTML file.',
        },
      ],
    },
    features: {
      kicker: 'Features',
      title: 'Built for work that has to fit to the millimetre.',
      items: [
        {
          title: 'Any paper size',
          body: 'A3, A4, A5, B5, F4, Letter, Legal or a custom size, in portrait or landscape. Millimetre coordinates to 0.1 mm with magnetic snapping.',
        },
        {
          title: 'Visual editing',
          body: 'Drag, resize from 8 handles, multi-select, align and distribute, with up to 50 steps of undo and redo.',
        },
        {
          title: 'One layout, many documents',
          body: 'Fill up to 100 documents with the same layout. Edit the data directly in the JSON panel.',
        },
        {
          title: 'Optional field detection',
          body: 'PDF.js runs in the browser. For scanned documents, install the local PyMuPDF or PaddleOCR service.',
        },
        {
          title: 'Printer calibration',
          body: 'Offsets of up to ±50 mm correct printer drift without touching the finished layout.',
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
