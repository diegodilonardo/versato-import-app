const XLSX = require('xlsx');
function leerLibro(buffer, opciones = {}) {
  const zip = buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const ole = buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  try {
    if (zip || ole) return XLSX.read(buffer, { ...opciones, type: 'buffer', bookVBA: false });
    let texto;
    if (buffer[0] === 0xff && buffer[1] === 0xfe) texto = new TextDecoder('utf-16le').decode(buffer);
    else if (buffer[0] === 0xfe && buffer[1] === 0xff) texto = new TextDecoder('utf-16be').decode(buffer);
    else {
      try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch { texto = new TextDecoder('windows-1252').decode(buffer); }
    }
    texto = texto.replace(/^[\s\uFEFF]+/, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
    if (!/^<(?:!doctype\b|\?xml\b|html\b|head\b|body\b|meta\b|table\b|link\b)/i.test(texto) || !/<table\b/i.test(texto) || !/<t[dh]\b/i.test(texto)) {
      throw new Error('contenido');
    }
    if ((texto.match(/<table\b/gi) || []).length > 100) throw new Error('Demasiadas tablas HTML (máximo 100).');
    // No se usa DOM ni navegador: no se ejecutan scripts ni se descargan recursos.
    // Leer HTML completo evita que una vista previa recortada se confunda con el total.
    const { sheetRows, sheets, ...resto } = opciones;
    const libro = XLSX.read(texto, { ...resto, type: 'string', raw: true, bookVBA: false });
    if (!libro.SheetNames.length) throw new Error('Sin tablas');
    return libro;
  } catch (error) {
    throw Object.assign(new Error(zip || ole ? 'No se pudo leer el Excel. Verificá que no esté dañado ni protegido con contraseña.'
      : 'El contenido no es un libro Excel ni un reporte HTML con tablas admitido.'), { status: 422 });
  }
}
module.exports = { leerLibro };
