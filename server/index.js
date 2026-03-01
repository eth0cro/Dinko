require('dotenv').config();

const path = require('path');
const express = require('express');
const morgan = require('morgan');
const routes = require('./routes');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({
    error: 'Dogodila se greška na serveru.',
    details: error.message
  });
});

app.listen(port, () => {
  console.log(`Server pokrenut na portu ${port}`);
});
