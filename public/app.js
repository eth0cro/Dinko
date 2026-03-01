const branchSelect = document.getElementById('branchSelect');
const productsList = document.getElementById('productsList');
const currentDate = document.getElementById('currentDate');
const saveButton = document.getElementById('saveButton');
const statusMessage = document.getElementById('statusMessage');

let products = [];

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateDisplay(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}.`;
}

function setStatus(message, type = 'ok') {
  statusMessage.textContent = message;
  statusMessage.classList.remove('status-message--ok', 'status-message--error');
  statusMessage.classList.add(type === 'error' ? 'status-message--error' : 'status-message--ok');
}

function createProductRow(product) {
  const row = document.createElement('label');
  row.className = 'product-row';

  const name = document.createElement('span');
  name.className = 'product-name';
  name.textContent = product.name || `Proizvod ${product.productIndex + 1}`;

  const input = document.createElement('input');
  input.className = 'qty-input';
  input.type = 'number';
  input.min = '0';
  input.step = '1';
  input.inputMode = 'numeric';
  input.value = '0';
  input.dataset.productIndex = String(product.productIndex);

  input.addEventListener('input', () => {
    if (input.value === '') {
      return;
    }

    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 0) {
      input.value = '0';
    }
  });

  row.append(name, input);
  return row;
}

function renderProducts(items) {
  productsList.innerHTML = '';
  items.forEach((product) => productsList.appendChild(createProductRow(product)));
}

async function fetchBranches() {
  const response = await fetch('/api/branches');
  if (!response.ok) {
    throw new Error('Neuspješno dohvaćanje poslovnica.');
  }

  const data = await response.json();
  return data.branches || [];
}

async function fetchProducts(branch) {
  const response = await fetch(`/api/products?branch=${encodeURIComponent(branch)}`);
  if (!response.ok) {
    throw new Error('Neuspješno dohvaćanje proizvoda.');
  }

  const data = await response.json();
  return data.products || [];
}

async function loadProductsForSelectedBranch() {
  const branch = branchSelect.value;
  if (!branch) {
    products = [];
    renderProducts(products);
    return;
  }

  saveButton.disabled = true;
  setStatus('Učitavanje proizvoda...', 'ok');

  try {
    products = await fetchProducts(branch);
    renderProducts(products);
    setStatus('Proizvodi učitani.', 'ok');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    saveButton.disabled = false;
  }
}

function collectEntries() {
  const inputs = productsList.querySelectorAll('input.qty-input');

  return Array.from(inputs).map((input) => {
    const raw = input.value.trim();
    const quantity = raw === '' ? 0 : Number(raw);

    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new Error('Sve količine moraju biti brojevi veći ili jednaki 0.');
    }

    return {
      productIndex: Number(input.dataset.productIndex),
      quantity
    };
  });
}

async function submitEntries() {
  const branch = branchSelect.value;

  if (!branch) {
    setStatus('Odaberite poslovnicu.', 'error');
    return;
  }

  let entries;

  try {
    entries = collectEntries();
  } catch (error) {
    setStatus(error.message, 'error');
    return;
  }

  saveButton.disabled = true;
  setStatus('Spremanje podataka...', 'ok');

  try {
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        branch,
        date: todayIso(),
        entries
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Neuspješno spremanje podataka.');
    }

    setStatus(data.message || 'Podaci uspješno spremljeni', 'ok');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    saveButton.disabled = false;
  }
}

async function init() {
  const today = todayIso();
  currentDate.textContent = `Datum: ${formatDateDisplay(today)}`;

  saveButton.addEventListener('click', submitEntries);
  branchSelect.addEventListener('change', loadProductsForSelectedBranch);

  try {
    const branches = await fetchBranches();

    if (!branches.length) {
      setStatus('Nisu pronađene poslovnice.', 'error');
      return;
    }

    branchSelect.innerHTML = branches
      .map((branch) => `<option value="${branch}">${branch}</option>`)
      .join('');

    await loadProductsForSelectedBranch();
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

init();
