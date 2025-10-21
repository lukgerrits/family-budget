/* ============== Storage helpers ============== */
const LS_KEY = 'fb_data_v1';
function loadState() {
  const def = {
    categories: { income: ['Salary', 'Other'], expense: ['Groceries', 'Rent', 'Other'] },
    transactions: [] // {type:'income'|'expense', date:'YYYY-MM-DD', category:'', amount: number, note:''}
  };
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || def;
  } catch { return def; }
}
function saveState() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
let state = loadState();

/* ============== DOM refs ============== */
const monthPicker = document.getElementById('monthPicker');
const btnToday = document.getElementById('btnToday');

const tabs = document.querySelectorAll('.tab');
const panels = {
  overview: document.getElementById('tab-overview'),
  income: document.getElementById('tab-income'),
  expenses: document.getElementById('tab-expenses')
};

const sumIncome = document.getElementById('sumIncome');
const sumExpense = document.getElementById('sumExpense');
const sumBalance = document.getElementById('sumBalance');
const txList = document.getElementById('txList');

const incomeCatsEl = document.getElementById('incomeCats');
const expenseCatsEl = document.getElementById('expenseCats');
const incomeDL = document.getElementById('incomeCatDatalist');
const expenseDL = document.getElementById('expenseCatDatalist');

const formIncome = document.getElementById('formIncome');
const formExpense = document.getElementById('formExpense');
document.getElementById('clearIncomeForm').onclick = () => formIncome.reset();
document.getElementById('clearExpenseForm').onclick = () => formExpense.reset();

document.getElementById('btnAddIncomeCat').onclick  = () => addCategory('income');
document.getElementById('btnAddExpenseCat').onclick = () => addCategory('expense');

/* ============== Month handling ============== */
function setMonthToToday() {
  const d = new Date();
  const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  monthPicker.value = ym;
}
if (!monthPicker.value) setMonthToToday();

btnToday.addEventListener('click', () => {
  // Set today's date in all visible forms
  const today = new Date();
  const iso = today.toISOString().slice(0,10);
  document.querySelectorAll('section.tabpanel.active input[type="date"]').forEach(i => i.value = iso);
});

monthPicker.addEventListener('change', redrawAll);

/* ============== Tabs ============== */
tabs.forEach(btn => btn.addEventListener('click', () => {
  tabs.forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const tab = btn.dataset.tab;
  Object.values(panels).forEach(p => p.classList.remove('active'));
  panels[tab].classList.add('active');
  redrawAll();
}));

/* ============== Categories ============== */
function renderCategoryChips() {
  // buttons (chips)
  incomeCatsEl.innerHTML  = '';
  expenseCatsEl.innerHTML = '';
  state.categories.income.forEach(c => addChip(incomeCatsEl, c, 'income'));
  state.categories.expense.forEach(c => addChip(expenseCatsEl, c, 'expense'));

  // datalists (for typing/autocomplete)
  incomeDL.innerHTML  = state.categories.income.map(c => `<option value="${c}">`).join('');
  expenseDL.innerHTML = state.categories.expense.map(c => `<option value="${c}">`).join('');
}
function addChip(container, name, type) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.textContent = name;
  chip.onclick = () => {
    container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const form = (type === 'income') ? formIncome : formExpense;
    form.category.value = name;
  };
  container.appendChild(chip);
}
function addCategory(type) {
  const name = prompt(`New ${type} category name:`);
  if (!name) return;
  const arr = state.categories[type];
  if (!arr.includes(name)) {
    arr.push(name);
    saveState();
    renderCategoryChips();
  }
}

/* ============== Add Transactions ============== */
function formToTx(form) {
  const f = new FormData(form);
  const tx = Object.fromEntries(f.entries());
  tx.amount = Number(tx.amount);
  if (!tx.date) tx.date = new Date().toISOString().slice(0,10);
  return tx;
}
formIncome.addEventListener('submit', e => {
  e.preventDefault();
  const tx = formToTx(formIncome);
  if (!tx.category) return alert('Pick or type a category');
  state.transactions.push(tx);
  saveState();
  formIncome.reset();
  redrawAll();
});
formExpense.addEventListener('submit', e => {
  e.preventDefault();
  const tx = formToTx(formExpense);
  if (!tx.category) return alert('Pick or type a category');
  state.transactions.push(tx);
  saveState();
  formExpense.reset();
  redrawAll();
});

/* ============== Month filtering & sums ============== */
function monthBounds(ym) {
  const [y,m] = ym.split('-').map(Number);
  const start = new Date(y, m-1, 1);
  const end   = new Date(y, m, 0); // last day
  return {start, end};
}
function txForMonth(ym) {
  const {start, end} = monthBounds(ym);
  return state.transactions.filter(t => {
    const d = new Date(t.date);
    return d >= start && d <= end;
  }).sort((a,b) => new Date(a.date) - new Date(b.date));
}
function euro(n) {
  return (n||0).toLocaleString('nl-BE', {style:'currency', currency:'EUR'});
}

/* ============== Chart ============== */
let chart;
function drawChart(ym, txs) {
  const {end} = monthBounds(ym);
  const days = end.getDate();

  const incomePerDay  = Array(days).fill(0);
  const expensePerDay = Array(days).fill(0);

  txs.forEach(t => {
    const day = new Date(t.date).getDate() - 1;
    if (t.type === 'income') incomePerDay[day] += t.amount;
    else expensePerDay[day] += t.amount;
  });

  // Running balance (income - expense) cumulated
  const balance = [];
  let run = 0;
  for (let i=0;i<days;i++) {
    run += incomePerDay[i] - expensePerDay[i];
    balance.push(run);
  }

  const labels = Array.from({length:days}, (_,i)=> String(i+1));

  const ctx = document.getElementById('monthChart').getContext('2d');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Income',  data:incomePerDay,  yAxisID:'y', backgroundColor:'rgba(16,152,69,0.45)' },
        { label:'Expenses',data:expensePerDay, yAxisID:'y', backgroundColor:'rgba(176,0,32,0.45)' },
        { label:'Running Balance', data:balance, type:'line', borderColor:'#2563eb', fill:false, yAxisID:'y1' }
      ]
    },
    options: {
      responsive:true,
      scales: {
        y: { beginAtZero:true, title:{display:true,text:'€ per day'} },
        y1:{ position:'right', beginAtZero:true, grid:{drawOnChartArea:false}, title:{display:true,text:'€ balance'} }
      },
      plugins: { legend:{position:'top'} }
    }
  });
}

/* ============== Overview rendering ============== */
function renderOverview(ym) {
  const txs = txForMonth(ym);
  const inc = txs.filter(t=>t.type==='income').reduce((a,b)=>a+b.amount,0);
  const exp = txs.filter(t=>t.type==='expense').reduce((a,b)=>a+b.amount,0);
  sumIncome.textContent  = euro(inc);
  sumExpense.textContent = euro(exp);
  sumBalance.textContent = euro(inc-exp);

  txList.innerHTML = txs.map(t => `
    <li>
      <div>
        <div><strong>${t.category||'-'}</strong> <span class="muted">(${t.type})</span></div>
        <div class="muted">${new Date(t.date).toLocaleDateString('nl-BE')} ${t.note?('· '+t.note):''}</div>
      </div>
      <div style="min-width:90px;text-align:right;">${euro(t.type==='income'?t.amount:-t.amount)}</div>
    </li>
  `).join('');

  drawChart(ym, txs);
}

/* ============== Boot ============== */
function redrawAll() {
  renderCategoryChips();
  const ym = monthPicker.value || new Date().toISOString().slice(0,7);
  renderOverview(ym);
  // Pre-fill today on active tab’s date input for convenience
  const today = new Date().toISOString().slice(0,10);
  document.querySelectorAll('section.tabpanel.active input[type="date"]').forEach(i => { if (!i.value) i.value = today; });
}
redrawAll();
