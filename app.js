/* ==========================================================
   Family Budget – app.js
   - Tab-driven type
   - Category chips with + New
   - No transaction list on Overview
   ========================================================== */

const $ = (s) => document.querySelector(s);

function isoDate(d = new Date()) {
  const p = (n) => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function formatMoney(n){ return Number(n||0).toLocaleString('nl-BE',{style:'currency',currency:'EUR'}); }
function uid(){ return Math.random().toString(36).slice(2,9)+Date.now().toString(36); }
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

const STORAGE_KEY='family-budget/v2';
let state = load();

function load(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    const base={
      selectedMonth: isoDate().slice(0,7),
      transactions: [],
      categories: { Income: ['Salary'], Expense: ['Groceries','Rent','Utilities'] }
    };
    if(!raw) {
      return base;
    }
    const p=JSON.parse(raw);
    // shape safety
    p.transactions = Array.isArray(p.transactions)?p.transactions:[];
    if(!p.categories || typeof p.categories!=='object'){
      p.categories = { Income:[], Expense:[] };
    }
    // if categories missing, seed from transactions
    ['Income','Expense'].forEach(t=>{
      if(!Array.isArray(p.categories[t])) p.categories[t]=[];
    });
    if (p.categories.Income.length===0 || p.categories.Expense.length===0){
      const fromTx = { Income:new Set(), Expense:new Set() };
      (p.transactions||[]).forEach(tx=>{ if(fromTx[tx.type]) fromTx[tx.type].add(tx.category||''); });
      if (p.categories.Income.length===0) p.categories.Income = Array.from(fromTx.Income).filter(Boolean);
      if (p.categories.Expense.length===0) p.categories.Expense = Array.from(fromTx.Expense).filter(Boolean);
    }
    return {...base,...p};
  }catch{
    return {
      selectedMonth: isoDate().slice(0,7),
      transactions: [],
      categories: { Income: ['Salary'], Expense: ['Groceries','Rent','Utilities'] }
    };
  }
}
function save(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }

/* ---------- Current form type = active tab ---------- */
let currentTab = 'overview';
function currentFormType(){
  return currentTab==='income' ? 'Income'
       : currentTab==='expenses' ? 'Expense'
       : 'Expense';
}

/* ---------- Month picker & today ---------- */
const monthPicker = $('#monthPicker');
if (monthPicker){
  monthPicker.value = state.selectedMonth;
  monthPicker.addEventListener('change', ()=>{
    state.selectedMonth = monthPicker.value || isoDate().slice(0,7);
    save(); renderAll();
  });
}
$('#btnToday')?.addEventListener('click',()=>{
  const d=$('#txDate'); if(d) d.value=isoDate(new Date());
});

/* ---------- Category Chips ---------- */
let selectedCategory = ''; // the chip the user clicked

function renderCategoryChips(){
  const wrap = $('#catChips'); if(!wrap) return;
  const type = currentFormType();
  const cats = [...new Set((state.categories[type]||[]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'nl'));

  wrap.innerHTML = cats.map(c => `
    <button type="button" class="chip ${selectedCategory===c?'active':''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>
  `).join('');

  wrap.querySelectorAll('.chip').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      selectedCategory = btn.dataset.cat;
      wrap.querySelectorAll('.chip').forEach(b=>b.classList.toggle('active', b===btn));
    });
  });
}

$('#addCatBtn')?.addEventListener('click', ()=>{
  const type = currentFormType();
  const name = prompt(`New ${type} category name:`);
  if (!name) return;
  const clean = name.trim();
  if (!clean) return;

  if (!state.categories[type]) state.categories[type]=[];
  if (!state.categories[type].includes(clean)) {
    state.categories[type].push(clean);
    save();
  }
  selectedCategory = clean;
  renderCategoryChips();
});

/* ---------- Expose tab-change hook from HTML ---------- */
function setFormTypeBadge(){
  const b = $('#formTypeBadge'); if(!b) return;
  const t = currentFormType();
  b.textContent = `Type: ${t}`;
  b.style.borderColor = t==='Income' ? '#16a34a' : '#b91c1c';
  b.style.color      = t==='Income' ? '#166534' : '#7f1d1d';
}
window.onTabActivated = function(name){
  currentTab = name;
  setFormTypeBadge();
  if (currentTab==='overview') {
    // keep form usable but default to Expense
    selectedCategory = '';
  } else {
    selectedCategory = '';
  }
  renderCategoryChips();
};

/* ---------- Add/Edit/Delete ---------- */
let editId = null;

function enterEditMode(tx){
  editId = tx.id;
  $('#txDate').value = tx.date || isoDate();
  // ensure category exists in current type set, switch to that tab
  window.onTabActivated?.(tx.type==='Income' ? 'income' : 'expenses');
  if (!state.categories[tx.type]) state.categories[tx.type]=[];
  if (!state.categories[tx.type].includes(tx.category)) {
    state.categories[tx.type].push(tx.category);
    save();
  }
  selectedCategory = tx.category;
  renderCategoryChips();
  $('#txAmount').value = String(tx.amount).replace('.',',');
  $('#txNote').value = tx.note || '';
  $('#txSubmit').textContent='Save';
  $('#clearForm').textContent='Cancel';
}

function exitEditMode(){
  editId=null;
  $('#txSubmit').textContent='Add';
  $('#clearForm').textContent='Clear';
  selectedCategory='';
  renderCategoryChips();
}

const form = $('#txForm');
form?.addEventListener('submit',(e)=>{
  e.preventDefault();
  const type = currentFormType();

  if (!selectedCategory) {
    alert('Please choose a category (or add a new one).');
    return;
  }

  const amount = Number(String($('#txAmount').value||'0').replace(/\./g,'').replace(',','.'));
  if (isNaN(amount)) { alert('Enter a valid amount'); return; }

  const tx = {
    type,
    date: $('#txDate').value || isoDate(),
    category: selectedCategory,
    amount,
    note: $('#txNote').value || ''
  };

  if(editId){
    const i=state.transactions.findIndex(t=>t.id===editId);
    if(i>=0) state.transactions[i]={...state.transactions[i],...tx};
    exitEditMode();
  }else{
    state.transactions.push({id:uid(),...tx});
  }
  // persist category if it is new
  if (!state.categories[type]) state.categories[type]=[];
  if (!state.categories[type].includes(selectedCategory)) {
    state.categories[type].push(selectedCategory);
  }

  save(); renderAll();
  form.reset();
  $('#txDate').value = isoDate();
});

$('#clearForm')?.addEventListener('click',(e)=>{
  e.preventDefault();
  if(editId) exitEditMode();
  form.reset();
  $('#txDate').value = isoDate();
});

/* ---------- Overview totals & chart ---------- */
function totalsForMonth(){
  const ym=state.selectedMonth; let inc=0,exp=0;
  state.transactions.forEach(t=>{
    if((t.date||'').slice(0,7)!==ym) return;
    const a=Number(t.amount)||0; if(t.type==='Income') inc+=a; else exp+=a;
  });
  return {income:inc, expense:exp, balance:inc-exp};
}
function renderSummary(){
  const {income,expense,balance}=totalsForMonth();
  $('#sumIncome').textContent=formatMoney(income);
  $('#sumExpense').textContent=formatMoney(expense);
  $('#sumBalance').textContent=formatMoney(balance);
}
function drawChart(){
  const canvas = $('#monthChart'); if(!canvas || typeof Chart==='undefined') return;
  const ym = state.selectedMonth;
  const [y,m] = ym.split('-').map(Number);
  const days = new Date(y,m,0).getDate();
  const inc = Array(days).fill(0), exp = Array(days).fill(0);
  state.transactions.forEach(t=>{
    if((t.date||'').slice(0,7)!==ym) return;
    const d=new Date(t.date).getDate()-1;
    if(t.type==='Income') inc[d]+=Number(t.amount)||0; else exp[d]+=Number(t.amount)||0;
  });
  const run=[]; let r=0; for(let i=0;i<days;i++){ r+=inc[i]-exp[i]; run.push(r); }
  const labels=Array.from({length:days},(_,i)=>String(i+1));
  const ctx=canvas.getContext('2d');
  if(!window.__budgetChart){
    window.__budgetChart=new Chart(ctx,{type:'bar',
      data:{labels,datasets:[
        {label:'Income',data:inc,backgroundColor:'rgba(16,152,69,.45)',yAxisID:'y'},
        {label:'Expenses',data:exp,backgroundColor:'rgba(176,0,32,.45)',yAxisID:'y'},
        {label:'Running Balance',data:run,type:'line',borderColor:'#2563eb',fill:false,yAxisID:'y1'}
      ]},
      options:{responsive:true,scales:{
        y:{beginAtZero:true,title:{display:true,text:'€ per day'}},
        y1:{position:'right',beginAtZero:true,grid:{drawOnChartArea:false},title:{display:true,text:'€ balance'}}
      }}
    });
  }else{
    const c=window.__budgetChart;
    c.data.labels=labels; c.data.datasets[0].data=inc; c.data.datasets[1].data=exp; c.data.datasets[2].data=run; c.update();
  }
}

/* ---------- Tables on Income/Expenses tabs ---------- */
function rowHtml(tx){
  return `<tr data-id="${tx.id}">
    <td>${escapeHtml(tx.date)}</td>
    <td>${escapeHtml(tx.category)}</td>
    <td class="right">${formatMoney(tx.amount)}</td>
    <td>${escapeHtml(tx.note)}</td>
    <td class="nowrap">
      <button class="small editTxn">Edit</button>
      <button class="small danger deleteTxn">Delete</button>
    </td>
  </tr>`;
}
function wireRowButtons(tbody){
  tbody.querySelectorAll('.editTxn').forEach(b=>b.addEventListener('click',(e)=>{
    const id=e.target.closest('tr')?.dataset.id;
    const tx=state.transactions.find(t=>t.id===id); if(tx) enterEditMode(tx);
  }));
  tbody.querySelectorAll('.deleteTxn').forEach(b=>b.addEventListener('click',(e)=>{
    const id=e.target.closest('tr')?.dataset.id;
    const tx=state.transactions.find(t=>t.id===id); if(!tx) return;
    if(confirm(`Delete ${tx.type.toLowerCase()} "${tx.category}" of ${formatMoney(tx.amount)} on ${tx.date}?`)){
      state.transactions=state.transactions.filter(t=>t.id!==id); save(); renderAll();
    }
  }));
}
function renderIncomeTable(){
  const tbody=$('#incomeTbody'); if(!tbody) return;
  const ym=state.selectedMonth;
  const list=state.transactions.filter(t=>t.type==='Income' && (t.date||'').slice(0,7)===ym);
  tbody.innerHTML=list.map(rowHtml).join(''); wireRowButtons(tbody);
  $('#incomeTotal').textContent=formatMoney(list.reduce((s,t)=>s+(Number(t.amount)||0),0));
}
function renderExpenseTable(){
  const tbody=$('#expenseTbody'); if(!tbody) return;
  const ym=state.selectedMonth;
  const list=state.transactions.filter(t=>t.type==='Expense' && (t.date||'').slice(0,7)===ym);
  tbody.innerHTML=list.map(rowHtml).join(''); wireRowButtons(tbody);
  $('#expenseTotal').textContent=formatMoney(list.reduce((s,t)=>s+(Number(t.amount)||0),0));
}

/* ---------- Render all ---------- */
function renderAll(){
  setFormTypeBadge();
  renderCategoryChips();
  renderSummary();
  drawChart();
  renderIncomeTable();
  renderExpenseTable();
}

document.addEventListener('DOMContentLoaded', ()=>{
  const d=$('#txDate'); if(d && !d.value) d.value=isoDate();
  renderAll();
});
