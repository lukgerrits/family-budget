/* ==========================================================
   Family Budget – full app.js
   - LocalStorage state
   - Month selection
   - Add / Edit / Delete transactions
   - Optional “Today” button
   - Transactions table rendering
   - Hooks to existing render/graph if present
   ----------------------------------------------------------
   Safe-by-default: all DOM lookups are optional.
   ========================================================== */

/* ------------------ Utilities ------------------ */
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function isoDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatMoney(n) {
  const val = Number(n || 0);
  return val.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR' });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (m) => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]
  ));
}

/* ------------------ State & Storage ------------------ */
const STORAGE_KEY = 'family-budget/v1';

const defaultState = {
  selectedMonth: isoDate().slice(0, 7),       // YYYY-MM
  categories: {
    Income:  ['Salary', 'Bonus'],
    Expense: ['Groceries', 'Restaurants', 'Transport']
  },
  transactions: []                            // { id, type, date, category, amount, note }
};

let state = loadFromStorage();

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultState };
    const parsed = JSON.parse(raw);

    // simple merge to keep forward compatibility
    return {
      ...defaultState,
      ...parsed,
      categories: {
        ...defaultState.categories,
        ...(parsed.categories || {})
      },
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : []
    };
  } catch {
    return { ...defaultState };
  }
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Storage error', e);
  }
}

/* ------------------ Selected Month ------------------ */
const monthPicker =
  $('#monthPicker') || $('#month') || document.querySelector('input[type="month"]');

if (monthPicker) {
  // initialize
  monthPicker.value = state.selectedMonth;
  monthPicker.addEventListener('change', () => {
    state.selectedMonth = monthPicker.value || isoDate().slice(0, 7);
    saveToStorage();
    renderAll();
  });
}

/* ------------------ Today Button (optional) ------------------ */
const btnToday = $('#btnToday') || $('#todayBtn') || $('#resetMonthBtn');
if (btnToday) {
  const dateInput = $('#txDate') || $('#date') || $('#dtDate');
  btnToday.addEventListener('click', () => {
    if (dateInput) dateInput.value = isoDate(new Date());
  });
}

/* ------------------ Edit / Delete handling ------------------ */
let editId = null; // null -> add mode

function enterEditMode(tx) {
  editId = tx.id;
  const f = {
    type:      $('#txType')      || $('#type'),
    date:      $('#txDate')      || $('#date'),
    category:  $('#txCategory')  || $('#category'),
    amount:    $('#txAmount')    || $('#amount'),
    note:      $('#txNote')      || $('#note')
  };
  if (f.type)     f.type.value = tx.type;
  if (f.date)     f.date.value = tx.date;
  if (f.category) f.category.value = tx.category;
  if (f.amount)   f.amount.value = String(tx.amount).replace('.', ','); // support BE input style
  if (f.note)     f.note.value = tx.note || '';

  const submit = $('#txSubmit') || $('#addBtn') || $('#submitBtn');
  if (submit) submit.textContent = 'Save';
  const clear  = $('#clearForm') || $('#btnClear');
  if (clear) clear.textContent = 'Cancel';
}

function exitEditMode() {
  editId = null;
  const submit = $('#txSubmit') || $('#addBtn') || $('#submitBtn');
  if (submit) submit.textContent = 'Add';
  const clear  = $('#clearForm') || $('#btnClear');
  if (clear) clear.textContent = 'Clear';
}

/* ------------------ Add / Save form ------------------ */
const form = $('#txForm') || $('#formTx') || $('#tx-form');
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const f = {
      type:      $('#txType')      || $('#type'),
      date:      $('#txDate')      || $('#date'),
      category:  $('#txCategory')  || $('#category'),
      amount:    $('#txAmount')    || $('#amount'),
      note:      $('#txNote')      || $('#note')
    };

    const tx = {
      type: (f.type?.value || 'Expense'),
      date: (f.date?.value || isoDate()),
      category: (f.category?.value || ''),
      // accept BE-style comma or dot, also allow thousand dots
      amount: Number(String(f.amount?.value || '0').replace(/\./g, '').replace(',', '.')),
      note: (f.note?.value || '')
    };

    if (!tx.date) { alert('Pick a date'); return; }
    if (isNaN(tx.amount)) { alert('Enter a valid amount'); return; }

    if (editId) {
      const i = state.transactions.findIndex(t => t.id === editId);
      if (i >= 0) state.transactions[i] = { ...state.transactions[i], ...tx };
      exitEditMode();
    } else {
      state.transactions.push({ id: uid(), ...tx });
    }

    saveToStorage();
    renderAll();

    // reset form
    form.reset?.();
    const dateEl = $('#txDate') || $('#date');
    if (dateEl) dateEl.value = isoDate(new Date());
  });

  // Clear/Cancel button (if present)
  const clearBtn = $('#clearForm') || $('#btnClear');
  if (clearBtn) clearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (editId) exitEditMode();
    form.reset?.();
    const dateEl = $('#txDate') || $('#date');
    if (dateEl) dateEl.value = isoDate(new Date());
  });
}

/* ------------------ Transactions table rendering ------------------ */
function renderTxTable() {
  const tbody = $('#txTbody');
  if (!tbody) return;

  const month = state.selectedMonth; // YYYY-MM
  const rows = state.transactions.filter(t => (t.date || '').slice(0, 7) === month);

  tbody.innerHTML = rows.map(tx => `
    <tr data-id="${tx.id}">
      <td>${escapeHtml(tx.date)}</td>
      <td>${escapeHtml(tx.type)}</td>
      <td>${escapeHtml(tx.category)}</td>
      <td class="right">${formatMoney(tx.amount)}</td>
      <td>${escapeHtml(tx.note)}</td>
      <td>
        <button class="small editTxn">Edit</button>
        <button class="small danger deleteTxn">Delete</button>
      </td>
    </tr>
  `).join('');

  // wire buttons
  tbody.querySelectorAll('.editTxn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('tr')?.dataset.id;
      const tx = state.transactions.find(t => t.id === id);
      if (tx) enterEditMode(tx);

      // If you have tabs per type, you can reveal the proper tab here:
      // showFormTabForType(tx?.type || 'Expense');  // no-op if not defined
      if (typeof window.showFormTabForType === 'function') {
        window.showFormTabForType(tx?.type || 'Expense');
      }
    });
  });

  tbody.querySelectorAll('.deleteTxn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('tr')?.dataset.id;
      const tx = state.transactions.find(t => t.id === id);
      if (!tx) return;

      if (confirm(`Delete ${tx.type.toLowerCase()} "${tx.category}" of ${formatMoney(tx.amount)} on ${tx.date}?`)) {
        state.transactions = state.transactions.filter(t => t.id !== id);
        saveToStorage();
        renderAll();
      }
    });
  });
}

/* ------------------ Summary & Graph (optional hooks) ------------------ */
function computeMonthTotals() {
  const month = state.selectedMonth;
  let income = 0, expense = 0;

  state.transactions.forEach(t => {
    if ((t.date || '').slice(0, 7) !== month) return;
    const amt = Number(t.amount) || 0;
    if (t.type === 'Income') income += amt; else expense += amt;
  });

  return { income, expense, balance: income - expense };
}

function renderSummary() {
  const { income, expense, balance } = computeMonthTotals();
  const elIncome  = $('#sumIncome');
  const elExpense = $('#sumExpense');
  const elBalance = $('#sumBalance');
  if (elIncome)  elIncome.textContent  = formatMoney(income);
  if (elExpense) elExpense.textContent = formatMoney(expense);
  if (elBalance) elBalance.textContent = formatMoney(balance);
}

// If you already have a chart function, we call it; else we no-op
function renderGraph() {
  if (typeof window.drawMonthlyGraph === 'function') {
    window.drawMonthlyGraph(state);
  }
}

/* ------------------ Global render cycle ------------------ */
function renderAll() {
  renderSummary();
  renderTxTable();
  renderGraph();
}

// Expose if other scripts need it
window.renderAll = renderAll;
window.state = state; // dev convenience

/* ------------------ Initial boot ------------------ */
document.addEventListener('DOMContentLoaded', () => {
  // Ensure date field defaults to today if present
  const dateEl = $('#txDate') || $('#date');
  if (dateEl && !dateEl.value) dateEl.value = isoDate();
  renderAll();
});
