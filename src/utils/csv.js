// Простые кодек CSV (RFC 4180): экранирование кавычек, запятых, переводов строк.

export function toCsv(rows) {
  return rows.map((row) => row.map(escapeField).join(',')).join('\r\n');
}

function escapeField(value) {
  const str = value == null ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Разбор CSV в массив строк (массив массивов). Поддерживает кавычки и
// многострочные поля. Разделитель полей — запятая по умолчанию; для файлов из
// Excel с региональными настройками можно передать `;` или `\t`.
export function parseCsv(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
    } else if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
      i += 1;
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  // Последнее поле/строка, если файл не заканчивается переводом строки.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Метка локальной даты и времени для имени файла: YYYY-MM-DD_HH-MM-SS.
function fileTimestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const time = `${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  return `${date}_${time}`;
}

// Вставляет метку даты-времени перед расширением: name.ext → name-YYYY-MM-DD_HH-MM-SS.ext.
function withTimestamp(filename) {
  const dot = filename.lastIndexOf('.');
  const ts = fileTimestamp();
  if (dot <= 0) return `${filename}-${ts}`;
  return `${filename.slice(0, dot)}-${ts}${filename.slice(dot)}`;
}

// Угадать разделитель полей по первой строке: берём тот из `,` `;` `\t`,
// который встречается чаще всего.
export function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  let best = ',';
  let bestCount = -1;
  for (const d of [',', ';', '\t']) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}

// Скачать текст как файл. В имя добавляется метка даты и времени экспорта.
export function downloadFile(filename, text, mime = 'text/csv;charset=utf-8') {
  downloadBlob(filename, new Blob(['﻿', text], { type: mime })); // BOM для Excel
}

// Скачать готовый Blob (бинарные файлы, напр. .xlsx). Имя — с меткой времени.
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = withTimestamp(filename);
  a.click();
  URL.revokeObjectURL(url);
}
