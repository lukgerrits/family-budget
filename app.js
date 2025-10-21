// ========================================================
// Family Budget - app.js (v5)  — includes Export / Import
// ========================================================

var $ = function(sel){ return document.querySelector(sel); };

/* € formatting (Belgium) */
var moneyFmt = new Intl.NumberFormat('nl-BE', { style:'currency', currency:'EUR' });
function formatMoney(cents){ return moneyFmt.format((cents||0)/100); }

/* Parse EU money string -> cents */
function parseMoneyToCents(str){
  if (!str) return 0;
  var s = String(str).trim();
  s = s.replace(/\s/g,'');
  if (s.indexOf(',') !== -1) s = s.replace(/\./g,'');     // remove thousand dots if comma used
  s = s.replace(',', '.').replace(/[^\d.-]/g,'');         // standardize decimal
  var v = parseFloat(s);
  return isNaN(v) ? 0 : Math.round(v*100);
}

/* Dates */
function today(){ return new Date(); }
function toYM(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }

/* State */
var STORAGE_KEY = 'family-budget/v4';
function defaultState(){
  return {
    selectedMonth: toYM(today()),
    categories: { Income:['Salary'], Expense:['Groceries','Rent','Utilities'] },
    transactions: [] // {id,type,date,category,amountCents,note}
  };
}
function loadState(){
  try{
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    var s = JSON.parse(raw)||{};
    if (!s.selectedMonth) s.selectedMonth = toYM(today());
    if (!s.categories || typeof s.categories!=='object') s.categories = { Income:[], Expense:[] };
    if (!Array.isArray(s.categories.Income))  s.categories.Income  = [];
    if (!Array.isArray(s.categories.Expense)) s.categories.Expense = [];
    if (!Array.isArray(s.transactions)) s.transactions = [];
    return s;
  }catch(e){ return defaultState(); }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

var state = loadState();

/* Tabs */
var tabs = Array.prototype.slice.call(document.querySelectorAll('.tabs .tab'));
var panels = { overview:$('#tab-overview'), income:$('#tab-income'), expenses:$('#tab-expenses') };
function activateTab(name){
  tabs.forEach(function(t){ t.classList.toggle('active', t.dataset.tab===name); });
  Object.keys(panels).forEach(function(k){ panels[k].classList.toggle('active', k===name); });
}
tabs.forEach(function(btn){ btn.addEventListener('click', function(){ activateTab(btn.dataset.tab); }); });

/* Month picker */
var monthPicker = $('#monthPicker');
var btnToday    = $('#btnToday');
function initMonthPicker(){
  if (monthPicker) monthPicker.value = state.selectedMonth;
  if (monthPicker) monthPicker.addEventListener('change', function(){
    state.selectedMonth = monthPicker.value || toYM(today());
    saveState(); renderAll();
  });
  if (btnToday) btnToday.addEventListener('click', function(){
    state.selectedMonth = toYM(today());
    if (monthPicker) monthPicker.value = state.selectedMonth;
    saveState(); renderAll();
  });
}

/* Category chips & selection */
var selectedIncomeCat  = null;
var selectedExpenseCat = null;

function renderCategoryChips(kind){
  var container = (kind==='Income') ? $('#incomeCats') : $('#expenseCats');
  if (!container) return;
  var cats = state.categories[kind] || [];
  var current = (kind==='Income') ? selectedIncomeCat : selectedExpenseCat;

  container.innerHTML = '';
  cats.forEach(function(name){
    var b = document.createElement('button');
    b.type='button';
    b.className = 'chip' + (current===name ? ' selected':'');
    b.textContent = name;
    b.setAttribute('data-action','select-cat');
    b.setAttribute('data-kind', kind);
    b.setAttribute('data-name', name);
    container.appendChild(b);
  });

  // '+ New' chip inside the same bar
  var add = document.createElement('button');
  add.type='button';
  add.className = 'chip new';
  add.textContent = '+ New';
  add.setAttribute('data-action','add-cat');
  add.setAttribute('data-kind', kind);
  container.appendChild(add);
}

function selectCategory(kind, name){
  if (kind==='Income'){
    selectedIncomeCat = name;
    var d = $('#incomeSelectedCat'); if (d) d.textContent = name || '—';
  } else {
    selectedExpenseCat = name;
    var d2 = $('#expenseSelectedCat'); if (d2) d2.textContent = name || '—';
  }
  renderCategoryChips(kind);
}

function addCategory(kind){
  var name = prompt('New ' + kind + ' category name:','');
  if (!name) return;
  name = name.trim();
  if (!name) return;
  var arr = state.categories[kind] || (state.categories[kind]=[]);
  if (arr.indexOf(name) === -1) arr.push(name);
  saveState();
  selectCategory(kind, name);
}

/* Event delegation (chips + optional external buttons) */
document.addEventListener('click', function(e){
  var t = e.target;

  // chip actions
  if (t && t.getAttribute){
    var action = t.getAttribute('data-action');
    var kind   = t.getAttribute('data-kind');

    if (action === 'add-cat' && kind){ e.preventDefault(); addCategory(kind); return; }
    if (action === 'select-cat' && kind){
      var name = t.getAttribute('data-name') || '';
      e.preventDefault(); selectCategory(kind, name); return;
    }
  }

  // legacy buttons (if you kept them)
  if (t && t.closest){
    if (t.closest('#addIncomeCat'))  { e.preventDefault(); addCategory('Income'); return; }
    if (t.closest('#addExpenseCat')) { e.preventDefault(); addCategory('Expense'); return; }
  }
});

/* Transactions helpers */
function txOfMonth(){
  var ym = state.selectedMonth;
  return state.transactions.filter(function(t){ return (t.date||'').slice(0,7)===ym; });
}
function addOrUpdateTx(kind, data, editingId){
  if (editingId){
    var i = state.transactions.findIndex(function(t){ return t.id===editingId; });
    if (i>=0) state.transactions[i] = Object.assign({}, state.transactions[i], data, { type:kind });
  } else {
    var id = Date.now().toString(36)+Math.random().toString(36).slice(2);
    state.transactions.push(Object.assign({ id:id, type:kind }, data));
  }
  saveState();
}
function deleteTx(id){
  state.transactions = state.transactions.filter(function(t){ return t.id!==id; });
  saveState();
}

/* Overview */
var chart = null;
function renderOverview(){
  var trans = txOfMonth();
  var inc = 0, exp = 0;
  trans.forEach(function(t){ if (t.type==='Income') inc+=t.amountCents; else exp+=t.amountCents; });
  var bal = inc-exp;

  var si=$('#sumIncome'), se=$('#sumExpense'), sb=$('#sumBalance');
  if (si) si.textContent = formatMoney(inc);
  if (se) se.textContent = formatMoney(exp);
  if (sb) sb.textContent = formatMoney(bal);

  // Chart
  var mp = state.selectedMonth.split('-'); var year=+mp[0], month=(+mp[1]-1);
  var days = new Date(year, month+1, 0).getDate();
  var incomePer = Array(days).fill(0), expensePer = Array(days).fill(0), runBal = Array(days).fill(0);
  trans.forEach(function(t){
    var d = new Date(t.date+'T00:00:00');
    var idx = d.getDate()-1; if (idx<0||idx>=days) return;
    if (t.type==='Income') incomePer[idx] += t.amountCents/100;
    else expensePer[idx] += t.amountCents/100;
  });
  var r=0; for (var i=0;i<days;i++){ r += (incomePer[i]-expensePer[i]); runBal[i]=r; }
  var labels = Array.from({length:days}, function(_,i){ return String(i+1); });

  var canvas = $('#monthChart'); if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type:'line',
    data:{ labels:labels,
      datasets:[
        { label:'Income', data:incomePer, borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,.2)', tension:.2 },
        { label:'Expenses', data:expensePer, borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,.2)', tension:.2 },
        { label:'Running Balance', data:runBal, borderColor:'#2563eb', backgroundColor:'rgba(37,99,235,.2)', tension:.2 }
      ]},
    options:{
      responsive:true,
      plugins:{ legend:{ position:'top' } },
      scales:{ y:{ ticks:{ callback:function(v){ return moneyFmt.format(v); } } } }
    }
  });
}

/* Tables */
function renderTable(kind){
  var isIncome=(kind==='Income');
  var body = isIncome ? $('#incomeTbody') : $('#expenseTbody');
  var tot  = isIncome ? $('#incomeTotal') : $('#expenseTotal');
  if (!body || !tot) return;

  var rows = txOfMonth().filter(function(t){ return t.type===kind; })
                        .sort(function(a,b){ return a.date<b.date?-1:a.date>b.date?1:0; });

  body.innerHTML='';
  var sum=0;
  rows.forEach(function(t){
    sum += t.amountCents;
    var tr=document.createElement('tr');
    var d = document.createElement('td'); d.textContent = t.date.split('-').reverse().join('/');
    var c = document.createElement('td'); c.textContent = t.category||'—';
    var a = document.createElement('td'); a.className='right'; a.textContent = formatMoney(t.amountCents);
    var n = document.createElement('td'); n.textContent = t.note||'';
    var act = document.createElement('td');
    var be=document.createElement('button'); be.type='button'; be.className='ghost'; be.textContent='Edit';
    var bd=document.createElement('button'); bd.type='button'; bd.className='ghost'; bd.textContent='Delete';
    be.addEventListener('click', function(){ beginEdit(kind, t.id); });
    bd.addEventListener('click', function(){ if (confirm('Delete this transaction?')){ deleteTx(t.id); renderAll(); } });
    act.appendChild(be); act.appendChild(document.createTextNode(' ')); act.appendChild(bd);
    tr.appendChild(d); tr.appendChild(c); tr.appendChild(a); tr.appendChild(n); tr.appendChild(act);
    body.appendChild(tr);
  });

  tot.textContent = formatMoney(sum);
}

/* Forms */
function clearForm(kind){
  if (kind==='Income'){
    $('#incomeEditingId').value=''; $('#incomeDate').value=''; $('#incomeAmount').value=''; $('#incomeNote').value='';
    $('#incomeSubmit').textContent='Add';
  } else {
    $('#expenseEditingId').value=''; $('#expenseDate').value=''; $('#expenseAmount').value=''; $('#expenseNote').value='';
    $('#expenseSubmit').textContent='Add';
  }
}
function beginEdit(kind, id){
  var t = state.transactions.find(function(x){ return x.id===id; }); if (!t) return;
  activateTab(kind.toLowerCase());
  if (kind==='Income'){
    selectedIncomeCat = t.category||null; var disp=$('#incomeSelectedCat'); if (disp) disp.textContent = selectedIncomeCat||'—';
    renderCategoryChips('Income');
    $('#incomeEditingId').value=t.id; $('#incomeDate').value=t.date; $('#incomeAmount').value=(t.amountCents/100).toString().replace('.',','); $('#incomeNote').value=t.note||''; $('#incomeSubmit').textContent='Save';
  } else {
    selectedExpenseCat = t.category||null; var disp2=$('#expenseSelectedCat'); if (disp2) disp2.textContent = selectedExpenseCat||'—';
    renderCategoryChips('Expense');
    $('#expenseEditingId').value=t.id; $('#expenseDate').value=t.date; $('#expenseAmount').value=(t.amountCents/100).toString().replace('.',','); $('#expenseNote').value=t.note||''; $('#expenseSubmit').textContent='Save';
  }
}

/* Income form */
var incomeForm = $('#incomeForm');
if (incomeForm) incomeForm.addEventListener('submit', function(e){
  e.preventDefault();
  if (!selectedIncomeCat) return alert('Please select a category (or add one).');
  var date = $('#incomeDate').value;
  var cents = parseMoneyToCents($('#incomeAmount').value);
  if (!date || cents<=0) return alert('Please enter a valid date and amount.');
  var note = ($('#incomeNote').value||'').trim();
  var editingId = $('#incomeEditingId').value || null;
  addOrUpdateTx('Income', { date:date, category:selectedIncomeCat, amountCents:cents, note:note }, editingId);
  clearForm('Income'); renderAll();
});
var incomeClear = $('#incomeClear'); if (incomeClear) incomeClear.addEventListener('click', function(){ clearForm('Income'); });

/* Expense form */
var expenseForm = $('#expenseForm');
if (expenseForm) expenseForm.addEventListener('submit', function(e){
  e.preventDefault();
  if (!selectedExpenseCat) return alert('Please select a category (or add one).');
  var date = $('#expenseDate').value;
  var cents = parseMoneyToCents($('#expenseAmount').value);
  if (!date || cents<=0) return alert('Please enter a valid date and amount.');
  var note = ($('#expenseNote').value||'').trim();
  var editingId = $('#expenseEditingId').value || null;
  addOrUpdateTx('Expense', { date:date, category:selectedExpenseCat, amountCents:cents, note:note }, editingId);
  clearForm('Expense'); renderAll();
});
var expenseClear = $('#expenseClear'); if (expenseClear) expenseClear.addEventListener('click', function(){ clearForm('Expense'); });

/* ---------- EXPORT / IMPORT ---------- */
function exportBackup(){
  try{
    var payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: state
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    var ymd = new Date().toISOString().slice(0,10);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'family-budget-backup-' + ymd + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 0);
  }catch(err){
    alert('Export failed: ' + (err && err.message ? err.message : String(err)));
  }
}

function validateImported(obj){
  // very light validation
  if (!obj || typeof obj !== 'object') return 'Invalid JSON';
  var data = obj.data || obj; // allow raw state or wrapped payload
  if (!data.categories || typeof data.categories!=='object') return 'Missing categories';
  if (!Array.isArray(data.categories.Income) || !Array.isArray(data.categories.Expense)) return 'Bad categories';
  if (!Array.isArray(data.transactions)) return 'Missing transactions';
  // sanitize transactions
  data.transactions = data.transactions.map(function(t){
    return {
      id: (t.id || (Date.now().toString(36)+Math.random().toString(36).slice(2))),
      type: (t.type==='Income' ? 'Income' : 'Expense'),
      date: (t.date || new Date().toISOString().slice(0,10)),
      category: (t.category || ''),
      amountCents: (typeof t.amountCents==='number' ? t.amountCents : parseMoneyToCents(t.amount)),
      note: (t.note || '')
    };
  });
  if (!data.selectedMonth) data.selectedMonth = toYM(today());
  return data;
}

function importBackupFile(file){
  var reader = new FileReader();
  reader.onload = function(){
    try{
      var obj = JSON.parse(reader.result);
      var data = validateImported(obj);
      if (typeof data === 'string') { alert('Import failed: ' + data); return; }
      state = data;
      saveState();
      renderAll();
      alert('Import successful.');
    }catch(err){
      alert('Import failed: ' + (err && err.message ? err.message : String(err)));
    }
  };
  reader.onerror = function(){ alert('Could not read file.'); };
  reader.readAsText(file);
}

/* Wire Export/Import buttons (and hidden file input) */
var btnExport = $('#btnExport');
if (btnExport) btnExport.addEventListener('click', exportBackup);

var fileImport = $('#fileImport');
if (fileImport) fileImport.addEventListener('change', function(){
  if (fileImport.files && fileImport.files[0]) importBackupFile(fileImport.files[0]);
  fileImport.value = ''; // reset so same file can be re-chosen
});

/* Render all */
function renderAll(){
  if (monthPicker) monthPicker.value = state.selectedMonth;

  // default category if none selected
  if (!selectedIncomeCat && state.categories.Income && state.categories.Income.length) selectedIncomeCat = state.categories.Income[0];
  if (!selectedExpenseCat && state.categories.Expense && state.categories.Expense.length) selectedExpenseCat = state.categories.Expense[0];
  var incDisp=$('#incomeSelectedCat'); if (incDisp) incDisp.textContent = selectedIncomeCat||'—';
  var expDisp=$('#expenseSelectedCat'); if (expDisp) expDisp.textContent = selectedExpenseCat||'—';

  renderCategoryChips('Income');
  renderCategoryChips('Expense');

  renderOverview();
  renderTable('Income');
  renderTable('Expense');
}

/* Init */
initMonthPicker();
activateTab('overview');
renderAll();
