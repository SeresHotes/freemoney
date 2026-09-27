// Минимальные чтение и запись .xlsx без зависимостей.
//
// .xlsx — это zip с XML внутри. Читаем только то, что нужно для одной таблицы
// значений: список листов, общие строки, стили (чтобы отличить даты от чисел) и
// ячейки листа. Распаковка — встроенным DecompressionStream('deflate-raw').
// Пишем шаблон без сжатия (method=store): проще, а файл всё равно крошечный.
//
// Наружу отдаём строки как массивы строк (как parseCsv): даты в виде
// YYYY-MM-DD, время — HH:MM:SS, числа — как напечатал бы JS.

// --- XML-помощники ----------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, code) => {
    if (code[0] === '#') {
      const num = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return String.fromCodePoint(num);
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

export function encodeXml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
}

function attr(tag, name) {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : null;
}

// Текст из всех <t>…</t> внутри фрагмента (rich text состоит из нескольких <r><t>).
function joinT(fragment) {
  let out = '';
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let m;
  while ((m = re.exec(fragment))) out += decodeXml(m[1]);
  return out;
}

// --- ZIP: чтение --------------------------------------------------------------

const textDecoder = new TextDecoder('utf-8');

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Список записей архива: имя → { offset данных, размер, метод }.
function readCentralDirectory(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Не zip-архив');
  const count = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  const entries = new Map();
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw new Error('Повреждён zip-архив');
    const method = view.getUint16(pos + 10, true);
    const compSize = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = textDecoder.decode(buf.subarray(pos + 46, pos + 46 + nameLen));
    entries.set(name, { method, compSize, localOffset });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readEntry(buf, entry) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const p = entry.localOffset;
  if (view.getUint32(p, true) !== 0x04034b50) throw new Error('Повреждён zip-архив');
  const nameLen = view.getUint16(p + 26, true);
  const extraLen = view.getUint16(p + 28, true);
  const start = p + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + entry.compSize);
  if (entry.method === 0) return textDecoder.decode(data);
  if (entry.method === 8) return textDecoder.decode(await inflateRaw(data));
  throw new Error('Неподдерживаемый метод сжатия zip');
}

// --- XLSX: чтение -------------------------------------------------------------

// Встроенные числовые форматы Excel, означающие дату/время.
const BUILTIN_DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const BUILTIN_TIME_ONLY_IDS = new Set([18, 19, 20, 21, 45, 46, 47]);

// Классификация формата ячейки: 'date' | 'time' | null.
function formatKind(numFmtId, customFormats) {
  if (BUILTIN_TIME_ONLY_IDS.has(numFmtId)) return 'time';
  if (BUILTIN_DATE_IDS.has(numFmtId)) return 'date';
  const code = customFormats.get(numFmtId);
  if (!code) return null;
  const bare = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  if (/[yd]/i.test(bare)) return 'date';
  if (/h/i.test(bare) && /[ms]/i.test(bare)) return 'time';
  return null;
}

// styles.xml → массив kind по индексу стиля (атрибут s ячейки).
function parseStyles(xml) {
  const customFormats = new Map();
  const numFmtRe = /<numFmt\b[^>]*\/>/g;
  let m;
  while ((m = numFmtRe.exec(xml || ''))) {
    customFormats.set(Number(attr(m[0], 'numFmtId')), attr(m[0], 'formatCode') || '');
  }
  const kinds = [];
  const xfsBlock = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml || '');
  if (xfsBlock) {
    const xfRe = /<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g;
    while ((m = xfRe.exec(xfsBlock[1]))) {
      kinds.push(formatKind(Number(attr(m[0], 'numFmtId') || 0), customFormats));
    }
  }
  return kinds;
}

function parseSharedStrings(xml) {
  const strings = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml || ''))) strings.push(joinT(m[1]));
  return strings;
}

const EXCEL_EPOCH_1900 = Date.UTC(1899, 11, 30);
const EXCEL_EPOCH_1904 = Date.UTC(1904, 0, 1);

function serialToDate(serial, date1904) {
  const ms = (date1904 ? EXCEL_EPOCH_1904 : EXCEL_EPOCH_1900) + Math.round(serial * 86400000);
  return new Date(ms);
}

const pad2 = (n) => String(n).padStart(2, '0');

function formatSerial(serial, kind, date1904) {
  const d = serialToDate(serial, date1904);
  if (kind === 'time') return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// "AB12" → индекс колонки (A=0).
function columnIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref || '');
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters[0]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function cellValue(tag, inner, ctx) {
  const type = attr(tag, 't');
  if (type === 'inlineStr') return joinT(inner);
  const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
  if (!v) return '';
  const raw = decodeXml(v[1]);
  if (type === 's') return ctx.sharedStrings[Number(raw)] ?? '';
  if (type === 'str' || type === 'e') return raw;
  if (type === 'b') return raw === '1' ? 'TRUE' : 'FALSE';
  const kind = ctx.styleKinds[Number(attr(tag, 's') || 0)];
  const num = Number(raw);
  if (kind && Number.isFinite(num)) return formatSerial(num, kind, ctx.date1904);
  return raw;
}

function parseSheet(xml, ctx) {
  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const row = [];
    let next = 0;
    let cm;
    while ((cm = cellRe.exec(rm[1]))) {
      const tag = `<c${cm[1]}>`;
      const col = columnIndex(attr(tag, 'r'));
      const idx = col >= 0 ? col : next;
      while (row.length < idx) row.push('');
      row[idx] = cellValue(tag, cm[2] || '', ctx);
      next = idx + 1;
    }
    rows.push(row);
  }
  return rows;
}

// Путь к XML листа: по имени (без учёта регистра) или первый лист книги.
function resolveSheetPath(workbookXml, relsXml, preferredName) {
  const sheets = [];
  const re = /<sheet\b[^>]*\/>/g;
  let m;
  while ((m = re.exec(workbookXml))) {
    sheets.push({ name: attr(m[0], 'name') || '', rid: attr(m[0], 'r:id') || attr(m[0], 'id') || '' });
  }
  if (!sheets.length) throw new Error('В книге нет листов');
  const wanted = preferredName ? sheets.find((s) => s.name.toLowerCase() === preferredName.toLowerCase()) : null;
  const sheet = wanted || sheets[0];
  const relRe = /<Relationship\b[^>]*\/>/g;
  while ((m = relRe.exec(relsXml))) {
    if (attr(m[0], 'Id') === sheet.rid) {
      const target = attr(m[0], 'Target') || '';
      return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    }
  }
  throw new Error('Не найден лист книги');
}

// Прочитать один лист .xlsx как массив строк-массивов строковых значений.
export async function readXlsxRows(arrayBuffer, preferredSheet = '') {
  const buf = new Uint8Array(arrayBuffer);
  const entries = readCentralDirectory(buf);
  const read = async (name) => {
    const entry = entries.get(name);
    return entry ? readEntry(buf, entry) : '';
  };
  const workbook = await read('xl/workbook.xml');
  if (!workbook) throw new Error('Не файл .xlsx');
  const sheetPath = resolveSheetPath(workbook, await read('xl/_rels/workbook.xml.rels'), preferredSheet);
  const ctx = {
    sharedStrings: parseSharedStrings(await read('xl/sharedStrings.xml')),
    styleKinds: parseStyles(await read('xl/styles.xml')),
    date1904: /<workbookPr\b[^>]*date1904="(1|true)"/.test(workbook),
  };
  return parseSheet(await read(sheetPath), ctx);
}

// --- ZIP: запись (без сжатия) -------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const textEncoder = new TextEncoder();

// files: [{ name, text }] → Uint8Array zip-архива (method=store).
function zipStore(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

  for (const f of files) {
    const name = textEncoder.encode(f.name);
    const data = textEncoder.encode(f.text);
    const crc = crc32(data);
    const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length)];
    const local = new Uint8Array([...u32(0x04034b50), ...common, ...u16(0), ...name]);
    parts.push(local, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name]));
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const total = offset + cdSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of [...parts, ...central, eocd]) { out.set(chunk, pos); pos += chunk.length; }
  return out;
}

// --- XLSX: запись -------------------------------------------------------------

function columnName(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// Ячейка: числа — числом, остальное — inline-строкой. style: 0 обычный, 1 жирный, 2 с переносом.
function cellXml(ref, value, style) {
  const s = style ? ` s="${style}"` : '';
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
  const text = String(value ?? '');
  if (text === '') return '';
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${encodeXml(text)}</t></is></c>`;
}

// sheet: { name, rows: any[][], widths?: number[], headerBold?: boolean, wrap?: boolean }
function sheetXml(sheet) {
  const cols = (sheet.widths || [])
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  const rows = sheet.rows.map((row, r) => {
    const cells = row.map((v, c) => {
      const style = sheet.headerBold && r === 0 ? 1 : sheet.wrap ? 2 : 0;
      return cellXml(`${columnName(c)}${r + 1}`, v, style);
    }).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData></worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// Собрать книгу из листов. Возвращает Blob для скачивания.
export function writeXlsx(sheets) {
  const sheetEntries = sheets.map((s, i) => ({ id: i + 1, name: s.name, xml: sheetXml(s) }));
  const files = [
    {
      name: '[Content_Types].xml',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheetEntries.map((s) => `<Override PartName="/xl/worksheets/sheet${s.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`,
    },
    {
      name: '_rels/.rels',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheetEntries.map((s) => `<sheet name="${encodeXml(s.name)}" sheetId="${s.id}" r:id="rId${s.id}"/>`).join('')}</sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheetEntries.map((s) => `<Relationship Id="rId${s.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.id}.xml"/>`).join('\n')}
<Relationship Id="rId${sheetEntries.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { name: 'xl/styles.xml', text: STYLES_XML },
    ...sheetEntries.map((s) => ({ name: `xl/worksheets/sheet${s.id}.xml`, text: s.xml })),
  ];
  return new Blob([zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
