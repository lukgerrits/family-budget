/* ==========================================================
   Family Budget – app.js
   Overview = KPIs + Graph only
   Income/Expenses tabs each have their own table
   Add / Edit / Delete transactions
   LocalStorage; Month picker; Today button
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
  transactions: []                            // { id, type: 'Income'|'Expense', date:'YYYY-MM-DD', category, amount, note }
};

let state = loadFromStorage();

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultState };
    const parsed = JSON.parse(raw);
    return {
      ...defaultState,
      ...parsed,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : []
    };
  } catch {
    return { ...defaultState };
  }
}

function saveToStorage() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.error('Storage error', e); }
}

/* ------------------ Month picker & Today button ------------------ */
const monthPicker = $('#monthPicker') || document.querySelector('input[type="month"]');
if (monthPicker) {
  monthPicker.value = state.selectedMonth;
  monthPicker.addEventListener('change', () => {
    state.selectedMonth = monthPicker.value || isoDate().slice(0, 7);
    saveToStorage();
    renderAll();
  });
}

const btnToday = $('#btnToday');
if (btnToday) {
  btnToday.addEventListener('click', () => {
    const dateInput = $('#txDate');
    if (dateInput) dateInput.value = isoDate(new Date());
  });
}

/* ------------------ Add / Edit / Delete ------------------ */
let editId = null; // null -> add mode

function enterEditMode(tx) {
  editId = tx.id;
  const f = {
    type:      $('#txType'),
    date:      $('#txDate'),
    category:  $('#txCategory'),
    amount:    $('#txAmount'),
    note:      $('#txNote')
  };
  if (f.type)     f.type.value = tx.type;
  if (f.date)     f.date.value = tx.date;
  if (f.category) f.category.value = tx.category;
  if (f.amount)   f.amount.value = String(tx.amount).replace('.', ','); // allow comma style
  if (f.note)     f.note.value = tx.note || '';

  const submit = $('#txSubmit'); if (submit) submit.textContent = 'Save';
  const clear  = $('#clearForm'); if (clear) clear.textContent = 'Cancel';

  // Optional: switch tab to the right form context
  if (typeof window.showFormTabForType === 'function') {
    window.showFormTabForType(tx.type);
  }
}

function exitEditMode() {
  editId = null;
  const submit = $('#txSubmit'); if (submit) submit.textContent = 'Add';
  const clear  = $('#clearForm'); if (clear) clear.textContent = 'Clear';
}

const form = $('#txForm');
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const f = {
      type:      $('#txType'),
      date:      $('#txDate'),
      category:  $('#txCategory'),
      amount:    $('#txAmount'),
      note:      $('#txNote')
    };

    const tx = {
      type: (f.type?.value || 'Expense'),
      date: (f.date?.value || isoDate()),
      category: (f.category?.value || ''),
      // support BE entry like 1.234,56 -> 1234.56
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

    form.reset?.();
    const dateEl = $('#txDate');
    if (dateEl) dateEl.value = isoDate(new Date());
  });

  const clearBtn = $('#clearForm');
  if (clearBtn) clearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (editId) exitEditMode();
    form.reset?.();
    const dateEl = $('#txDate');
    if (dateEl) dateEl.value = isoDate(new Date());
  });
}

/* ------------------ Overview KPIs & Graph ------------------ */
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

// Chart.js graph in Overview
function drawMonthlyGraph() {
  const canvas = $('#monthChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const ym = state.selectedMonth;
  const [y, m] = ym.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();

  const incomePerDay  = Array(daysInMonth).fill(0);
  const expensePerDay = Array(daysInMonth).fill(0);

  state.transactions.forEach(t => {
    if (!t.date || t.date.slice(0,7) !== ym) return;
    const d = new Date(t.date).getDate() - 1;
    if (t.type === 'Income') incomePerDay[d]  += Number(t.amount) || 0;
    else                     expensePerDay[d] += Number(t.amount) || 0;
  });

  // running balance
  const balance = [];
  let run = 0;
  for (let i=0;i<daysInMonth;i++){
    run += incomePerDay[i] - expensePerDay[i];
    balance.push(run);
  }

  const labels = Array.from({length:daysInMonth}, (_,i)=> String(i+1));
  const ctx = canvas.getContext('2d');

  if (!window.__budgetChart) {
    window.__budgetChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label:'Income',  data: incomePerDay,  backgroundColor:'rgba(16,152,69,0.45)', yAxisID:'y' },
          { label:'Expenses',data: expensePerDay, backgroundColor:'rgba(176,0,32,0.45)', yAxisID:'y' },
          { label:'Running Balance', data: balance, type:'line', borderColor:'#2563eb', fill:false, yAxisID:'y1' }
        ]
      },
      options: {
        responsive:true,
        scales: {
          y:  { beginAtZero:true, title:{display:true,text:'€ per day'} },
          y1: { position:'right', beginAtZero:true, grid:{drawOnChartArea:false}, title:{display:true,text:'€ balance'} }
        },
        plugins: { legend: { position:'top' } }
      }
    });
  } else {
    const c = window.__budgetChart;
    c.data.labels = labels;
    c.data.datasets[0].data = incomePerDay;
    c.data.datasets[1].data = expensePerDay;
    c.data.datasets[2].data = balance;
    c.update();
  }
}

/* ------------------ Tables per-tab ------------------ */
function rowHtml(tx) {
  return `
    <tr data-id="${tx.id}">
      <td>${escapeHtml(tx.date)}</td>
      <td>${escapeHtml(tx.category)}</td>
      <td class="right">${formatMoney(tx.amount)}</td>
      <td>${escapeHtml(tx.note)}</td>
      <td class="nowrap">
        <button class="small editTxn">Edit</button>
        <button class="small danger deleteTxn">Delete</button>
      </td>
    </tr>
  `;
}

function wireRowButtons(tbody) {
  if (!tbody) return;

  tbody.querySelectorAll('.editTxn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('tr')?.dataset.id;
      const tx = state.transactions.find(t => t.id === id);
      if (tx) enterEditMode(tx);
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

function renderIncomeTable() {
  const tbody = $('#incomeTbody');
  if (!tbody) return;

  const month = state.selectedMonth;
  const list = state.transactions.filter(
    t => (t.date || '').slice(0,7) === month && t.type === 'Income'
  );

  tbody.innerHTML = list.map(rowHtml).join('');
  wireRowButtons(tbody);

  const foot = $('#incomeTotal');
  if (foot) {
    const total = list.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    foot.textContent = formatMoney(total);
  }
}

function renderExpenseTable() {
  const tbody = $('#expenseTbody');
  if (!tbody) return;

  const month = state.selectedMonth;
  const list = state.transactions.filter(
    t => (t.date || '').slice(0,7) === month && t.type === 'Expense'
  );

  tbody.innerHTML = list.map(rowHtml).join('');
  wireRowButtons(tbody);

  const foot = $('#expenseTotal');
  if (foot) {
    const total = list.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    foot.textContent = formatMoney(total);
  }
}

/* ------------------ Global render ------------------ */
function renderAll() {
  renderSummary();      // Overview KPIs
  drawMonthlyGraph();   // Overview graph
  renderIncomeTable();  // Income tab list
  renderExpenseTable(); // Expenses tab list
}

// expose for debugging if needed
window.state = state;
window.renderAll = renderAll;

/* ------------------ Boot ------------------ */
document.addEventListener('DOMContentLoaded', () => {
  const dateEl = $('#txDate');
  if (dateEl && !dateEl.value) dateEl.value = isoDate();
  renderAll();
});
