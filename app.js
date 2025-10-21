/* =========================================================
   Family Budget – app.js
   - Month in header is always usable
   - Overview has stats + graph (no form, no table)
   - Income / Expenses: category chips + +New, form, table, edit/delete
   - Data in localStorage
   ========================================================= */
const $ = (s) => document.querySelector(s);

const STORAGE_KEY = 'family-budget/v3';

function euro(n) {
  // cents -> € string with Belgian formatting
  const v = (n || 0) / 100;
  return v.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR' });
}
function parseAmountToCents(str) {
  if (!str) return 0;
  let s = String(str).trim();
  // normalize: keep digits, commas, dots; replace comma with dot for decimal
  s = s.replace(/[^\d,.\-]/g, '').replace(',', '.');
  const f = parseFloat(s);
  if (isNaN(f)) return 0;
  return Math.round(f * 100);
}
function yyyymm(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}
function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0,10);
}

let state = load();
let chart; // Chart.js instance

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        selectedMonth: yyyymm(new Date()),
        categories: {
          Income: ['Salary'],
          Expense: ['Rent', 'Groceries', 'Utilities']
        },
        selectedCat: { Income: null, Expense: null },
        transactions: [] // {id, type:'Income'|'Expense', date:'YYYY-MM-DD', amountCents, category, note}
      };
    }
    const s = JSON.parse(raw);
    // defaults for new keys
    s.categories ??= { Income: ['Salary'], Expense: ['Rent','Groceries','Utilities'] };
    s.selectedCat ??= { Income:null, Expense:null };
    s.transactions ??= [];
    s.selectedMonth ??= yyyymm(new Date());
    return s;
  } catch(e) {
    console.warn('Load error', e);
    return {
      selectedMonth: yyyymm(new Date()),
      categories: { Income:['Salary'], Expense:['Rent','Groceries','Utilities'] },
      selectedCat: { Income:null, Expense:null },
      transactions: []
    };
  }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ---------------- Header / Month ---------------- */
const monthPicker = $('#monthPicker');
const btnToday = $('#btnToday');
monthPicker.value = state.selectedMonth;
btnToday.addEventListener('click', () => {
  state.selectedMonth = yyyymm(new Date());
  monthPicker.value = state.selectedMonth;
  save();
  renderAll();
});
monthPicker.addEventListener('change', (e) => {
  state.selectedMonth = e.target.value || state.selectedMonth;
  save();
  renderAll();
});

/* ---------------- Helpers for filtering ---------------- */
function inSelectedMonth(tx) {
  return (tx.date || '').slice(0,7) === state.selectedMonth;
}
function byType(type) {
  return state.transactions.filter(t => t.type === type && inSelectedMonth(t));
}

/* ---------------- Category Bars ---------------- */
function renderCategoryBar(type) {
  const bar = type === 'Income' ? $('#incomeCatBar') : $('#expenseCatBar');
  bar.innerHTML = '';
  const list = state.categories[type] || [];
  const selected = state.selectedCat[type];

  list.forEach(cat => {
    const b = document.createElement('button');
    b.textContent = cat;
    if (cat === selected) b.classList.add('active');
    b.addEventListener('click', () => {
      state.selectedCat[type] = cat;
      save();
      renderAll();
    });
    bar.appendChild(b);
  });

  const addBtn = document.createElement('button');
  addBtn.textContent = '+ New';
  addBtn.addEventListener('click', () => {
    const name = prompt(`New ${type} category name:`);
    const clean = (name || '').trim();
    if (!clean) return;
    if (!state.categories[type].includes(clean)) {
      state.categories[type].push(clean);
      state.selectedCat[type] = clean;
      save();
      renderAll();
    } else {
      state.selectedCat[type] = clean;
      save();
      renderAll();
    }
  });
  bar.appendChild(addBtn);

  const label = (type === 'Income') ? $('#incomeSelectedCat') : $('#expenseSelectedCat');
  label.textContent = state.selectedCat[type] || '—';
}

/* ---------------- Forms ---------------- */
function setupForm(type) {
  const isInc = type === 'Income';
  const form = isInc ? $('#incomeForm') : $('#expenseForm');
  const idInput = isInc ? $('#incomeEditingId') : $('#expenseEditingId');
  const dateInput = isInc ? $('#incomeDate') : $('#expenseDate');
  const amtInput = isInc ? $('#incomeAmount') : $('#expenseAmount');
  const noteInput = isInc ? $('#incomeNote') : $('#expenseNote');
  const submitBtn = isInc ? $('#incomeSubmit') : $('#expenseSubmit');
  const clearBtn = isInc ? $('#incomeClear') : $('#expenseClear');

  // default date: today (or clamp into selected month)
  if (!dateInput.value) dateInput.value = todayISO();

  clearBtn.onclick = () => {
    idInput.value = '';
    amtInput.value = '';
    noteInput.value = '';
    dateInput.value = todayISO();
  };

  form.onsubmit = (ev) => {
    ev.preventDefault();
    const cat = state.selectedCat[type];
    if (!cat) { alert(`Choose a ${type} category first.`); return; }

    const amountCents = parseAmountToCents(amtInput.value);
    if (amountCents <= 0) { alert('Enter a valid amount.'); return; }

    const tx = {
      id: idInput.value || crypto.randomUUID(),
      type,
      date: dateInput.value || todayISO(),
      amountCents,
      category: cat,
      note: (noteInput.value || '').trim()
    };

    if (idInput.value) {
      // update existing
      const idx = state.transactions.findIndex(t => t.id === tx.id);
      if (idx >= 0) state.transactions[idx] = tx;
    } else {
      state.transactions.push(tx);
    }
    save();
    // reset
    idInput.value = '';
    amtInput.value = '';
    noteInput.value = '';
    dateInput.value = todayISO();

    renderAll();
  };
}

/* ---------------- Tables (per tab) ---------------- */
function renderTable(type) {
  const isInc = type === 'Income';
  const tbody = isInc ? $('#incomeTbody') : $('#expenseTbody');
  const totalEl = isInc ? $('#incomeTotal') : $('#expenseTotal');

  const rows = byType(type).sort((a,b)=> a.date.localeCompare(b.date));
  tbody.innerHTML = '';
  let total = 0;

  rows.forEach(tx => {
    total += tx.amountCents;
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.className = 'nowrap';
    const d = new Date(tx.date);
    tdDate.textContent = d.toLocaleDateString('nl-BE');
    tr.appendChild(tdDate);

    const tdCat = document.createElement('td');
    tdCat.textContent = tx.category;
    tr.appendChild(tdCat);

    const tdAmt = document.createElement('td');
    tdAmt.className = 'right';
    tdAmt.textContent = euro(tx.amountCents);
    tr.appendChild(tdAmt);

    const tdNote = document.createElement('td');
    tdNote.textContent = tx.note || '';
    tr.appendChild(tdNote);

    const tdAct = document.createElement('td');
    tdAct.className = 'actions';

    const btnEdit = document.createElement('button');
    btnEdit.className = 'ghost';
    btnEdit.textContent = 'Edit';
    btnEdit.onclick = () => {
      state.selectedCat[type] = tx.category;
      save();
      // show tab
      window.__activateTab(isInc ? 'income' : 'expenses');
      // fill form
      const idInput = isInc ? $('#incomeEditingId') : $('#expenseEditingId');
      const dateInput = isInc ? $('#incomeDate') : $('#expenseDate');
      const amtInput = isInc ? $('#incomeAmount') : $('#expenseAmount');
      const noteInput = isInc ? $('#incomeNote') : $('#expenseNote');

      idInput.value = tx.id;
      dateInput.value = tx.date;
      // back to decimal with comma per BE
      amtInput.value = (tx.amountCents/100).toLocaleString('nl-BE', { minimumFractionDigits:2, maximumFractionDigits:2 });
      noteInput.value = tx.note || '';
      renderAll(); // refresh category highlight etc.
    };

    const btnDel = document.createElement('button');
    btnDel.className = 'ghost';
    btnDel.textContent = 'Delete';
    btnDel.onclick = () => {
      if (!confirm('Delete this transaction?')) return;
      state.transactions = state.transactions.filter(t => t.id !== tx.id);
      save();
      renderAll();
    };

    tdAct.appendChild(btnEdit);
    tdAct.appendChild(btnDel);
    tr.appendChild(tdAct);

    tbody.appendChild(tr);
  });

  totalEl.textContent = euro(total);
}

/* ---------------- Overview stats + chart ---------------- */
function renderOverview() {
  const inc = byType('Income').reduce((s,t)=>s+t.amountCents,0);
  const exp = byType('Expense').reduce((s,t)=>s+t.amountCents,0);
  $('#sumIncome').textContent = euro(inc);
  $('#sumExpense').textContent = euro(exp);
  $('#sumBalance').textContent = euro(inc-exp);

  // chart data per day
  const [y,m] = state.selectedMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const labels = Array.from({length:daysInMonth}, (_,i)=>String(i+1));
  const dailyInc = new Array(daysInMonth).fill(0);
  const dailyExp = new Array(daysInMonth).fill(0);

  byType('Income').forEach(t => {
    const d = new Date(t.date).getDate();
    dailyInc[d-1] += t.amountCents/100;
  });
  byType('Expense').forEach(t => {
    const d = new Date(t.date).getDate();
    dailyExp[d-1] += t.amountCents/100;
  });

  const run = [];
  let c = 0;
  for (let i=0;i<daysInMonth;i++){
    c += (dailyInc[i] - dailyExp[i]);
    run.push(c);
  }

  const ctx = $('#monthChart').getContext('2d');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label:'Income', data: dailyInc, borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,.15)', tension:.2, fill:true },
        { label:'Expenses', data: dailyExp, borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,.15)', tension:.2, fill:true },
        { label:'Running Balance', data: run, borderColor:'#3b82f6', tension:.2 }
      ]
    },
    options: {
      responsive:true,
      maintainAspectRatio:false,
      plugins:{ legend:{ display:true } },
      scales: {
        y: { beginAtZero:true, title:{ display:true, text:'€ per day' } }
      }
    }
  });
}

/* ---------------- Master render ---------------- */
function renderAll() {
  // header month input already bound; just rebuild UI below
  renderCategoryBar('Income');
  renderCategoryBar('Expense');
  setupForm('Income');
  setupForm('Expense');
  renderTable('Income');
  renderTable('Expense');
  renderOverview();
}

/* Initial render */
renderAll();
