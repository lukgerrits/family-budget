/* ==========================================================
   Family Budget – app.js (tab-driven type & categories)
   ========================================================== */

const $ = (s) => document.querySelector(s);
function isoDate(d = new Date()) {
  const p = (n) => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function formatMoney(n){ return Number(n||0).toLocaleString('nl-BE',{style:'currency',currency:'EUR'}); }
function uid(){ return Math.random().toString(36).slice(2,9)+Date.now().toString(36); }
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

const STORAGE_KEY='family-budget/v1';
let state = load();
function load(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    const base={selectedMonth:isoDate().slice(0,7),transactions:[]};
    if(!raw) return base;
    const p=JSON.parse(raw); p.transactions=Array.isArray(p.transactions)?p.transactions:[];
    return {...base,...p};
  }catch{ return {selectedMonth:isoDate().slice(0,7),transactions:[]}; }
}
function save(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }

/* ---------- Current form type = active tab ---------- */
let currentTab = 'overview';
function currentFormType(){
  return currentTab==='income' ? 'Income'
       : currentTab==='expenses' ? 'Expense'
       : 'Expense'; // default when on Overview
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

/* ---------- Populate categories for current type ---------- */
function uniqueCategoriesForType(type){
  const set=new Set();
  state.transactions.forEach(t=>{ if(t.type===type) set.add(t.category||''); });
  return Array.from(set).filter(Boolean).sort((a,b)=>a.localeCompare(b,'nl'));
}
function populateCategorySelect(){
  const sel = $('#txCategory'); if(!sel) return;
  const type = currentFormType();
  const opts = uniqueCategoriesForType(type);
  const existing = sel.value; // keep choice if still valid
  sel.innerHTML = `<option value="" disabled ${existing?'':'selected'}>Select category</option>` +
    opts.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if (opts.includes(existing)) sel.value = existing;
}
function setFormTypeBadge(){
  const b = $('#formTypeBadge'); if(!b) return;
  const t = currentFormType();
  b.textContent = `Type: ${t}`;
  b.style.borderColor = t==='Income' ? '#16a34a' : '#b91c1c';
  b.style.color      = t==='Income' ? '#166534' : '#7f1d1d';
}

/* ---------- Expose tab-change hook from HTML ---------- */
window.onTabActivated = function(name){
  currentTab = name;
  setFormTypeBadge();
  populateCategorySelect();
};

/* ---------- Add/Edit/Delete ---------- */
let editId = null;

function enterEditMode(tx){
  editId = tx.id;
  $('#txDate').value = tx.date || isoDate();
  populateCategorySelect(); // ensure list is ready for that type
  $('#txCategory').value = tx.category || '';
  $('#txAmount').value = String(tx.amount).replace('.',',');
  $('#txNote').value = tx.note || '';
  $('#txSubmit').textContent='Save';
  $('#clearForm').textContent='Cancel';
  // switch to correct tab
  window.showFormTabForType?.(tx.type);
}

function exitEditMode(){
  editId=null;
  $('#txSubmit').textContent='Add';
  $('#clearForm').textContent='Clear';
}

const form = $('#txForm');
form?.addEventListener('submit',(e)=>{
  e.preventDefault();
  const type = currentFormType();
  const tx = {
    type,
    date: $('#txDate').value || isoDate(),
    category: $('#txCategory').value || '',
    amount: Number(String($('#txAmount').value||'0').replace(/\./g,'').replace(',','.')),
    note: $('#txNote').value || ''
  };
  if(!tx.category){ alert('Choose a category'); return; }
  if(isNaN(tx.amount)){ alert('Enter a valid amount'); return; }

  if(editId){
    const i=state.transactions.findIndex(t=>t.id===editId);
    if(i>=0) state.transactions[i]={...state.transactions[i],...tx};
    exitEditMode();
  }else{
    state.transactions.push({id:uid(),...tx});
  }
  save(); renderAll();
  form.reset();
  $('#txDate').value = isoDate();
  populateCategorySelect(); // may add new category in list
});
$('#clearForm')?.addEventListener('click',(e)=>{
  e.preventDefault();
  if(editId) exitEditMode();
  form.reset();
  $('#txDate').value = isoDate();
  populateCategorySelect();
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

/* ---------- Tables ---------- */
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
  populateCategorySelect();
  renderSummary();
  drawChart();
  renderIncomeTable();
  renderExpenseTable();
}

document.addEventListener('DOMContentLoaded', ()=>{
  const d=$('#txDate'); if(d && !d.value) d.value=isoDate();
  renderAll();
});
