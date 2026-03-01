const { google } = require('googleapis');

const PRODUCT_RANGE_START_ROW = 5;
const PRODUCT_RANGE_END_ROW = 67;
const PRODUCTS_COUNT = PRODUCT_RANGE_END_ROW - PRODUCT_RANGE_START_ROW + 1;

function columnNumberToLetter(columnNumber) {
  let temp = columnNumber;
  let letter = '';

  while (temp > 0) {
    const remainder = (temp - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    temp = Math.floor((temp - remainder) / 26);
  }

  return letter;
}

function dayToColumn(day) {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error('Neispravan dan u mjesecu. Dozvoljen raspon je 1-31.');
  }

  const columnNumber = day + 1;
  return columnNumberToLetter(columnNumber);
}

function formatBranchRange(branch, range) {
  return `'${String(branch).replace(/'/g, "''")}'!${range}`;
}

function normalizePrivateKey(privateKey) {
  return privateKey.replace(/\\n/g, '\n');
}

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !privateKey || !process.env.SHEET_ID) {
    throw new Error('Nedostaju GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY ili SHEET_ID varijable.');
  }

  const auth = new google.auth.JWT({
    email,
    key: normalizePrivateKey(privateKey),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  return google.sheets({ version: 'v4', auth });
}

async function getSpreadsheetMetadata() {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.get({
    spreadsheetId: process.env.SHEET_ID,
    fields: 'sheets.properties'
  });

  return response.data;
}

async function getBranches() {
  const metadata = await getSpreadsheetMetadata();

  return (metadata.sheets || [])
    .map((sheet) => sheet.properties && sheet.properties.title)
    .filter(Boolean);
}

async function getProducts(branch) {
  const sheets = getSheetsClient();
  const range = formatBranchRange(branch, `A${PRODUCT_RANGE_START_ROW}:A${PRODUCT_RANGE_END_ROW}`);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range
  });

  const values = response.data.values || [];

  return Array.from({ length: PRODUCTS_COUNT }, (_, index) => {
    const row = values[index] || [];
    const productName = (row[0] || '').trim();

    return {
      productIndex: index,
      name: productName
    };
  });
}

function buildColumnValues(entriesMap) {
  return Array.from({ length: PRODUCTS_COUNT }, (_, index) => {
    const quantity = entriesMap.get(index) ?? 0;
    return [quantity];
  });
}

async function submitDailyEntries({ branch, date, entries }) {
  const parsedDate = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('Neispravan format datuma. Očekuje se YYYY-MM-DD.');
  }

  const day = parsedDate.getDate();
  const column = dayToColumn(day);

  const entriesMap = new Map();

  for (const entry of entries) {
    const index = Number(entry.productIndex);
    const quantity = Number(entry.quantity);

    if (!Number.isInteger(index) || index < 0 || index >= PRODUCTS_COUNT) {
      continue;
    }

    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new Error('Količina mora biti broj veći ili jednak nuli.');
    }

    entriesMap.set(index, quantity);
  }

  const values = buildColumnValues(entriesMap);
  const range = formatBranchRange(branch, `${column}${PRODUCT_RANGE_START_ROW}:${column}${PRODUCT_RANGE_END_ROW}`);

  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values }
  });

  return {
    branch,
    date,
    day,
    column,
    updatedRange: range,
    rowsUpdated: values.length
  };
}

async function getDailyValues(branch, date) {
  const parsedDate = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('Neispravan format datuma. Očekuje se YYYY-MM-DD.');
  }

  const day = parsedDate.getDate();
  const column = dayToColumn(day);
  const range = formatBranchRange(branch, `${column}${PRODUCT_RANGE_START_ROW}:${column}${PRODUCT_RANGE_END_ROW}`);

  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range
  });

  const values = response.data.values || [];

  return Array.from({ length: PRODUCTS_COUNT }, (_, index) => {
    const cell = values[index] || [];
    const rawValue = cell[0];
    const numeric = Number(rawValue);
    return Number.isFinite(numeric) ? numeric : 0;
  });
}

module.exports = {
  PRODUCT_RANGE_START_ROW,
  PRODUCT_RANGE_END_ROW,
  PRODUCTS_COUNT,
  dayToColumn,
  getBranches,
  getProducts,
  submitDailyEntries,
  getDailyValues
};
