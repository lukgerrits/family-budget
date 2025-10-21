/* =========================================================
   Family Budget — app.js (clean full version)
   - Overview: stats + Chart.js graph
   - Income/Expenses: category chips + +New, form, table (edit/delete)
   - Month filter via #monthPicker if present (else current month)
   - Data persisted in localStorage
   ========================================================= */

/////////////////////////////
// Utilities & formatting  //
/////////////////////////////
const $      = (s) => document.querySelector(s);
const $$     = (s) => Array.from(document.querySelectorAll(s));
const NOW    = new Date();
const EUR    = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' });

function fmtMoney(n) {
  const num = Number(n) || 0;
  return EUR.format(num);
}
function parseMoneyInput(str) {
  // Accepts both "1.234,56" and "1234.56" and "1234"
  if (!str) return 0;
  let s = String(str).trim();
  // Remove spaces
  s = s.replace(/\s+/g, '');
  // If comma is decimal separator, convert
  const hasComma = s.includes(',');
  const hasDot   = s.includes('.');
  if (hasComma && hasDot) {
    // "1.234,56" -> remove thousands dot, replace comma with dot
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // "1234,56" -> replace comma with dot
    s = s.replace(',', '.');
  }
  const val = parseFloat(s);
  return isNaN(val) ? 0 : val;
}
function isoMonth(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function daysInMonth(y, m /*0..11*/) {
  return new Date(y, m+1, 0).getDate();
}
function toISODateString(d) {
  if (typeof d === 'string') return d;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function sameMonth(isoDate, isoMonthStr) {
  // isoDate: YYYY-MM-DD ; isoMonthStr: YYYY-MM
  return isoDate.slice(0,7) === isoMonthStr;
}

/////////////////////////////////////
// State (localStorage) management //
/////////////////////////////////////
const STORAGE_KEY = 'family-budget/v2';

const defaultState = () => ({
  selectedMonth: isoMonth(NOW),
  categories: {
    Income:  ['Salary'],
    Expense: ['Groceries', 'Rent', 'Utilities']
  },
  transactions: [] // {id, type, date:'YYYY-MM-DD', category, amount:Number, note}
});

function loadState() {
  const raw  = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState();
  try {
    const s = JSON.parse(raw);
    // Light validation
    s.selectedMonth ??= isoMonth(NOW);
    s.categories ??= { Income:[], Expense:[] };
    s.categories.Income  ??= [];
    s.categories.Expense ??= [];
    s.transactions ??= [];
    return s;
  } catch {
    return defaultState();
  }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();
let editingId = null;          // transaction id being edited
let activeTab = 'overview';    // overview | income | expenses
let selectedCategory = null;   // controlled by chips
let monthInputEl = null;       // optional #monthPicker

/////////////////////////////
// DOM element references  //
/////////////////////////////
const el = {
  // overview
  sumIncome:   $('#sumIncome'),
  sumExpense:  $('#sumExpense'),
  sumBalance:  $('#sumBalance'),
  chartCanvas: $('#monthChart'),

  // income tab
  incomeTbody:  $('#incomeTbody'),
  incomeTotal:  $('#incomeTotal'),
  incomeCatBar: $('#incomeCatBar'),

  // expenses tab
  expenseTbody:  $('#expenseTbody'),
  expenseTotal:  $('#expenseTotal'),
  expenseCatBar: $('#expenseCatBar'),

  // form (shared)
  form:      $('#txForm'),
  date:      $('#txDate'),
  amount:    $('#txAmount'),
  note:      $('#txNote'),
  submitBtn: $('#txSubmit'),
  clearBtn:  $('#clearForm'),

  // category display (the small label under "Category")
  // In your HTML this is the element right after "Category" label (a dash initially)
  categoryDisplay: null
};

function bindCategoryDisplay() {
  // Try to find the <label for="txCategory">... then next sibling element
  // or fallback to the element that shows the chosen category (a <div> or <span> with a dash initially).
  // In your markup you had a dash "—". We’ll just pick the first element after the "Category" label row.
  // Safer approach: add an id="txCategoryDisplay" to the HTML and query it here.
  const maybe = document.getElementById('txCategoryDisplay');
  if (maybe) {
    el.categoryDisplay = maybe;
    return;
  }
  // fallback: find row that contains label "Category"
  const labels = $$('form#txForm label');
  const catLabel = labels.find(l => /category/i.test(l.textContent));
  if (catLabel) {
    // Next sibling in the same row (grid)
    const row = catLabel.closest('.row');
    if (row) {
      el.categoryDisplay = row.querySelector('div,span,p') || row.children[1];
    }
  }
}

bindCategoryDisplay();

/////////////////////////////
// Tabs + month handling   //
/////////////////////////////
function setActiveTab(name) {
  activeTab = name;
  $$('.tabpanel').forEach(p => p.classList.remove('active'));
  $(`section#tab-${name}`)?.classList.add('active');

  $$('.tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));

  // When switching tabs, reset edit mode, reset category highlight
  editingId = null;
  selectedCategory = null;
  if (el.categoryDisplay) el.categoryDisplay.textContent = '—';
  render();
}

function initMonthControl() {
  monthInputEl = $('#monthPicker'); // may not exist (overview-only UIs)
  if (monthInputEl) {
    // ensure value is ISO month
    monthInputEl.value = state.selectedMonth;
    monthInputEl.addEventListener('change', () => {
      state.selectedMonth = monthInputEl.value || isoMonth(NOW);
      saveState();
      render();
    });
  } else {
    // no control -> keep state.selectedMonth as current month
    state.selectedMonth ||= isoMonth(NOW);
  }
}

/////////////////////////////
// Category chips bar      //
/////////////////////////////
function renderCategoryBar(type /* 'Income' | 'Expense' */) {
  const holder = type === 'Income' ? el.incomeCatBar : el.expenseCatBar;
  if (!holder) return;

  holder.innerHTML = '';
  holder.classList.add('catbar');

  const cats = state.categories[type];
  cats.forEach(name => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = name;
    btn.addEventListener('click', () => {
      selectedCategory = name;
      if (el.categoryDisplay) el.categoryDisplay.textContent = name;
      // focus date/amount for speed
      if (el.date && !el.date.value) el.date.focus();
      else el.amount?.focus();
    });
    holder.appendChild(btn);
  });

  // + New button
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'chip new';
  addBtn.textContent = '+ New';
  addBtn.addEventListener('click', () => {
    const label = type === 'Income' ? 'income' : 'expense';
    const name = prompt(`New ${label} category name:`);
    if (!name) return;
    const clean = name.trim();
    if (!clean) return;
    if (state.categories[type].includes(clean)) {
      alert('Category already exists.');
      return;
    }
    state.categories[type].push(clean);
    saveState();
    renderCategoryBar(type);
  });
  holder.appendChild(addBtn);
}

//////////////////////////////////
// Transactions render helpers  //
//////////////////////////////////
function monthTransactions(type /* 'Income' | 'Expense' */) {
  return state.transactions
    .filter(tx => tx.type === type && sameMonth(tx.date, state.selectedMonth))
    .sort((a,b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
function sumAmount(list) {
  return list.reduce((acc, tx) => acc + (Number(tx.amount)||0), 0);
}

function renderTables() {
  // Income
  if (el.incomeTbody && el.incomeTotal) {
    const rows = monthTransactions('Income');
    el.incomeTbody.innerHTML = rows.map(tx => rowHTML(tx)).join('');
    el.incomeTotal.textContent = fmtMoney(sumAmount(rows));
    bindRowActions();
  }
  // Expenses
  if (el.expenseTbody && el.expenseTotal) {
    const rows = monthTransactions('Expense');
    el.expenseTbody.innerHTML = rows.map(tx => rowHTML(tx)).join('');
    el.expenseTotal.textContent = fmtMoney(sumAmount(rows));
    bindRowActions();
  }
}

function rowHTML(tx) {
  return `
    <tr data-id="${tx.id}">
      <td class="nowrap">${tx.date.split('-').reverse().join('/')}</td>
      <td>${escapeHTML(tx.category)}</td>
      <td class="right">${fmtMoney(tx.amount)}</td>
      <td>${escapeHTML(tx.note||'')}</td>
      <td class="nowrap">
        <button type="button" class="ghost btn-edit">Edit</button>
        <button type="button" class="ghost btn-del">Delete</button>
      </td>
    </tr>
  `;
}
function bindRowActions() {
  $$('.btn-edit').forEach(b => b.addEventListener('click', onEdit));
  $$('.btn-del').forEach(b => b.addEventListener('click', onDelete));
}

function onEdit(e) {
  const tr = e.target.closest('tr');
  if (!tr) return;
  const id = tr.dataset.id;
  const tx = state.transactions.find(t => String(t.id) === String(id));
  if (!tx) return;

  // Switch to the tab of this tx
  setActiveTab(tx.type.toLowerCase());
  selectedCategory = tx.category;
  if (el.categoryDisplay) el.categoryDisplay.textContent = tx.category;

  el.date.value   = tx.date;
  el.amount.value = String(tx.amount).replace('.', ',');
  el.note.value   = tx.note || '';
  editingId = tx.id;
  if (el.submitBtn) el.submitBtn.textContent = 'Update';
}
function onDelete(e) {
  const tr = e.target.closest('tr');
  if (!tr) return;
  const id = tr.dataset.id;
  const tx = state.transactions.find(t => String(t.id) === String(id));
  if (!tx) return;
  if (!confirm('Delete this transaction?')) return;

  state.transactions = state.transactions.filter(t => String(t.id) !== String(id));
  saveState();
  render();
}

/////////////////////////////
// Overview: stats + chart //
/////////////////////////////
let monthChart = null;

function renderOverview() {
  // stats
  const inc = monthTransactions('Income');
  const exp = monthTransactions('Expense');
  const incSum = sumAmount(inc);
  const expSum = sumAmount(exp);
  const bal    = incSum - expSum;

  if (el.sumIncome)  el.sumIncome.textContent  = fmtMoney(incSum);
  if (el.sumExpense) el.sumExpense.textContent = fmtMoney(expSum);
  if (el.sumBalance) el.sumBalance.textContent = fmtMoney(bal);

  // chart
  if (!el.chartCanvas || typeof Chart === 'undefined') return;

  const [year, month] = state.selectedMonth.split('-').map(Number);
  const dCount = daysInMonth(year, month-1);
  const labels = Array.from({length: dCount}, (_,i) => i+1);

  const dailyIncome  = Array(dCount).fill(0);
  const dailyExpense = Array(dCount).fill(0);
  inc.forEach(t => { const d = Number(t.date.slice(-2)); dailyIncome[d-1]  += Number(t.amount)||0; });
  exp.forEach(t => { const d = Number(t.date.slice(-2)); dailyExpense[d-1] += Number(t.amount)||0; });

  const running = [];
  let acc = 0;
  for (let i=0;i<dCount;i++) {
    acc += dailyIncome[i] - dailyExpense[i];
    running.push(acc);
  }

  const data = {
    labels,
    datasets: [
      { label:'Income', data:dailyIncome, borderColor:'#22c55e', backgroundColor:'#22c55e30', tension:.2 },
      { label:'Expenses', data:dailyExpense, borderColor:'#ef4444', backgroundColor:'#ef444430', tension:.2 },
      { label:'Running Balance', data:running, borderColor:'#2563eb', backgroundColor:'#2563eb30', fill:false, tension:.2 }
    ]
  };

  const options = {
    responsive:true,
    maintainAspectRatio:false,
    scales: {
      y: {
        beginAtZero:true,
        ticks: {
          // show euros on left axis
          callback: (v)=> EUR.format(v)
        }
      }
    },
    plugins: { legend: { position:'top' } }
  };

  // ensure visible height
  const parent = el.chartCanvas.parentElement;
  if (parent && !parent.style.height) parent.style.height = '300px';

  if (monthChart) { monthChart.destroy(); monthChart = null; }
  monthChart = new Chart(el.chartCanvas.getContext('2d'), { type:'line', data, options });
}

/////////////////////////////
// Form handling           //
/////////////////////////////
function currentType() {
  return activeTab === 'income' ? 'Income'
       : activeTab === 'expenses' ? 'Expense'
       : 'Expense'; // default if someone tries from overview (we don't show the form there)
}
function clearForm() {
  editingId = null;
  selectedCategory = null;
  if (el.categoryDisplay) el.categoryDisplay.textContent = '—';
  if (el.date)   el.date.value = '';
  if (el.amount) el.amount.value = '';
  if (el.note)   el.note.value   = '';
  if (el.submitBtn) el.submitBtn.textContent = 'Add';
}
function onSubmit(e) {
  e.preventDefault();
  if (activeTab === 'overview') {
    alert('Use the Income or Expenses tab to add transactions.');
    return;
  }
  const type = currentType();

  if (!selectedCategory) {
    alert('Choose a category.');
    return;
  }
  const date   = el.date?.value || '';
  const amount = parseMoneyInput(el.amount?.value || '');
  const note   = el.note?.value || '';

  if (!date)    { alert('Please choose a date.'); return; }
  if (!amount)  { alert('Please enter an amount.'); return; }

  if (editingId) {
    // update
    const tx = state.transactions.find(t => t.id === editingId);
    if (!tx) return;
    tx.type     = type;
    tx.category = selectedCategory;
    tx.date     = date;
    tx.amount   = amount;
    tx.note     = note;
  } else {
    // add
    state.transactions.push({
      id: Date.now() + Math.random().toString(36).slice(2),
      type,
      category: selectedCategory,
      date,
      amount,
      note
    });
  }

  saveState();
  clearForm();
  render();
}

/////////////////////////////
// Rendering driver        //
/////////////////////////////
function render() {
  // Stats + Chart
  renderOverview();

  // Category bars on tabs
  renderCategoryBar('Income');
  renderCategoryBar('Expense');

  // Tables
  renderTables();

  // Keep month input in sync if present
  if (monthInputEl && monthInputEl.value !== state.selectedMonth) {
    monthInputEl.value = state.selectedMonth;
  }
}

/////////////////////////////
// Init                    //
/////////////////////////////
function init() {
  // Tabs (buttons with data-tab)
  $$('.tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });

  // If HTML already set an active class, respect it, else default to overview
  const activeBtn = $$('.tabs .tab').find(b => b.classList.contains('active')) || $('.tabs .tab');
  activeTab = activeBtn?.dataset.tab || 'overview';

  initMonthControl();

  // Form
  if (el.form) {
    el.form.addEventListener('submit', onSubmit);
  }
  if (el.clearBtn) {
    el.clearBtn.addEventListener('click', clearForm);
  }

  render();
}

/////////////////////////////
// Escape for HTML safely  //
/////////////////////////////
function escapeHTML(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

document.addEventListener('DOMContentLoaded', init);
