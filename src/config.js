// Конфигурация приложения.
//
// GOOGLE_CLIENT_ID берётся из переменной окружения VITE_GOOGLE_CLIENT_ID
// (файл .env локально или secret в GitHub Actions при сборке).
// Если переменной нет — остаётся плейсхолдер, и приложение подскажет,
// что нужно настроить OAuth. Инструкция — в README.md.
export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

// drive.file — минимально необходимый scope: доступ только к файлам,
// которые создало само приложение. Полный доступ к Google Drive не запрашивается.
export const OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// Название создаваемой Google Таблицы.
export const SPREADSHEET_TITLE = 'FreeMoney — учёт денег';

// Ключи в localStorage.
export const LS_SPREADSHEET_ID = 'freemoney:spreadsheetId';
// Выбранный режим хранения: 'google' | 'local'.
export const LS_MODE = 'freemoney:mode';

// Признак, что Client ID не настроен (плейсхолдер).
export const IS_CLIENT_ID_CONFIGURED = !GOOGLE_CLIENT_ID.startsWith('YOUR_');
