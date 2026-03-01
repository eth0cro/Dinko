const { google } = require('googleapis');

const PRODUCT_COLUMN = 'B';
const FIRST_DAILY_COLUMN_NUMBER = 3; // C

const PRODUCT_SEGMENTS = [
  { startRow: 6, endRow: 35, label: null },
  { startRow: 38, endRow: 67, label: 'Ostatak' }
];

const PRODUCT_ROWS = PRODUCT_SEGMENTS.flatMap((segment) => {
  const rows = [];
  for (let row = segment.startRow; row <= segment.endRow; row += 1) {
    rows.push(row);
  }
  return rows;
});

const PRODUCTS_COUNT = PRODUCT_ROWS.length;

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

  const columnNumber = FIRST_DAILY_COLUMN_NUMBER + (day - 1);
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

  const ranges = PRODUCT_SEGMENTS.map((segment) =>
    formatBranchRange(branch, `${PRODUCT_COLUMN}${segment.startRow}:${PRODUCT_COLUMN}${segment.endRow}`)
  );

  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: process.env.SHEET_ID,
    ranges
  });

  const valuesByRange = response.data.valueRanges || [];
  const products = [];

  PRODUCT_SEGMENTS.forEach((segment, segmentIndex) => {
    const values = (valuesByRange[segmentIndex] && valuesByRange[segmentIndex].values) || [];

    for (let i = 0; i <= segment.endRow - segment.startRow; i += 1) {
      const rowNumber = segment.startRow + i;
      const productName = ((values[i] && values[i][0]) || '').trim();

      products.push({
        productIndex: products.length,
        name: productName,
        rowNumber,
        segmentLabel: segment.label
      });
    }
  });

  return products;
}

function buildUpdateSegments(branch, column, entriesMap) {
  return PRODUCT_SEGMENTS.map((segment) => {
    const values = [];

    for (let row = segment.startRow; row <= segment.endRow; row += 1) {
      const productListIndex = PRODUCT_ROWS.indexOf(row);
      const quantity = entriesMap.get(productListIndex) ?? 0;
      values.push([quantity]);
    }

    return {
      range: formatBranchRange(branch, `${column}${segment.startRow}:${column}${segment.endRow}`),
      values
    };
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

  const data = buildUpdateSegments(branch, column, entriesMap);
  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.SHEET_ID,
    requestBody: {
      valueInputOption: 'RAW',
      data
    }
  });

  return {
    branch,
    date,
    day,
    column,
    updatedRanges: data.map((item) => item.range),
    rowsUpdated: PRODUCTS_COUNT
  };
}

async function getDailyValues(branch, date) {
  const parsedDate = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('Neispravan format datuma. Očekuje se YYYY-MM-DD.');
  }

  const day = parsedDate.getDate();
  const column = dayToColumn(day);
  const sheets = getSheetsClient();

  const ranges = PRODUCT_SEGMENTS.map((segment) =>
    formatBranchRange(branch, `${column}${segment.startRow}:${column}${segment.endRow}`)
  );

  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: process.env.SHEET_ID,
    ranges
  });

  const valuesByRange = response.data.valueRanges || [];
  const quantities = [];

  PRODUCT_SEGMENTS.forEach((segment, segmentIndex) => {
    const values = (valuesByRange[segmentIndex] && valuesByRange[segmentIndex].values) || [];

    for (let i = 0; i <= segment.endRow - segment.startRow; i += 1) {
      const rawValue = (values[i] && values[i][0]) || 0;
      const numeric = Number(rawValue);
      quantities.push(Number.isFinite(numeric) ? numeric : 0);
    }
  });

  return quantities;
}

module.exports = {
  PRODUCT_SEGMENTS,
  PRODUCT_ROWS,
  PRODUCTS_COUNT,
  dayToColumn,
  getBranches,
  getProducts,
  submitDailyEntries,
  getDailyValues
};
