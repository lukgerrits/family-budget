// ========================================================
// Family Budget - app.js (v21)
// - Permanent storage key (no more version bumps losing data)
// - Auto-migrate from v5/v4/v3 into permanent key
// - Rolling auto-backups (last 7) in localStorage
// - Month filter can be cleared (shows ALL entries)
// - Overview: bars (Income/Expenses per day) + line (Running total, all time) with dual axes
// - Envelopes tab:
//    - shows prorated average spend per category (31-day month) as "Avg spent / month"
//    - donut split: green up to avg, red over avg, grey remaining to budget
//    - budgets editable + “Use averages for all”
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

/* ---------- Storage (permanent key + migration + backups) ---------- */
const MAIN_KEY = 'family-budget/main';
const LEGACY_KEYS = ['family-budget/v5', 'family-budget/v4', 'family-budget/v3'];
const BACKUPS_KEY = 'family-budget/autobackups';

function defaultState() {
  return {
    version: 1,
    selectedMonth: toYM(today()),        // null = ALL
    categories: {
      Income: ['Cash','Huur','Kinderbijslag','Andere'],
      Expense: ['Boodschappen','Aflossing Lening','Water','School','Kledij','Dokter/apothek','Hobby','Resto/Take-Away','Vakantie','Andere']
    },
    budgets: { Expense: {} },            // {Expense:{cat: cents}}
    transactions: [] // {id,type,date,category,amountCents,note}
  };
}
function normalizeState(s) {
  if (!s || typeof s !== 'object') return defaultState();
  if (!('version' in s)) s.version = 1;
  if (!('selectedMonth' in s)) s.selectedMonth = toYM(today());
  if (!s.categories || typeof s.categories !== 'object') s.categories = { Income: [], Expense: [] };
  if (!Array.isArray(s.categories.Income)) s.categories.Income = [];
  if (!Array.isArray(s.categories.Expense)) s.categories.Expense = [];
  if (!Array.isArray(s.transactions)) s.transactions = [];
  if (!s.budgets || typeof s.budgets !== 'object') s.budgets = { Expense: {} };
  if (!s.budgets.Expense || typeof s.budgets.Expense !== 'object') s.budgets.Expense = {};
  return s;
}
function migrateLegacy() {
  for (const k of LEGACY_KEYS) {
    const raw = localStorage.getItem(k);
    if (raw) {
      try {
        const migrated = normalizeState(JSON.parse(raw) || {});
        localStorage.setItem(MAIN_KEY, JSON.stringify(migrated));
        return migrated;
      } catch {}
    }
  }
  return null;
}
function loadState() {
  try {
    let raw = localStorage.getItem(MAIN_KEY);
    if (!raw) {
      const migrated = migrateLegacy();
      if (migrated) return migrated;
      return defaultState();
    }
    const s = normalizeState(JSON.parse(raw) || {});
    return s;
  } catch {
    return defaultState();
  }
}
function saveState() {
  localStorage.setItem(MAIN_KEY, JSON.stringify(state));
  // rolling auto-backups (keep last 7)
  try {
    const arr = JSON.parse(localStorage.getItem(BACKUPS_KEY) || '[]');
    arr.unshift({ at: new Date().toISOString(), data: state });
    localStorage.setItem(BACKUPS_KEY, JSON.stringify(arr.slice(0, 7)));
  } catch {}
}

let state = loadState();

/* If selected month has no entries but data exists, jump to latest populated month */
if (state.transactions.length &&
    (!state.selectedMonth ||
     !state.transactions.some(t => (t.date || '').slice(0,7) === state.selectedMonth))) {
  const months = Array.from(new Set(state.transactions.map(t => (t.date||'').slice(0,7)).filter(Boolean))).sort();
  if (months.length) { state.selectedMonth = months[months.length - 1]; saveState(); }
}

/* Tabs */
const tabs = Array.from(document.querySelectorAll('.tabs .tab'));
const panels = { overview: $('#tab-overview'), income: $('#tab-income'), expenses: $('#tab-expenses'), envelopes: $('#tab-envelopes') };
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
  monthPicker.value = state.selectedMonth || '';
  monthPicker.placeholder = 'All months';
}
function initMonthPicker() {
  setMonthUIFromState();
  if (monthPicker) monthPicker.addEventListener('change', () => {
    state.selectedMonth = monthPicker.value || null;
    saveState(); renderAll();
  });
  if (btnToday) btnToday.addEventListener('click', () => {
    state.selectedMonth = toYM(today());
    setMonthUIFromState(); saveState(); renderAll();
  });
  if (btnClearMonth) btnClearMonth.addEventListener('click', () => {
    state.selectedMonth = null;
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

/* Transactions helpers */
function txFiltered() {
  const ym = state.selectedMonth;
  if (!ym) return state.transactions.slice();
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
function getDistinctMonths() {
  const set = new Set(state.transactions.map(t => (t.date || '').slice(0,7)).filter(Boolean));
  return Array.from(set).sort();
}

/* Colors */
const COLORS = {
  income:  { line: '#5CC9A7', fill: 'rgba(92,201,167,0.35)' },
  expense: { line: '#F07C7C', fill: 'rgba(240,124,124,0.35)' },
  balance: { line: '#F6A034', fill: 'rgba(246,160,52,0.18)' },
  axis: { text: '#555555', grid: '#EAEAEA', legend: '#333333' }
};

/* Helpers for charts */
function sortByDateAsc(arr) { return [...arr].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0); }
function buildDailySeries(allTx) {
  const incomeMap = new Map(), expenseMap = new Map();
  for (const t of allTx) {
    const k = t.date;
    if (t.type === 'Income') incomeMap.set(k, (incomeMap.get(k)||0) + t.amountCents);
    else expenseMap.set(k, (expenseMap.get(k)||0) + t.amountCents);
  }
  const dates = Array.from(new Set([...incomeMap.keys(), ...expenseMap.keys()])).sort();
  const labels=[], incomeVals=[], expenseVals=[], runningVals=[];
  let acc=0;
  for (const d of dates) {
    const inc = incomeMap.get(d)||0, exp = expenseMap.get(d)||0;
    acc += inc - exp;
    labels.push(d);
    incomeVals.push(inc/100);
    expenseVals.push(-(exp/100)); // negative bars (visually distinct)
    runningVals.push(acc/100);
  }
  return { labels, incomeVals, expenseVals, runningVals };
}

/* -------- Overview (mixed chart) -------- */
let chart = null;
function renderOverview() {
  // Cards
  const scoped = txFiltered();
  let inc = 0, exp = 0;
  scoped.forEach(t => { if (t.type==='Income') inc+=t.amountCents; else exp+=t.amountCents; });
  const bal = inc - exp;
  $('#sumIncome').textContent = formatMoney(inc);
  $('#sumExpense').textContent = formatMoney(exp);
  $('#sumBalance').textContent = formatMoney(bal);

  // Chart
  const allSorted = sortByDateAsc(state.transactions);
  const { labels, incomeVals, expenseVals, runningVals } = buildDailySeries(allSorted);
  const canvas = $('#monthChart'); if (!canvas) return;
  const ctx = canvas.getContext('2d'); if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length?labels:['No data'],
      datasets: [
        { type:'bar', label:'Income', data: incomeVals.length?incomeVals:[0],
          backgroundColor: COLORS.income.fill, borderColor: COLORS.income.line, borderWidth:1, yAxisID:'yBars', order:1 },
        { type:'bar', label:'Expenses', data: expenseVals.length?expenseVals:[0],
          backgroundColor: COLORS.expense.fill, borderColor: COLORS.expense.line, borderWidth:1, yAxisID:'yBars', order:1 },
        { type:'line', label:'Running Total (All Time)', data: runningVals.length?runningVals:[0],
          borderColor: COLORS.balance.line, backgroundColor: COLORS.balance.fill, pointBackgroundColor: COLORS.balance.line,
          borderWidth:2, tension:0.25, fill:false, yAxisID:'yTotal', order:2 }
      ]
    },
    options: {
      responsive:true,
      plugins:{
        legend:{ position:'top', labels:{ color:COLORS.axis.legend }},
        tooltip:{ callbacks:{
          label:(ctx)=>{
            const v=ctx.parsed.y, name=ctx.dataset.label;
            if (name==='Income'||name==='Expenses') return ` ${name}: ${moneyFmt.format(Math.abs(v))}`;
            const prev=ctx.dataIndex>0?ctx.dataset.data[ctx.dataIndex-1]:0;
            const delta=v-prev; return ` ${name}: ${moneyFmt.format(v)} (Δ ${moneyFmt.format(delta)})`;
          }
        }}
      },
      scales:{
        x:{ grid:{ color:COLORS.axis.grid }, ticks:{ color:COLORS.axis.text }},
        yBars:{ position:'left', grid:{ color:COLORS.axis.grid }, ticks:{ color:COLORS.axis.text, callback:v=>moneyFmt.format(v) }, title:{ display:true, text:'Daily amounts' }},
        yTotal:{ position:'right', grid:{ drawOnChartArea:false }, ticks:{ color:COLORS.axis.text, callback:v=>moneyFmt.format(v) }, title:{ display:true, text:'Running total' }}
      }
    }
  });
}

/* -------- Envelopes (budgets) -------- */
let envelopeCharts = [];

function sumExpensesByCategory(month /* null=all */) {
  const map=new Map();
  const txs = state.transactions.filter(t=>t.type==='Expense' && (!month || (t.date||'').slice(0,7)===month));
  for (const t of txs) {
    const k=t.category||'—';
    map.set(k,(map.get(k)||0)+t.amountCents);
  }
  return map;
}

/**
 * Prorated average to a 31-day month:
 * avg31 = (total cents / total days covered) * 31
 * day coverage = from first expense date to last expense date (inclusive)
 */
function averageExpensesPerMonthByCategory() {
  const txs = state.transactions.filter(t => t.type === 'Expense' && t.date);
  if (!txs.length) return new Map();

  const timestamps = txs.map(t => new Date(t.date).getTime()).filter(n => Number.isFinite(n));
  if (!timestamps.length) return new Map();

  const minDate = new Date(Math.min.apply(null, timestamps));
  const maxDate = new Date(Math.max.apply(null, timestamps));

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const dayCount = Math.max(Math.round((maxDate - minDate) / MS_PER_DAY) + 1, 1);

  const totals = sumExpensesByCategory(null);

  const avg = new Map();
  for (const [cat, cents] of totals.entries()) {
    const perDay = cents / dayCount;
    avg.set(cat, Math.round(perDay * 31));
  }
  return avg;
}

function setBudget(cat, cents) {
  state.budgets.Expense[cat] = Math.max(0, cents|0);
  saveState(); renderEnvelopes();
}
function useAveragesForAllBudgets() {
  const avg = averageExpensesPerMonthByCategory();
  for (const cat of new Set([...(state.categories.Expense||[]), ...avg.keys()])) {
    state.budgets.Expense[cat] = avg.get(cat) || 0;
  }
  saveState(); renderEnvelopes();
}
$('#btnBudgetsFromAvg')?.addEventListener('click', useAveragesForAllBudgets);

function renderEnvelopes() {
  const grid = $('#envelopeGrid'); if (!grid) return;

  envelopeCharts.forEach(ch=>{ try{ ch.destroy(); }catch{} });
  envelopeCharts=[];

  const avg = averageExpensesPerMonthByCategory();
  const spentMap = avg;

  const cats = Array.from(new Set([
    ...(state.categories.Expense||[]),
    ...avg.keys(),
    ...Object.keys(state.budgets.Expense),
    ...spentMap.keys()
  ]));

  grid.innerHTML='';

  cats.forEach(cat=>{
    const avgCents = avg.get(cat)||0;
    const budgetCents = (state.budgets.Expense[cat] ?? 0) || avgCents; // fallback to avg
    const spentCents = spentMap.get(cat)||0;

    const card = document.createElement('div'); card.className='envelope-card';

    const donutWrap = document.createElement('div'); donutWrap.className='donut-wrap';
    if (spentCents > budgetCents) {
      const tag=document.createElement('div'); tag.className='over-tag'; tag.textContent='OVER';
      donutWrap.appendChild(tag);
    }

    const canvas=document.createElement('canvas'); canvas.width=120; canvas.height=120; donutWrap.appendChild(canvas);

    const meta = document.createElement('div'); meta.className='env-meta';
    const title=document.createElement('div'); title.className='env-title'; title.textContent=cat||'—';

    const line1=document.createElement('div'); line1.className='env-line';
    line1.innerHTML = `Budget: <span class="env-strong">${formatMoney(budgetCents)}</span>`;

    const line2=document.createElement('div'); line2.className='env-line';
    const delta = budgetCents - spentCents;
    line2.innerHTML =
      `Avg spent / month: <span class="env-strong">${formatMoney(spentCents)}</span> • ` +
      `${delta >= 0 ? 'Avg under' : 'Avg over'}: <span class="env-strong">${formatMoney(Math.abs(delta))}</span>`;

    const controls=document.createElement('div'); controls.className='env-controls';
    const input=document.createElement('input'); input.type='text'; input.className='budget-input';
    input.value = budgetCents ? (budgetCents/100).toString().replace('.',',') : '';
    input.placeholder='€ 0,00';
    input.title='Set monthly budget';
    input.addEventListener('change',()=> setBudget(cat, parseMoneyToCents(input.value)));

    const btnAvg=document.createElement('button'); btnAvg.className='btn-mini'; btnAvg.type='button'; btnAvg.textContent='Use avg';
    btnAvg.title='Set budget to your average';
    btnAvg.addEventListener('click',()=> setBudget(cat, avgCents));
    controls.appendChild(input); controls.appendChild(btnAvg);

    meta.appendChild(title); meta.appendChild(line1); meta.appendChild(line2); meta.appendChild(controls);
    card.appendChild(donutWrap); card.appendChild(meta);
    grid.appendChild(card);

// ------------------------
// Donut split vs BUDGET:
//   Green = up to budget
//   Red   = over budget
//   Grey  = remaining under budget
// ------------------------
const budget = Math.max(budgetCents, 0);
const spent = Math.max(spentCents, 0); // this is your avg/month

const withinBudget = Math.min(spent, budget);
const overBudget = Math.max(spent - budget, 0);
const remaining = Math.max(budget - spent, 0);

const ctx = canvas.getContext('2d');
const donut = new Chart(ctx, {
  type: 'doughnut',
  data: {
    labels: ['Within budget', 'Over budget', 'Remaining'],
    datasets: [{
      data: [withinBudget/100, overBudget/100, remaining/100],
      backgroundColor: [
        COLORS.income.line,      // green
        '#D64545',               // red
        'rgba(17,24,39,0.08)'    // grey
      ],
      borderWidth: 0
    }]
  },
  options: {
    cutout: '70%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: (c) => ` ${c.label}: ${moneyFmt.format(c.parsed)}` }
      }
    }
  }
});

envelopeCharts.push(donut);
  });
}

/* -------- Tables -------- */
function renderTable(kind) {
  const isIncome = (kind==='Income');
  const body = isIncome?$('#incomeTbody'):$('#expenseTbody');
  const tot  = isIncome?$('#incomeTotal'):$('#expenseTotal');
  if (!body||!tot) return;

  const rows = txFiltered().filter(t=>t.type===kind).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  body.innerHTML='';

  let sum=0;
  rows.forEach(t=>{
    sum+=t.amountCents;
    const tr=document.createElement('tr');
    const d=document.createElement('td'); d.textContent=t.date.split('-').reverse().join('/');
    const c=document.createElement('td'); c.textContent=t.category||'—';
    const a=document.createElement('td'); a.className='right'; a.textContent=formatMoney(t.amountCents);
    const n=document.createElement('td'); n.textContent=t.note||'';
    const act=document.createElement('td');
    const be=document.createElement('button'); be.type='button'; be.className='ghost'; be.textContent='Edit';
    const bd=document.createElement('button'); bd.type='button'; bd.className='ghost'; bd.textContent='Delete';
    be.addEventListener('click',()=>beginEdit(kind,t.id));
    bd.addEventListener('click',()=>{ if(confirm('Delete this transaction?')){ deleteTx(t.id); renderAll(); }});
    act.appendChild(be); act.appendChild(document.createTextNode(' ')); act.appendChild(bd);
    tr.appendChild(d); tr.appendChild(c); tr.appendChild(a); tr.appendChild(n); tr.appendChild(act);
    body.appendChild(tr);
  });
  tot.textContent=formatMoney(sum);
}

/* -------- Forms -------- */
function clearForm(kind){
  if(kind==='Income'){
    $('#incomeEditingId').value=''; $('#incomeDate').value=''; $('#incomeAmount').value=''; $('#incomeNote').value='';
    $('#incomeSubmit').textContent='Add';
  }else{
    $('#expenseEditingId').value=''; $('#expenseDate').value=''; $('#expenseAmount').value=''; $('#expenseNote').value='';
    $('#expenseSubmit').textContent='Add';
  }
}
function beginEdit(kind,id){
  const t=state.transactions.find(x=>x.id===id); if(!t) return;
  activateTab(kind.toLowerCase());
  if(kind==='Income'){
    selectedIncomeCat=t.category||null; $('#incomeSelectedCat').textContent=selectedIncomeCat||'—';
    renderCategoryChips('Income');
    $('#incomeEditingId').value=t.id; $('#incomeDate').value=t.date; $('#incomeAmount').value=(t.amountCents/100).toString().replace('.',','); $('#incomeNote').value=t.note||''; $('#incomeSubmit').textContent='Save';
  }else{
    selectedExpenseCat=t.category||null; $('#expenseSelectedCat').textContent=selectedExpenseCat||'—';
    renderCategoryChips('Expense');
    $('#expenseEditingId').value=t.id; $('#expenseDate').value=t.date; $('#expenseAmount').value=(t.amountCents/100).toString().replace('.',','); $('#expenseNote').value=t.note||''; $('#expenseSubmit').textContent='Save';
  }
}

/* Submit handlers */
$('#incomeForm')?.addEventListener('submit',(e)=>{
  e.preventDefault();
  if(!selectedIncomeCat) return alert('Please select a category (or add one).');
  const date=$('#incomeDate').value; const cents=parseMoneyToCents($('#incomeAmount').value);
  if(!date||cents<=0) return alert('Please enter a valid date and amount.');
  const note=($('#incomeNote').value||'').trim(); const id=$('#incomeEditingId').value||null;
  addOrUpdateTx('Income',{date,category:selectedIncomeCat,amountCents:cents,note},id);
  clearForm('Income'); renderAll();
});
$('#incomeClear')?.addEventListener('click',()=>clearForm('Income'));

$('#expenseForm')?.addEventListener('submit',(e)=>{
  e.preventDefault();
  if(!selectedExpenseCat) return alert('Please select a category (or add one).');
  const date=$('#expenseDate').value; const cents=parseMoneyToCents($('#expenseAmount').value);
  if(!date||cents<=0) return alert('Please enter a valid date and amount.');
  const note=($('#expenseNote').value||'').trim(); const id=$('#expenseEditingId').value||null;
  addOrUpdateTx('Expense',{date,category:selectedExpenseCat,amountCents:cents,note},id);
  clearForm('Expense'); renderAll();
});
$('#expenseClear')?.addEventListener('click',()=>clearForm('Expense'));

/* Export / Import */
function exportBackup(){
  try{
    const payload={version:1,exportedAt:new Date().toISOString(),data:state};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const ymd=new Date().toISOString().slice(0,10);
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='family-budget-backup-'+ymd+'.json';
    document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); document.body.removeChild(a);},0);
  }catch(err){ alert('Export failed: '+(err?.message||String(err))); }
}
function validateImported(obj){
  if(!obj||typeof obj!=='object') return 'Invalid JSON';
  const data=obj.data||obj;
  if(!data.categories||typeof data.categories!=='object') return 'Missing categories';
  if(!Array.isArray(data.categories.Income)||!Array.isArray(data.categories.Expense)) return 'Bad categories';
  if(!Array.isArray(data.transactions)) return 'Missing transactions';
  if(!data.budgets||typeof data.budgets!=='object') data.budgets={Expense:{}};
  if(!data.budgets.Expense||typeof data.budgets.Expense!=='object') data.budgets.Expense={};
  data.transactions=data.transactions.map(t=>({
    id:(t.id||(Date.now().toString(36)+Math.random().toString(36).slice(2))),
    type:(t.type==='Income'?'Income':'Expense'),
    date:(t.date||new Date().toISOString().slice(0,10)),
    category:(t.category||''),
    amountCents:(typeof t.amountCents==='number'?t.amountCents:parseMoneyToCents(t.amount)),
    note:(t.note||'')
  }));
  if(!('selectedMonth' in data)) data.selectedMonth=toYM(today());
  return data;
}
function importBackupFile(file){
  const reader=new FileReader();
  reader.onload=function(){
    try{
      const obj=JSON.parse(reader.result);
      const data=validateImported(obj);
      if(typeof data==='string') return alert('Import failed: '+data);
      state=data; saveState(); renderAll(); alert('Import successful.');
    }catch(err){ alert('Import failed: '+(err?.message||String(err))); }
  };
  reader.onerror=()=>alert('Could not read file.');
  reader.readAsText(file);
}
function importCSVFile(file){
  const reader=new FileReader();
  reader.onload=function(){
    try{
      const text=reader.result;
      const rows=text.split(/\r?\n/).filter(r=>r.trim()!=='');
      const headers=rows[0].split(/,|;|\t/).map(h=>h.trim().toLowerCase());
      const txs=[];
      for(let i=1;i<rows.length;i++){
        const cols=rows[i].split(/,|;|\t/); if(cols.length<4) continue;
        let rawDate=(cols[headers.indexOf('date')]||'').trim(); let date='';
        if(/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)){const[d,m,y]=rawDate.split('/'); date=`${y}-${m}-${d}`;}
        else if(/^\d{4}-\d{2}-\d{2}$/.test(rawDate)){date=rawDate;} else {date=new Date().toISOString().slice(0,10);}
        const type=(/income/i).test(cols[headers.indexOf('type')])?'Income':'Expense';
        const category=cols[headers.indexOf('category')]?.trim()||'';
        const amountCents=parseMoneyToCents(cols[headers.indexOf('amount')]||'0');
        const note=cols[headers.indexOf('note')]?.trim()||'';
        txs.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2),type,date,category,amountCents,note});
      }
      state.transactions=state.transactions.concat(txs);
      saveState(); renderAll(); alert('CSV import successful: '+txs.length+' rows added.');
    }catch(err){ alert('CSV import failed: '+err.message); }
  };
  reader.readAsText(file);
}
$('#btnExport')?.addEventListener('click',exportBackup);
const fileImport=$('#fileImport'), btnImport=$('#btnImport');
btnImport&&fileImport&&btnImport.addEventListener('click',()=>fileImport.click());
fileImport&&fileImport.addEventListener('change',()=>{
  const f=fileImport.files&&fileImport.files[0]; if(!f) return;
  const name=f.name.toLowerCase(); if(name.endsWith('.csv')) importCSVFile(f); else importBackupFile(f);
  fileImport.value='';
});

/* Init */
function renderAll(){
  setMonthUIFromState();
  if(!selectedIncomeCat && state.categories.Income?.length) selectedIncomeCat=state.categories.Income[0];
  if(!selectedExpenseCat && state.categories.Expense?.length) selectedExpenseCat=state.categories.Expense[0];
  $('#incomeSelectedCat').textContent=selectedIncomeCat||'—';
  $('#expenseSelectedCat').textContent=selectedExpenseCat||'—';
  renderCategoryChips('Income'); renderCategoryChips('Expense');
  renderOverview();
  renderTable('Income'); renderTable('Expense');
  renderEnvelopes();
}
initMonthPicker(); activateTab('overview'); renderAll();
