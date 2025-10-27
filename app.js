// ========================================================
// Family Budget - app.js (v8)
// - Month filter can be cleared (shows ALL entries)
// - Income/Expense tables respect cleared filter
// - Cards use current month if set, otherwise ALL
// - Chart: one point per day (daily sums), running total over ALL time
// ========================================================

var $ = (sel) => document.querySelector(sel);

/* Money utils */
var moneyFmt = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' });
function formatMoney(cents) { return moneyFmt.format((cents || 0) / 100); }
function parseMoneyToCents(str) {
  if (!str) return 0;
  let s = String(str).trim().replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '');
  s = s.replace(',', '.').replace(/[^\d.-]/g, '');
  const v = parseFloat(s);
  return isNaN(v) ? 0 : Math.round(v * 100);
}

/* Dates */
function today() { return new Date(); }
function toYM(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

/* State */
const STORAGE_KEY = 'family-budget/v4';
function defaultState() {
  return {
    selectedMonth: toYM(today()),        // can be null to show ALL
    categories: {
      Income: ['Cash','Huur','Kinderbijslag','Andere'],
      Expense: ['Boodschappen','Aflossing Lening','Water','School','Kledij','Dokter/apothek','School','Hobby','Resto/Take-Away','Vakantie','Andere']
    },
    transactions: [] // {id,type,date,category,amountCents,note}
  };
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw) || {};
    if (!('selectedMonth' in s)) s.selectedMonth = toYM(today());
    if (!s.categories || typeof s.categories !== 'object') s.categories = { Income: [], Expense: [] };
    if (!Array.isArray(s.categories.Income)) s.categories.Income = [];
    if (!Array.isArray(s.categories.Expense)) s.categories.Expense = [];
    if (!Array.isArray(s.transactions)) s.transactions = [];
    return s;
  } catch { return defaultState(); }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

let state = loadState();

/* Tabs */
const tabs = Array.from(document.querySelectorAll('.tabs .tab'));
const panels = { overview: $('#tab-overview'), income: $('#tab-income'), expenses: $('#tab-expenses') };
function activateTab(name) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  Object.keys(panels).forEach(k => panels[k].classList.toggle('active', k === name));
}
tabs.forEach(btn => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));

/* Month picker + buttons */
const monthPicker = $('#monthPicker');
const btnToday = $('#btnToday');
const btnClearMonth = $('#btnClearMonth');

function setMonthUIFromState() {
  if (!monthPicker) return;
  monthPicker.value = state.selectedMonth || ''; // blank shows "all"
  monthPicker.placeholder = 'All months';
}
function initMonthPicker() {
  setMonthUIFromState();
  if (monthPicker) monthPicker.addEventListener('change', () => {
    state.selectedMonth = monthPicker.value || null; // null = ALL
    saveState(); renderAll();
  });
  if (btnToday) btnToday.addEventListener('click', () => {
    state.selectedMonth = toYM(today());
    setMonthUIFromState(); saveState(); renderAll();
  });
  if (btnClearMonth) btnClearMonth.addEventListener('click', () => {
    state.selectedMonth = null; // show ALL entries
    setMonthUIFromState(); saveState(); renderAll();
  });
}

/* Categories */
let selectedIncomeCat = null;
let selectedExpenseCat = null;

function renderCategoryChips(kind) {
  const container = (kind === 'Income') ? $('#incomeCats') : $('#expenseCats');
  if (!container) return;
  const cats = state.categories[kind] || [];
  const current = (kind === 'Income') ? selectedIncomeCat : selectedExpenseCat;

  container.innerHTML = '';
  cats.forEach(name => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (current === name ? ' selected' : '');
    b.textContent = name;
    b.setAttribute('data-action', 'select-cat');
    b.setAttribute('data-kind', kind);
    b.setAttribute('data-name', name);
    container.appendChild(b);
  });

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'chip new';
  add.textContent = '+ New';
  add.setAttribute('data-action', 'add-cat');
  add.setAttribute('data-kind', kind);
  container.appendChild(add);
}
function selectCategory(kind, name) {
  if (kind === 'Income') {
    selectedIncomeCat = name;
    const d = $('#incomeSelectedCat'); if (d) d.textContent = name || '—';
  } else {
    selectedExpenseCat = name;
    const d2 = $('#expenseSelectedCat'); if (d2) d2.textContent = name || '—';
  }
  renderCategoryChips(kind);
}
function addCategory(kind) {
  let name = prompt('New ' + kind + ' category name:', '') || '';
  name = name.trim();
  if (!name) return;
  const arr = state.categories[kind] || (state.categories[kind] = []);
  if (!arr.includes(name)) arr.push(name);
  saveState();
  selectCategory(kind, name);
}

/* Chip delegation */
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t && t.getAttribute) {
    const action = t.getAttribute('data-action');
    const kind = t.getAttribute('data-kind');
    if (action === 'add-cat' && kind) { e.preventDefault(); addCategory(kind); }
    if (action === 'select-cat' && kind) {
      const name = t.getAttribute('data-name') || '';
      e.preventDefault(); selectCategory(kind, name);
    }
  }
});

/* Transactions */
function txFiltered() {
  const ym = state.selectedMonth;
  if (!ym) return state.transactions.slice(); // ALL
  return state.transactions.filter(t => (t.date || '').slice(0,7) === ym);
}
function addOrUpdateTx(kind, data, editingId) {
  if (editingId) {
    const i = state.transactions.findIndex(t => t.id === editingId);
    if (i >= 0) state.transactions[i] = Object.assign({}, state.transactions[i], data, { type: kind });
  } else {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    state.transactions.push(Object.assign({ id, type: kind }, data));
  }
  saveState();
}
function deleteTx(id) {
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveState();
}

/* Colors */
const COLORS = {
  balance: { line: '#F6A034', fill: 'rgba(246,160,52,0.18)' },
  axis: { text: '#555555', grid: '#EAEAEA', legend: '#333333' }
};

/* Helpers */
function sortByDateAsc(arr) {
  return [...arr].sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}
// One point per day, running total over ALL time
function buildDailyRunningSeries(allTx) {
  const daily = new Map(); // date -> cents delta
  for (const t of allTx) {
    const delta = t.type === 'Income' ? +t.amountCents : -t.amountCents;
    daily.set(t.date, (daily.get(t.date) || 0) + delta);
  }
  const dates = Array.from(daily.keys()).sort(); // ISO sorts
  const labels = [];
  const values = [];
  let acc = 0;
  for (const d of dates) {
    acc += daily.get(d);
    labels.push(d);
    values.push(acc / 100);
  }
  return { labels, values };
}

/* Overview */
let chart = null;
function renderOverview() {
  // CARDS: month if selected, otherwise ALL
  const scoped = txFiltered();
  let inc = 0, exp = 0;
  scoped.forEach(t => { if (t.type === 'Income') inc += t.amountCents; else exp += t.amountCents; });
  const bal = inc - exp;
  const si = $('#sumIncome'), se = $('#sumExpense'), sb = $('#sumBalance');
  if (si) si.textContent = formatMoney(inc);
  if (se) se.textContent = formatMoney(exp);
  if (sb) sb.textContent = formatMoney(bal);

  // CHART: all-time daily running total
  const { labels, values } = buildDailyRunningSeries(sortByDateAsc(state.transactions));
  const canvas = $('#monthChart'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.length ? labels : ['No data'],
      datasets: [{
        label: 'Running Total (All Time)',
        data: values.length ? values : [0],
        borderColor: COLORS.balance.line,
        backgroundColor: COLORS.balance.fill,
        pointBackgroundColor: COLORS.balance.line,
        borderWidth: 2,
        tension: 0.25,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top', labels: { color: COLORS.axis.legend } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed.y;
              const prev = ctx.dataIndex > 0 ? ctx.dataset.data[ctx.dataIndex - 1] : 0;
              const change = val - prev;
              return ` ${moneyFmt.format(val)}  (Δ ${moneyFmt.format(change)})`;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: COLORS.axis.grid }, ticks: { color: COLORS.axis.text } },
        y: { grid: { color: COLORS.axis.grid }, ticks: { color: COLORS.axis.text,
          callback: (v) => moneyFmt.format(v) } }
      }
    }
  });
}

/* Tables (respect cleared filter) */
function renderTable(kind) {
  const isIncome = (kind === 'Income');
  const body = isIncome ? $('#incomeTbody') : $('#expenseTbody');
  const tot  = isIncome ? $('#incomeTotal') : $('#expenseTotal');
  if (!body || !tot) return;

  const rows = txFiltered().filter(t => t.type === kind)
    .sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

  body.innerHTML = '';
  let sum = 0;
  rows.forEach((t) => {
    sum += t.amountCents;
    const tr = document.createElement('tr');
    const d  = document.createElement('td'); d.textContent = t.date.split('-').reverse().join('/');
    const c  = document.createElement('td'); c.textContent = t.category || '—';
    const a  = document.createElement('td'); a.className = 'right'; a.textContent = formatMoney(t.amountCents);
    const n  = document.createElement('td'); n.textContent = t.note || '';
    const act= document.createElement('td');
    const be = document.createElement('button'); be.type='button'; be.className='ghost'; be.textContent='Edit';
    const bd = document.createElement('button'); bd.type='button'; bd.className='ghost'; bd.textContent='Delete';
    be.addEventListener('click', () => { beginEdit(kind, t.id); });
    bd.addEventListener('click', () => { if (confirm('Delete this transaction?')) { deleteTx(t.id); renderAll(); } });
    act.appendChild(be); act.appendChild(document.createTextNode(' ')); act.appendChild(bd);
    tr.appendChild(d); tr.appendChild(c); tr.appendChild(a); tr.appendChild(n); tr.appendChild(act);
    body.appendChild(tr);
  });

  tot.textContent = formatMoney(sum);
}

/* Forms */
function clearForm(kind) {
  if (kind === 'Income') {
    $('#incomeEditingId').value = ''; $('#incomeDate').value = ''; $('#incomeAmount').value = ''; $('#incomeNote').value = '';
    $('#incomeSubmit').textContent = 'Add';
  } else {
    $('#expenseEditingId').value = ''; $('#expenseDate').value = ''; $('#expenseAmount').value = ''; $('#expenseNote').value = '';
    $('#expenseSubmit').textContent = 'Add';
  }
}
function beginEdit(kind, id) {
  const t = state.transactions.find(x => x.id === id); if (!t) return;
  activateTab(kind.toLowerCase());
  if (kind === 'Income') {
    selectedIncomeCat = t.category || null; const disp = $('#incomeSelectedCat'); if (disp) disp.textContent = selectedIncomeCat || '—';
    renderCategoryChips('Income');
    $('#incomeEditingId').value = t.id; $('#incomeDate').value = t.date; $('#incomeAmount').value = (t.amountCents/100).toString().replace('.',','); $('#incomeNote').value = t.note || ''; $('#incomeSubmit').textContent = 'Save';
  } else {
    selectedExpenseCat = t.category || null; const disp2 = $('#expenseSelectedCat'); if (disp2) disp2.textContent = selectedExpenseCat || '—';
    renderCategoryChips('Expense');
    $('#expenseEditingId').value = t.id; $('#expenseDate').value = t.date; $('#expenseAmount').value = (t.amountCents/100).toString().replace('.',','); $('#expenseNote').value = t.note || ''; $('#expenseSubmit').textContent = 'Save';
  }
}

/* Submit handlers */
const incomeForm = $('#incomeForm');
if (incomeForm) incomeForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!selectedIncomeCat) return alert('Please select a category (or add one).');
  const date = $('#incomeDate').value;
  const cents = parseMoneyToCents($('#incomeAmount').value);
  if (!date || cents <= 0) return alert('Please enter a valid date and amount.');
  const note = ($('#incomeNote').value || '').trim();
  const editingId = $('#incomeEditingId').value || null;
  addOrUpdateTx('Income', { date, category: selectedIncomeCat, amountCents: cents, note }, editingId);
  clearForm('Income'); renderAll();
});
const incomeClear = $('#incomeClear'); if (incomeClear) incomeClear.addEventListener('click', () => clearForm('Income'));

const expenseForm = $('#expenseForm');
if (expenseForm) expenseForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!selectedExpenseCat) return alert('Please select a category (or add one).');
  const date = $('#expenseDate').value;
  const cents = parseMoneyToCents($('#expenseAmount').value);
  if (!date || cents <= 0) return alert('Please enter a valid date and amount.');
  const note = ($('#expenseNote').value || '').trim();
  const editingId = $('#expenseEditingId').value || null;
  addOrUpdateTx('Expense', { date, category: selectedExpenseCat, amountCents: cents, note }, editingId);
  clearForm('Expense'); renderAll();
});
const expenseClear = $('#expenseClear'); if (expenseClear) expenseClear.addEventListener('click', () => clearForm('Expense'));

/* Export / Import (unchanged) */
function exportBackup() {
  try {
    const payload = { version: 1, exportedAt: new Date().toISOString(), data: state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const ymd = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'family-budget-backup-' + ymd + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 0);
  } catch (err) { alert('Export failed: ' + (err?.message || String(err))); }
}
function validateImported(obj) {
  if (!obj || typeof obj !== 'object') return 'Invalid JSON';
  const data = obj.data || obj;
  if (!data.categories || typeof data.categories !== 'object') return 'Missing categories';
  if (!Array.isArray(data.categories.Income) || !Array.isArray(data.categories.Expense)) return 'Bad categories';
  if (!Array.isArray(data.transactions)) return 'Missing transactions';
  data.transactions = data.transactions.map(t => ({
    id: (t.id || (Date.now().toString(36) + Math.random().toString(36).slice(2))),
    type: (t.type === 'Income' ? 'Income' : 'Expense'),
    date: (t.date || new Date().toISOString().slice(0,10)),
    category: (t.category || ''),
    amountCents: (typeof t.amountCents === 'number' ? t.amountCents : parseMoneyToCents(t.amount)),
    note: (t.note || '')
  }));
  if (!('selectedMonth' in data)) data.selectedMonth = toYM(today());
  return data;
}
function importBackupFile(file) {
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const obj = JSON.parse(reader.result);
      const data = validateImported(obj);
      if (typeof data === 'string') return alert('Import failed: ' + data);
      state = data; saveState(); renderAll(); alert('Import successful.');
    } catch (err) { alert('Import failed: ' + (err?.message || String(err))); }
  };
  reader.onerror = () => alert('Could not read file.');
  reader.readAsText(file);
}
function importCSVFile(file) {
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const text = reader.result;
      const rows = text.split(/\r?\n/).filter(r => r.trim() !== '');
      const headers = rows[0].split(/,|;|\t/).map(h => h.trim().toLowerCase());
      const txs = [];
      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].split(/,|;|\t/);
        if (cols.length < 4) continue;
        let rawDate = (cols[headers.indexOf('date')] || '').trim();
        let date = '';
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
          const [d,m,y] = rawDate.split('/'); date = `${y}-${m}-${d}`;
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) { date = rawDate; }
        else { date = new Date().toISOString().slice(0,10); }
        const type = (/income/i).test(cols[headers.indexOf('type')]) ? 'Income' : 'Expense';
        const category = cols[headers.indexOf('category')]?.trim() || '';
        const amountCents = parseMoneyToCents(cols[headers.indexOf('amount')] || '0');
        const note = cols[headers.indexOf('note')]?.trim() || '';
        txs.push({ id: Date.now().toString(36)+Math.random().toString(36).slice(2), type, date, category, amountCents, note });
      }
      state.transactions = state.transactions.concat(txs);
      saveState(); renderAll();
      alert('CSV import successful: ' + txs.length + ' rows added.');
    } catch (err) { alert('CSV import failed: ' + err.message); }
  };
  reader.readAsText(file);
}
const btnExport = $('#btnExport'); if (btnExport) btnExport.addEventListener('click', exportBackup);
const fileImport = $('#fileImport'); const btnImport = $('#btnImport');
if (btnImport && fileImport) btnImport.addEventListener('click', () => fileImport.click());
if (fileImport) fileImport.addEventListener('change', () => {
  const f = fileImport.files && fileImport.files[0]; if (!f) return;
  const name = f.name.toLowerCase();
  if (name.endsWith('.csv')) importCSVFile(f); else importBackupFile(f);
  fileImport.value = '';
});

/* Init */
function renderAll() {
  setMonthUIFromState();
  if (!selectedIncomeCat && state.categories.Income?.length) selectedIncomeCat = state.categories.Income[0];
  if (!selectedExpenseCat && state.categories.Expense?.length) selectedExpenseCat = state.categories.Expense[0];
  const incDisp = $('#incomeSelectedCat'); if (incDisp) incDisp.textContent = selectedIncomeCat || '—';
  const expDisp = $('#expenseSelectedCat'); if (expDisp) expDisp.textContent = selectedExpenseCat || '—';
  renderCategoryChips('Income'); renderCategoryChips('Expense');
  renderOverview();
  renderTable('Income'); renderTable('Expense');
}
initMonthPicker();
activateTab('overview');
renderAll();
