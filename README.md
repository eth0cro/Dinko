# Dnevni unos proizvoda (Google Sheets)

Produkcijsko rješenje za mobilnu web aplikaciju za dnevni unos količina proizvoda i automatsko spremanje u postojeći Google Spreadsheet.

## Funkcionalnosti

- Mobilna forma bez login/PIN sustava
- Odabir poslovnice (tab/sheet)
- Prikaz današnjeg datuma
- Učitavanje proizvoda iz dva segmenta: `B6:B35` i `B38:B67` (s odjeljkom "Ostatak")
- Unos količina (brojevi >= 0, prazno = 0)
- Spremanje dnevnih unosa u stupac koji odgovara danu u mjesecu (`1 -> C`, `2 -> D`, ...)
- Overwrite postojećih dnevnih vrijednosti je dozvoljen
- Formula stupci (`Zaduženo`, `Vraćeno`, `Razlika`) ostaju netaknuti
- Bonus: export u Excel za period

---

## Struktura projekta

```text
/server
  index.js
  sheets.js
  routes.js
  package.json
  .env.example

/public
  index.html
  style.css
  app.js
```

---

## API endpointi

- `GET /api/branches` → lista poslovnica (sheet tabovi)
- `GET /api/products?branch=Ćiro` → proizvodi iz `B6:B35` i `B38:B67`
- `POST /api/submit` → upis dnevnih količina u odgovarajući stupac dana
- `GET /api/export?branch=Ćiro&from=YYYY-MM-DD&to=YYYY-MM-DD` → preuzimanje `.xlsx` izvještaja
- `GET /health` → health-check

### Primjer `POST /api/submit`

```json
{
  "branch": "Ćiro",
  "date": "2026-03-01",
  "entries": [
    { "productIndex": 0, "quantity": 7 },
    { "productIndex": 1, "quantity": 5 }
  ]
}
```

---

## 1) Google Cloud + Service Account setup

1. Otvorite **Google Cloud Console**.
2. Kreirajte novi projekt (ili odaberite postojeći).
3. Uključite API: **Google Sheets API**.
4. Idite na **IAM & Admin > Service Accounts**.
5. Kreirajte Service Account (npr. `sheets-writer`).
6. Uđite u **Keys > Add Key > Create new key > JSON** i preuzmite key.
7. Iz JSON datoteke uzmite:
   - `client_email`
   - `private_key`

---

## 2) Dodavanje Service Accounta kao Editor na Sheet

1. Otvorite ciljani Google Spreadsheet.
2. Kliknite **Share**.
3. Dodajte `client_email` Service Accounta kao korisnika.
4. Dodijelite rolu **Editor**.

Bez ovog koraka API neće moći čitati/pisati podatke.

---

## 3) Lokalno pokretanje

```bash
cd /workspace/Dinko/server
npm install
cp .env.example .env
```

U `.env` upišite stvarne vrijednosti:

```env
PORT=3000
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project-id.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
SHEET_ID=your_google_sheet_id
```

Pokretanje:

```bash
npm start
```

Aplikacija je dostupna na:

- `http://localhost:3000`

---

## 4) Deploy na Ubuntu server

### 4.1 Instalacija Node.js (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

### 4.2 Deploy aplikacije

```bash
sudo mkdir -p /var/www/dinko
sudo chown -R $USER:$USER /var/www/dinko
cd /var/www/dinko
# git clone <repo_url> .
cd server
npm ci --omit=dev
cp .env.example .env
nano .env
```

### 4.3 Pokretanje s PM2

```bash
sudo npm install -g pm2
cd /var/www/dinko/server
pm2 start index.js --name dinko-app
pm2 save
pm2 startup
```

Korisne PM2 naredbe:

```bash
pm2 status
pm2 logs dinko-app
pm2 restart dinko-app
```

---

## 5) Nginx reverse proxy (preporučeno)

Primjer konfiguracije `/etc/nginx/sites-available/dinko`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Aktivacija:

```bash
sudo ln -s /etc/nginx/sites-available/dinko /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Napomena o formulama

Backend zapisuje isključivo u dnevne stupce za retke proizvoda `6-35` i `38-67`.

Nema izmjena formula ni pomoćnih stupaca (`Zaduženo`, `Vraćeno`, `Razlika`).
