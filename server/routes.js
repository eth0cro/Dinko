const express = require('express');
const ExcelJS = require('exceljs');
const {
  PRODUCTS_COUNT,
  getBranches,
  getProducts,
  submitDailyEntries,
  getDailyValues
} = require('./sheets');

const router = express.Router();

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new Error('entries mora biti polje.');
  }

  return entries.map((entry) => ({
    productIndex: Number(entry.productIndex),
    quantity: entry.quantity === '' || entry.quantity === null || entry.quantity === undefined
      ? 0
      : Number(entry.quantity)
  }));
}

router.get('/branches', async (req, res, next) => {
  try {
    const branches = await getBranches();
    res.json({ branches });
  } catch (error) {
    next(error);
  }
});

router.get('/products', async (req, res, next) => {
  try {
    const branch = req.query.branch;

    if (!branch) {
      return res.status(400).json({ error: 'Nedostaje query parametar branch.' });
    }

    const products = await getProducts(branch);
    res.json({ branch, products });
  } catch (error) {
    next(error);
  }
});

router.post('/submit', async (req, res, next) => {
  try {
    const { branch, date, entries } = req.body;

    if (!branch || !date) {
      return res.status(400).json({ error: 'Obavezna polja su branch i date.' });
    }

    if (!isIsoDate(date)) {
      return res.status(400).json({ error: 'date mora biti u formatu YYYY-MM-DD.' });
    }

    const normalizedEntries = normalizeEntries(entries);

    for (const entry of normalizedEntries) {
      if (!Number.isInteger(entry.productIndex) || entry.productIndex < 0 || entry.productIndex >= PRODUCTS_COUNT) {
        return res.status(400).json({ error: 'productIndex mora biti cijeli broj unutar raspona dostupnih proizvoda.' });
      }

      if (!Number.isFinite(entry.quantity) || entry.quantity < 0) {
        return res.status(400).json({ error: 'quantity mora biti broj veći ili jednak 0.' });
      }
    }

    const result = await submitDailyEntries({
      branch,
      date,
      entries: normalizedEntries
    });

    res.json({
      success: true,
      message: 'Podaci uspješno spremljeni',
      result
    });
  } catch (error) {
    next(error);
  }
});

router.get('/export', async (req, res, next) => {
  try {
    const { branch, from, to } = req.query;

    if (!branch || !from || !to) {
      return res.status(400).json({ error: 'Obavezni parametri su branch, from i to.' });
    }

    if (!isIsoDate(from) || !isIsoDate(to)) {
      return res.status(400).json({ error: 'from i to moraju biti u formatu YYYY-MM-DD.' });
    }

    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return res.status(400).json({ error: 'Neispravan raspon datuma.' });
    }

    const products = await getProducts(branch);

    const dates = [];
    const current = new Date(start);

    while (current <= end) {
      dates.push(current.toISOString().slice(0, 10));
      current.setDate(current.getDate() + 1);
    }

    const dailyValuesByDate = [];
    for (const date of dates) {
      const values = await getDailyValues(branch, date);
      dailyValuesByDate.push({ date, values });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(branch);

    sheet.columns = [
      { header: 'Proizvod', key: 'product', width: 32 },
      ...dates.map((date) => ({ header: date, key: date, width: 14 })),
      { header: 'Ukupno', key: 'total', width: 14 }
    ];

    for (let i = 0; i < products.length; i += 1) {
      const row = {
        product: products[i].name || `Proizvod ${i + 1}`,
        total: 0
      };

      for (const dayData of dailyValuesByDate) {
        const quantity = dayData.values[i] || 0;
        row[dayData.date] = quantity;
        row.total += quantity;
      }

      sheet.addRow(row);
    }

    sheet.getRow(1).font = { bold: true };

    const fileName = `export-${branch}-${from}-${to}.xlsx`.replace(/\s+/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
