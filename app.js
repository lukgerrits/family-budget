// ========================================================
// Family Budget - app.js  (compat-safe; no modern operators)
// ========================================================

const $ = (sel) => document.querySelector(sel);

/* € formatting for Belgium */
const moneyFmt = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' });
function formatMoney(cents) { return moneyFmt.format((cents || 0) / 100); }

/* Parse EU money string -> cents */
function parseMoneyToCents(str) {
  if (!str) return 0;
  var s = String(str).trim();
  s = s.replace(/\s/g, '');
  if (s.indexOf(',') !== -1) s = s.replace(/\./g, '');
  s = s.replace(',', '.').replace(/[^\d.-]/g, '');
  var v = parseFloat(s);
  return isNaN(v) ? 0 : Math.round(v * 100);
}

/* Dates */
function today() { return new Date(); }
function toYMD(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function toYM(d){  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); }

/* State */
var STORAGE_KEY = 'family-budget/v3';

function defaultState(){
  return {
    selectedMonth: toYM(today()),
    categories: { Income:['Salary'], Expense:['Groceries','Rent','Utilities'] },
    transactions: []
  };
}
function loadState(){
  try{
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    var p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return defaultState();

    if (!p.categories || typeof p.categories !== 'object') p.categories = { Income:[], Expense:[] };
    if (!Array.isArray(p.categories.Income))  p.categories.Income  = [];
    if (!Array.isArray(p.categories.Expense)) p.categories.Expense = [];

    if (!Array.isArray(p.transactions)) p.transactions = [];
    if (!p.selectedMonth) p.selectedMonth = toYM(today());
    return p;
  }catch(e){ return defaultState(); }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

var state = loadState();

/* Tabs */
var tabs = Array.prototype.slice.call(document.querySelectorAll('.tabs .tab'));
var panels = { overview:$('#tab-overview'), income:$('#tab-income'), expenses:$('#tab-expenses') };

function activateTab(name){
  tabs.forEach(function(t){ t.classList.toggle('active', t.dataset.tab === name); });
  Object.keys(panels).forEach(function(key){ panels[key].classList.toggle('active', key === name); });
}
tabs.forEach(function(btn){ btn.addEventListener('click', function(){ activateTab(btn.dataset.tab); }); });

/* Month picker */
var monthPicker = $('#monthPicker');
var btnToday = $('#btnToday');
function initMonthPicker(){
  if (monthPicker) monthPicker.value = state.selectedMonth;
  if (monthPicker) monthPicker.addEventListener('change', function(){
    state.selectedMonth = monthPicker.value || toYM(today());
    saveState(); renderAll();
  });
  if (btnToday) btnToday.addEventListener('click', function(){
    state.selectedMonth = toYM(today());
    monthPicker.value = state.selectedMonth;
    saveState(); renderAll();
  });
}

/* Category chips */
var selectedIncomeCat = null;
var selectedExpenseCat = null;

function renderCategoryChips(kind){
  var list = state.categories[kind] || [];
  var box  = (kind === 'Income') ? $('#incomeCats') : $('#expenseCats');
  var sel  = (kind === 'Income') ? selectedIncomeCat : selectedExpenseCat;
  if (!box) return;
  box.innerHTML = '';
  list.forEach(function(cat){
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (sel === cat ? ' selected' : '');
    btn.textContent = cat;
    btn.addEventListener('click', function(){
      if (kind === 'Income'){
        selectedIncomeCat = cat;
        var el = $('#incomeSelectedCat'); if (el) el.textContent = cat;
      } else {
        selectedExpenseCat = cat;
        var el2 = $('#expenseSelectedCat'); if (el2) el2.textContent = cat;
      }
      renderCategoryChips(kind);
    });
    box.appendChild(btn);
  });
}

function addCategory(kind){
  var name = prompt('New ' + kind + ' category name:', '');
  if (!name) return;
  var trimmed = name.trim();
  if (!trimmed) return;
  var arr = state.categories[kind];
  if (arr.indexOf(trimmed) === -1) arr.push(trimmed);
  saveState();
  if (kind === 'Income'){
    selectedIncomeCat = trimmed;
    var el = $('#incomeSelectedCat'); if (el) el.textContent = trimmed;
  } else {
    selectedExpenseCat = trimmed;
    var el2 = $('#expenseSelectedCat'); if (el2) el2.textContent = trimmed;
  }
  renderCategoryChips(kind);
}

/* Month transactions */
function txOfMonth(){
  var ym = state.selectedMonth;
  return state.transactions.filter(function(t){ return (t.date || '').slice(0,7) === ym; });
}

function addOrUpdateTx(kind, data, editingId){
  if (editingId){
    var i = state.transactions.findIndex(function(t){ return t.id === editingId; });
    if (i >= 0) state.transactions[i] = Object.assign({}, state.transactions[i], data);
  } else {
    var id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    state.transactions.push(Object.assign({ id:id, type:kind }, data));
  }
  saveState();
}
function deleteTx(id){
  state.transactions = state.transactions.filter(function(t){ return t.id !== id; });
  saveState();
}

/* Overview */
var chart = null;
function calcSums(trans){
  var inc = 0, exp = 0;
  trans.forEach(function(t){
    if (t.type === 'Income') inc += t.amountCents;
    else exp += t.amountCents;
  });
  return { inc:inc, exp:exp, bal:inc-exp };
}
function renderOverview(){
  var trans = txOfMonth();
  var s = calcSums(trans);
  var el1 = $('#sumIncome');  if (el1) el1.textContent  = formatMoney(s.inc);
  var el2 = $('#sumExpense'); if (el2) el2.textContent = formatMoney(s.exp);
  var el3 = $('#sumBalance'); if (el3) el3.textContent = formatMoney(s.bal);

  var ym = state.selectedMonth.split('-');
  var year = +ym[0], month = (+ym[1]-1);
  var days = new Date(year, month+1, 0).getDate();

  var incomePerDay = Array(days).fill(0);
  var expensePerDay = Array(days).fill(0);

  trans.forEach(function(t){
    var d = new Date(t.date);
    var idx = d.getDate()-1;
    if (idx >= 0 && idx < days){
      if (t.type === 'Income') incomePerDay[idx] += t.amountCents/100;
      else expensePerDay[idx] += t.amountCents/100;
    }
  });

  var runBal = [];
  var running = 0;
  for (var i=0;i<days;i++){
    running += incomePerDay[i] - expensePerDay[i];
    runBal.push(running);
  }
  var labels = Array.from({length:days}, function(_,i){ return String(i+1); });

  var canvas = $('#monthChart');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type:'line',
    data:{
      labels: labels,
      datasets:[
        { label:'Income', data:incomePerDay, borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,.2)', tension:.2 },
        { label:'Expenses', data:expensePerDay, borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,.2)', tension:.2 },
        { label:'Running Balance', data:runBal, borderColor:'#2563eb', backgroundColor:'rgba(37,99,235,.2)', tension:.2 }
      ]
    },
    options:{
      responsive:true,
      plugins:{ legend:{ position:'top' } },
      scales:{
        y:{ ticks:{ callback:function(v){ return moneyFmt.format(v);} } },
        x:{ ticks:{ autoSkip:true, maxTicksLimit:14 } }
      }
    }
  });
}

/* Tables */
function renderTable(kind){
  var isIncome = (kind === 'Income');
  var body  = isIncome ? $('#incomeTbody')  : $('#expenseTbody');
  var total = isIncome ? $('#incomeTotal')  : $('#expenseTotal');
  if (!body || !total) return;

  var trans = txOfMonth().filter(function(t){ return t.type === kind; });
  body.innerHTML = '';
  var sum = 0;

  trans.sort(function(a,b){ return (a.date < b.date) ? -1 : (a.date > b.date) ? 1 : 0; })
       .forEach(function(t){
         sum += t.amountCents;
         var tr = document.createElement('tr');

         var tdD = document.createElement('td'); tdD.textContent = t.date.split('-').reverse().join('/');
         var tdC = document.createElement('td'); tdC.textContent = t.category || '—';
         var tdA = document.createElement('td'); tdA.className='right'; tdA.textContent = formatMoney(t.amountCents);
         var tdN = document.createElement('td'); tdN.textContent = t.note || '';

         var tdAct = document.createElement('td');
         var e = document.createElement('button'); e.type='button'; e.className='ghost'; e.textContent='Edit';
         var d = document.createElement('button'); d.type='button'; d.className='ghost'; d.textContent='Delete';
         e.addEventListener('click', function(){ beginEdit(kind, t.id); });
         d.addEventListener('click', function(){ if (confirm('Delete this transaction?')) { deleteTx(t.id); renderAll(); } });
         tdAct.appendChild(e); tdAct.appendChild(document.createTextNode(' ')); tdAct.appendChild(d);

         tr.appendChild(tdD); tr.appendChild(tdC); tr.appendChild(tdA); tr.appendChild(tdN); tr.appendChild(tdAct);
         body.appendChild(tr);
       });

  total.textContent = formatMoney(sum);
}

/* Forms */
function clearForm(kind){
  if (kind === 'Income'){
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
function beginEdit(kind, id){
  var t = state.transactions.find(function(x){ return x.id === id; });
  if (!t) return;
  if (kind === 'Income'){
    activateTab('income');
    selectedIncomeCat = t.category || null;
    var el = $('#incomeSelectedCat'); if (el) el.textContent = selectedIncomeCat || '—';
    renderCategoryChips('Income');
    $('#incomeEditingId').value = t.id;
    $('#incomeDate').value = t.date;
    $('#incomeAmount').value = (t.amountCents/100).toString().replace('.', ',');
    $('#incomeNote').value = t.note || '';
    $('#incomeSubmit').textContent = 'Save';
  } else {
    activateTab('expenses');
    selectedExpenseCat = t.category || null;
    var el2 = $('#expenseSelectedCat'); if (el2) el2.textContent = selectedExpenseCat || '—';
    renderCategoryChips('Expense');
    $('#expenseEditingId').value = t.id;
    $('#expenseDate').value = t.date;
    $('#expenseAmount').value = (t.amountCents/100).toString().replace('.', ',');
    $('#expenseNote').value = t.note || '';
    $('#expenseSubmit').textContent = 'Save';
  }
}

/* Income form */
var incomeForm = $('#incomeForm');
if (incomeForm) incomeForm.addEventListener('submit', function(e){
  e.preventDefault();
  if (!selectedIncomeCat) return alert('Please select a category (or add one).');
  var date = $('#incomeDate').value;
  var amount = parseMoneyToCents($('#incomeAmount').value);
  if (!date || amount <= 0) return alert('Please enter a valid date and amount.');
  var note = ($('#incomeNote').value || '').trim();
  var editingId = $('#incomeEditingId').value || null;
  addOrUpdateTx('Income', { date:date, category:selectedIncomeCat, amountCents:amount, note:note }, editingId);
  clearForm('Income'); renderAll();
});
var incomeClear = $('#incomeClear'); if (incomeClear) incomeClear.addEventListener('click', function(){ clearForm('Income'); });
var addIncomeCatBtn = $('#addIncomeCat'); if (addIncomeCatBtn) addIncomeCatBtn.addEventListener('click', function(){ addCategory('Income'); });

/* Expense form */
var expenseForm = $('#expenseForm');
if (expenseForm) expenseForm.addEventListener('submit', function(e){
  e.preventDefault();
  if (!selectedExpenseCat) return alert('Please select a category (or add one).');
  var date = $('#expenseDate').value;
  var amount = parseMoneyToCents($('#expenseAmount').value);
  if (!date || amount <= 0) return alert('Please enter a valid date and amount.');
  var note = ($('#expenseNote').value || '').trim();
  var editingId = $('#expenseEditingId').value || null;
  addOrUpdateTx('Expense', { date:date, category:selectedExpenseCat, amountCents:amount, note:note }, editingId);
  clearForm('Expense'); renderAll();
});
var expenseClear = $('#expenseClear'); if (expenseClear) expenseClear.addEventListener('click', function(){ clearForm('Expense'); });
var addExpenseCatBtn = $('#addExpenseCat'); if (addExpenseCatBtn) addExpenseCatBtn.addEventListener('click', function(){ addCategory('Expense'); });

/* Render */
function renderAll(){
  if (monthPicker) monthPicker.value = state.selectedMonth;

  if (!selectedIncomeCat && state.categories.Income.length)  selectedIncomeCat  = state.categories.Income[0];
  if (!selectedExpenseCat && state.categories.Expense.length) selectedExpenseCat = state.categories.Expense[0];
  var incDisp = $('#incomeSelectedCat');  if (incDisp) incDisp.textContent  = selectedIncomeCat  || '—';
  var expDisp = $('#expenseSelectedCat'); if (expDisp) expDisp.textContent = selectedExpenseCat || '—';

  renderCategoryChips('Income');
  renderCategoryChips('Expense');

  renderOverview();
  renderTable('Income');
  renderTable('Expense');
}

/* Boot */
initMonthPicker();
renderAll();
