function pdfFixture({
  width = 612,
  height = 960,
  rotation = 0,
  marker = false,
  fieldCount = 1,
} = {}) {
  const x = (value) => (value * width) / 612;
  const y = (value) => (value * height) / 960;
  const content =
    (fieldCount === 1
      ? `BT /F1 12 Tf ${x(80)} ${y(700)} Td (Nama:) Tj ET\n${x(160)} ${y(697)} m ${x(400)} ${y(697)} l S\n`
      : '') + (marker ? `1 0 1 rg 30 ${height - 80} 40 40 re f\n` : '');
  const references = Array.from({ length: fieldCount }, (_, index) => `${7 + index} 0 R`).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /AcroForm 6 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Rotate ${rotation} /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R /Annots [${references}] >>`,
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Fields [${references}] >>`,
    ...Array.from({ length: fieldCount }, (_, index) => {
      const bottom = fieldCount === 1 ? y(650) : height - 60 - (index * height) / (fieldCount + 2);
      const top = fieldCount === 1 ? y(680) : bottom + 20;
      return `<< /Type /Annot /Subtype /Widget /FT /Tx /T (${fieldCount === 1 ? 'tanggal_lahir' : `field_${index + 1}`}) /Rect [${x(160)} ${bottom} ${x(400)} ${top}] /P 3 0 R >>`;
    }),
  ];
  let source = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const offset = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((value) => {
    source += `${String(value).padStart(10, '0')} 00000 n \n`;
  });
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return Buffer.from(source);
}
module.exports = { pdfFixture };
