// ========================================================
// Family Budget - app.js  (no external deps except Chart.js)
// ========================================================

/* DOM helpers */
const $ = (sel) => document.querySelector(sel);

/* Be locale-minded: Belgian formatting */
const moneyFmt = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' });

function formatMoney(cents) {
  return moneyFmt.format((cents || 0) / 100);
}

/* Parse EU money string to cents, forgiving input */
function parseMoneyToCents(str) {
  if (!str) return 0;
  let s = String(str).trim();
  // Remove spaces
  s = s.replace(/\s/g, '');
  // If it already has comma decimals, strip thousands . (dot)
  if (s.includes(',')) s = s.replace(/\./g, '');
  // Standardize decimal separator
  s = s.replace(',', '.');
  // Remove currency symbol and anything non-numeric/dot/minus
  s = s.replace(/[^\d.-]/g, '');
  const v = parseFloat(s);
  if (Number.isNaN(v)) return 0;
  return Math.round(v * 100);
}

/* Date helpers */
const today = () => new Date();
const toYMD = (d) => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
const toYM  = (d) => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0')].join('-');

/* App state in localStorage */
const STORAGE_KEY = 'family-budget/v3';

const defaultState = () => ({
  selectedMonth: toYM(today()),
  categories: {
    Income:  ['Salary'],
    Expense: ['Groceries','Rent','Utilities']
  },
  transactions: [] // {id, type:'Income'|'Expense', date:'YYYY-MM-DD', category, amountCents, note}
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // safety fallbacks
    parsed.categories = parsed.categories || { Income:[], Expense:[] };
    parsed.categories.Income  ||= [];
    parsed.categories.Expense ||= [];
    parsed.transactions ||= [];
    parsed.selectedMonth ||= toYM(today());
    return parsed;
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* Single global state */
let state = loadState();

/* Tabs wiring */
const tabs = Array.from(document.querySelectorAll('.tabs .tab'));
const panels = {
  overview: $('#tab-overview'),
  income:   $('#tab-income'),
  expenses: $('#tab-expenses')
};

function activateTab(name) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  Object.entries(panels).forEach(([key, el]) => el.classList.toggle('active', key === name));
}

tabs.forEach(btn => btn.addEventListener('click', () => {
  activateTab(btn.dataset.tab);
}));

/* Month selector */
const monthPicker = $('#monthPicker');
const btnToday = $('#btnToday');

function initMonthPicker() {
  monthPicker.value = state.selectedMonth; // YYYY-MM
  monthPicker.addEventListener('change', () => {
    state.selectedMonth = monthPicker.value || toYM(today());
    saveState();
    renderAll();
  });
  btnToday.addEventListener('click', () => {
    state.selectedMonth = toYM(today());
    monthPicker.value = state.selectedMonth;
    saveState();
    renderAll();
  });
}

/* ------- Category chips ------- */
let selectedIncomeCat = null;
let selectedExpenseCat = null;

function renderCategoryChips(kind) {
  const list = state.categories[kind]; // 'Income'|'Expense'
  const box  = kind === 'Income' ? $('#incomeCats') : $('#expenseCats');
  const selected = (kind === 'Income') ? selectedIncomeCat : selectedExpenseCat;

  box.innerHTML = '';
  if (!Array.isArray(list)) return;

  list.forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (selected === cat ? ' selected' : '');
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      if (kind === 'Income') {
        selectedIncomeCat = cat;
        $('#incomeSelectedCat').textContent = cat;
      } else {
        selectedExpenseCat = cat;
        $('#expenseSelectedCat').textContent = cat;
      }
      renderCategoryChips(kind); // refresh selection
    });
    box.appendChild(btn);
  });
}

function addCategory(kind) {
  const name = prompt(`New ${kind} category name:`, '');
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;

  const arr = state.categories[kind];
  if (!arr.includes(trimmed)) arr.push(trimmed);
  saveState();

  if (kind === 'Income') selectedIncomeCat = trimmed;
  else selectedExpenseCat = trimmed;

  if (kind === 'Income') $('#incomeSelectedCat').textContent = selectedIncomeCat;
  else $('#expenseSelectedCat').textContent = selectedExpenseCat;

  renderCategoryChips(kind);
}

/* ------- Transactions ------- */
function txOfMonth() {
  const ym = state.selectedMonth;
  return state.transactions.filter(t => (t.date || '').slice(0, 7) === ym);
}

function addOrUpdateTx(kind, data, editingId) {
  if (editingId) {
    const idx = state.transactions.findIndex(t => t.id === editingId);
    if (idx >= 0) state.transactions[idx] = { ...state.transactions[idx], ...data };
  } else {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    state.transactions.push({ id, type: kind, ...data });
  }
  saveState();
}

function deleteTx(id) {
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveState();
}

/* ------- Rendering: Overview ------- */
let chart = null;

function calcSums(trans) {
  const inc = trans.filter(t => t.type === 'Income')
                  .reduce((s, t) => s + t.amountCents, 0);
  const exp = trans.filter(t => t.type === 'Expense')
                  .reduce((s, t) => s + t.amountCents, 0);
  return { inc, exp, bal: inc - exp };
}

function renderOverview() {
  const trans = txOfMonth();
  const { inc, exp, bal } = calcSums(trans);

  $('#sumIncome').textContent  = formatMoney(inc);
  $('#sumExpense').textContent = formatMoney(exp);
  $('#sumBalance').textContent = formatMoney(bal);

  // Build per-day arrays
  const ym = state.selectedMonth.split('-'); // [YYYY, MM]
  const year = +ym[0], month = +ym[1] - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const incomePerDay  = Array(daysInMonth).fill(0);
  const expensePerDay = Array(daysInMonth).fill(0);
  for (const t of trans) {
    const d = new Date(t.date);
    const dayIdx = d.getDate() - 1;
    if (t.type === 'Income')  incomePerDay[dayIdx]  += t.amountCents / 100;
    else                       expensePerDay[dayIdx] += t.amountCents / 100;
  }
  // Running balance (accumulated)
  const runBal = [];
  let running = 0;
  for (let i=0;i<daysInMonth;i++){
    running += incomePerDay[i] - expensePerDay[i];
    runBal.push(running);
  }

  const labels = Array.from({length: daysInMonth}, (_,i)=> String(i+1));

  const ctx = $('#monthChart').getContext('2d');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type:'line',
    data:{
      labels,
      datasets:[
        { label:'Income',  data: incomePerDay, borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,.2)', tension:.2 },
        { label:'Expenses',data: expensePerDay, borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,.2)', tension:.2 },
        { label:'Running Balance', data: runBal, borderColor:'#2563eb', backgroundColor:'rgba(37,99,235,.2)', tension:.2 }
      ]
    },
    options:{
      responsive:true,
      plugins:{ legend:{ position:'top' } },
      scales:{
        y:{ ticks:{ callback:(v)=> moneyFmt.format(v) } },
        x:{ ticks:{ autoSkip:true, maxTicksLimit:14 } }
      }
    }
  });
}

/* ------- Rendering: Income / Expense tables ------- */
function renderTable(kind) {
  const isIncome = (kind === 'Income');
  const body   = isIncome ? $('#incomeTbody') : $('#expenseTbody');
  const total  = isIncome ? $('#incomeTotal') : $('#expenseTotal');
  const trans = txOfMonth().filter(t => t.type === kind);

  body.innerHTML = '';
  let sum = 0;

  trans
    .sort((a,b)=> (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .forEach(t => {
      sum += t.amountCents;
      const tr = document.createElement('tr');

      const tdDate = document.createElement('td'); tdDate.textContent = t.date.split('-').reverse().join('/'); // dd/mm/yyyy
      const tdCat  = document.createElement('td'); tdCat.textContent  = t.category || '—';
      const tdAmt  = document.createElement('td'); tdAmt.className='right'; tdAmt.textContent = formatMoney(t.amountCents);
      const tdNote = document.createElement('td'); tdNote.textContent = t.note || '';

      const tdAct = document.createElement('td');
      const btnE = document.createElement('button'); btnE.type='button'; btnE.className='ghost'; btnE.textContent='Edit';
      const btnD = document.createElement('button'); btnD.type='button'; btnD.className='ghost'; btnD.textContent='Delete';
      btnE.addEventListener('click', () => beginEdit(kind, t.id));
      btnD.addEventListener('click', () => { if (confirm('Delete this transaction?')) { deleteTx(t.id); renderAll(); } });
      tdAct.append(btnE, ' ', btnD);

      tr.append(tdDate, tdCat, tdAmt, tdNote, tdAct);
      body.appendChild(tr);
    });

  total.textContent = formatMoney(sum);
}

/* ------- Forms: add / edit ------- */
function clearForm(kind) {
  if (kind === 'Income') {
    $('#incomeEditingId').value = '';
    $('#incomeDate').value = '';
    $('#incomeAmount').value = '';
    $('#incomeNote').value = '';
    $('#incomeSubmit').textContent = 'Add';
  } else {
    $('#expenseEditingId').value = '';
    $('#expenseDate').value = '';
    $('#expenseAmount').value = '';
    $('#expenseNote').value = '';
    $('#expenseSubmit').textContent = 'Add';
  }
}

function beginEdit(kind, id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) return;

  if (kind === 'Income') {
    activateTab('income');
    selectedIncomeCat = t.category || null;
    $('#incomeSelectedCat').textContent = selectedIncomeCat || '—';
    renderCategoryChips('Income');

    $('#incomeEditingId').value = t.id;
    $('#incomeDate').value = t.date;
    $('#incomeAmount').value = (t.amountCents/100).toString().replace('.', ',');
    $('#incomeNote').value = t.note || '';
    $('#incomeSubmit').textContent = 'Save';
  } else {
    activateTab('expenses');
    selectedExpenseCat = t.category || null;
    $('#expenseSelectedCat').textContent = selectedExpenseCat || '—';
    renderCategoryChips('Expense');

    $('#expenseEditingId').value = t.id;
    $('#expenseDate').value = t.date;
    $('#expenseAmount').value = (t.amountCents/100).toString().replace('.', ',');
    $('#expenseNote').value = t.note || '';
    $('#expenseSubmit').textContent = 'Save';
  }
}

/* Income form */
$('#incomeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const cat = selectedIncomeCat;
  if (!cat) return alert('Please select a category (or add one).');

  const date   = $('#incomeDate').value;
  const amount = parseMoneyToCents($('#incomeAmount').value);
  if (!date || amount <= 0) return alert('Please enter a valid date and amount.');

  const note = $('#incomeNote').value.trim();
  const editingId = $('#incomeEditingId').value || null;

  addOrUpdateTx('Income', { date, category: cat, amountCents: amount, note }, editingId);
  clearForm('Income');
  renderAll();
});

$('#incomeClear').addEventListener('click', () => clearForm('Income'));
$('#addIncomeCat').addEventListener('click', () => addCategory('Income'));

/* Expense form */
$('#expenseForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const cat = selectedExpenseCat;
  if (!cat) return alert('Please select a category (or add one).');

  const date   = $('#expenseDate').value;
  const amount = parseMoneyToCents($('#expenseAmount').value);
  if (!date || amount <= 0) return alert('Please enter a valid date and amount.');

  const note = $('#expenseNote').value.trim();
  const editingId = $('#expenseEditingId').value || null;

  addOrUpdateTx('Expense', { date, category: cat, amountCents: amount, note }, editingId);
  clearForm('Expense');
  renderAll();
});

$('#expenseClear').addEventListener('click', () => clearForm('Expense'));
$('#addExpenseCat').addEventListener('click', () => addCategory('Expense'));

/* ------- Initial render ------- */
function renderAll() {
  // month input
  monthPicker.value = state.selectedMonth;

  // default selection for chips if none
  if (!selectedIncomeCat && state.categories.Income.length) {
    selectedIncomeCat = state.categories.Income[0];
  }
  if (!selectedExpenseCat && state.categories.Expense.length) {
    selectedExpenseCat = state.categories.Expense[0];
  }
  $('#incomeSelectedCat').textContent  = selectedIncomeCat  || '—';
  $('#expenseSelectedCat').textContent = selectedExpenseCat || '—';

  renderCategoryChips('Income');
  renderCategoryChips('Expense');

  renderOverview();
  renderTable('Income');
  renderTable('Expense');
}

/* Boot */
initMonthPicker();
renderAll();
