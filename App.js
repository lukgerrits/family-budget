{\rtf1\ansi\ansicpg1252\cocoartf2822
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 // ---------- Helpers ----------\
const LOCALE = navigator.language || 'nl-BE';\
const CURRENCY = (Intl.NumberFormat().resolvedOptions().currency) || 'EUR';\
const fmt = new Intl.NumberFormat(LOCALE, \{ style: 'currency', currency: CURRENCY \});\
\
const store = \{\
  read(key, fallback) \{ try \{ return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback)); \} catch \{ return fallback; \} \},\
  write(key, val) \{ localStorage.setItem(key, JSON.stringify(val)); \}\
\};\
\
const DATA = \{\
  // transactions: [\{id, date:'YYYY-MM-DD', type:'income'|'expense', category, amount(number), note\}]\
  get tx() \{ return store.read('tx', []); \},\
  set tx(v) \{ store.write('tx', v); \},\
\
  // categories: \{ income: [name], expense: [name] \}\
  get cats() \{ return store.read('cats', \{ income: ['Salary'], expense: ['Groceries','Rent','Utilities'] \}); \},\
  set cats(v) \{ store.write('cats', v); \}\
\};\
\
// ---------- DOM ----------\
const els = \{\
  monthPicker: document.getElementById('monthPicker'),\
  resetMonth: document.getElementById('resetMonth'),\
  sumIncome: document.getElementById('sumIncome'),\
  sumExpense: document.getElementById('sumExpense'),\
  sumBalance: document.getElementById('sumBalance'),\
  txForm: document.getElementById('txForm'),\
  txType: document.getElementById('txType'),\
  txDate: document.getElementById('txDate'),\
  txCategory: document.getElementById('txCategory'),\
  txAmount: document.getElementById('txAmount'),\
  txNote: document.getElementById('txNote'),\
  clearForm: document.getElementById('clearForm'),\
  filterType: document.getElementById('filterType'),\
  txTbody: document.getElementById('txTbody'),\
  catForm: document.getElementById('catForm'),\
  catKind: document.getElementById('catKind'),\
  catName: document.getElementById('catName'),\
  expenseCatList: document.getElementById('expenseCatList'),\
  incomeCatList: document.getElementById('incomeCatList'),\
  exportBtn: document.getElementById('exportBtn'),\
  importBtn: document.getElementById('importBtn'),\
  importFile: document.getElementById('importFile'),\
\};\
\
// ---------- Init ----------\
function todayISO() \{\
  const d = new Date();\
  d.setHours(0,0,0,0);\
  return d.toISOString().slice(0,10);\
\}\
function monthISO(d = new Date()) \{\
  return `$\{d.getFullYear()\}-$\{String(d.getMonth()+1).padStart(2,'0')\}`;\
\}\
\
function setDefaultMonth() \{\
  els.monthPicker.value = monthISO(new Date());\
\}\
\
function loadCategoriesSelect() \{\
  const kind = els.txType.value;\
  const list = DATA.cats[kind] || [];\
  els.txCategory.innerHTML = list.map(c => `<option value="$\{c\}">$\{c\}</option>`).join('');\
\}\
\
function refreshCategoryPills() \{\
  const exp = DATA.cats.expense || [];\
  const inc = DATA.cats.income || [];\
  els.expenseCatList.innerHTML = exp.map(c => `<li>$\{c\} <button data-kind="expense" data-name="$\{c\}">\uc0\u55357 \u56785 </button></li>`).join('');\
  els.incomeCatList.innerHTML  = inc.map(c => `<li>$\{c\} <button data-kind="income" data-name="$\{c\}">\uc0\u55357 \u56785 </button></li>`).join('');\
\}\
\
function parseAmount(input) \{\
  // Accept both "12,34" and "12.34"\
  const cleaned = String(input).trim().replace(/\\s/g,'').replace(',', '.');\
  const n = Number(cleaned);\
  if (Number.isFinite(n)) return n;\
  return NaN;\
\}\
\
function monthRange(ym) \{\
  // ym = 'YYYY-MM'\
  const [y,m] = ym.split('-').map(Number);\
  const start = new Date(y, m-1, 1);\
  const end = new Date(y, m, 0); // last day\
  return \{ start, end \};\
\}\
\
function inMonth(dateStr, ym) \{\
  return dateStr.startsWith(ym + '-');\
\}\
\
function recompute() \{\
  const ym = els.monthPicker.value || monthISO(new Date());\
  const filter = els.filterType.value; // all | income | expense\
  const rows = DATA.tx\
    .filter(t => inMonth(t.date, ym))\
    .filter(t => filter === 'all' ? true : t.type === filter)\
    .sort((a,b) => (a.date < b.date ? 1 : -1));\
\
  // Totals (whole month, regardless of filter)\
  const monthRows = DATA.tx.filter(t => inMonth(t.date, ym));\
  const sumInc = monthRows.filter(t => t.type === 'income').reduce((acc,t)=>acc+t.amount,0);\
  const sumExp = monthRows.filter(t => t.type === 'expense').reduce((acc,t)=>acc+t.amount,0);\
  const bal = sumInc - sumExp;\
\
  els.sumIncome.textContent = fmt.format(sumInc);\
  els.sumExpense.textContent = fmt.format(sumExp);\
  els.sumBalance.textContent = fmt.format(bal);\
\
  // Render table\
  els.txTbody.innerHTML = rows.map(t => `\
    <tr>\
      <td>$\{t.date\}</td>\
      <td>$\{t.type === 'income' ? 'Income' : 'Expense'\}</td>\
      <td>$\{t.category\}</td>\
      <td class="right">$\{fmt.format(t.amount)\}</td>\
      <td>$\{t.note ? t.note.replace(/</g,'&lt;') : ''\}</td>\
      <td><button class="ghost" data-del="$\{t.id\}">\uc0\u55357 \u56785 </button></td>\
    </tr>\
  `).join('');\
\}\
\
function addTransaction(evt) \{\
  evt.preventDefault();\
  const type = els.txType.value;\
  const date = els.txDate.value;\
  const category = els.txCategory.value;\
  const amount = parseAmount(els.txAmount.value);\
  const note = els.txNote.value.trim();\
\
  if (!date || !category || !Number.isFinite(amount)) \{\
    alert('Please fill date, category, and a valid amount.');\
    return;\
  \}\
\
  const tx = DATA.tx;\
  tx.push(\{ id: crypto.randomUUID(), type, date, category, amount, note \});\
  DATA.tx = tx;\
  els.txForm.reset();\
  els.txType.value = 'expense';\
  els.txDate.value = todayISO();\
  loadCategoriesSelect();\
  recompute();\
\}\
\
function deleteRow(id) \{\
  const tx = DATA.tx.filter(t => t.id !== id);\
  DATA.tx = tx;\
  recompute();\
\}\
\
function addCategory(evt) \{\
  evt.preventDefault();\
  const kind = els.catKind.value;\
  const name = els.catName.value.trim();\
  if (!name) return;\
  const cats = DATA.cats;\
  if (!cats[kind].includes(name)) cats[kind].push(name);\
  DATA.cats = cats;\
  els.catName.value = '';\
  refreshCategoryPills();\
  loadCategoriesSelect();\
\}\
\
// ---------- Export / Import JSON ----------\
function doExport() \{\
  const blob = new Blob([JSON.stringify(\{ tx: DATA.tx, cats: DATA.cats \}, null, 2)], \{ type: 'application/json' \});\
  const a = document.createElement('a');\
  a.href = URL.createObjectURL(blob);\
  a.download = `budget-backup-$\{new Date().toISOString().slice(0,10)\}.json`;\
  a.click();\
\}\
\
function doImport(file) \{\
  const reader = new FileReader();\
  reader.onload = () => \{\
    try \{\
      const obj = JSON.parse(reader.result);\
      if (obj.tx && obj.cats) \{\
        DATA.tx = obj.tx;\
        DATA.cats = obj.cats;\
        refreshCategoryPills();\
        loadCategoriesSelect();\
        recompute();\
        alert('Import successful.');\
      \} else \{\
        alert('Invalid file format.');\
      \}\
    \} catch \{\
      alert('Invalid JSON.');\
    \}\
  \};\
  reader.readAsText(file);\
\}\
\
// ---------- Wire up ----------\
function init() \{\
  setDefaultMonth();\
  els.txDate.value = todayISO();\
  loadCategoriesSelect();\
  refreshCategoryPills();\
  recompute();\
\
  els.txForm.addEventListener('submit', addTransaction);\
  els.clearForm.addEventListener('click', () => \{ els.txForm.reset(); els.txType.value='expense'; els.txDate.value=todayISO(); loadCategoriesSelect(); \});\
\
  els.monthPicker.addEventListener('change', recompute);\
  els.resetMonth.addEventListener('click', () => \{ setDefaultMonth(); recompute(); \});\
  els.filterType.addEventListener('change', recompute);\
  els.txType.addEventListener('change', loadCategoriesSelect);\
\
  els.txTbody.addEventListener('click', (e) => \{\
    const id = e.target.getAttribute('data-del');\
    if (id && confirm('Delete this transaction?')) deleteRow(id);\
  \});\
\
  els.catForm.addEventListener('submit', addCategory);\
  document.addEventListener('click', (e) => \{\
    if (e.target.matches('ul.pill-list button')) \{\
      const kind = e.target.getAttribute('data-kind');\
      const name = e.target.getAttribute('data-name');\
      const cats = DATA.cats;\
      cats[kind] = cats[kind].filter(c => c !== name);\
      DATA.cats = cats;\
      refreshCategoryPills();\
      loadCategoriesSelect();\
    \}\
  \});\
\
  els.exportBtn.addEventListener('click', doExport);\
  els.importBtn.addEventListener('click', () => els.importFile.click());\
  els.importFile.addEventListener('change', () => \{\
    if (els.importFile.files?.[0]) doImport(els.importFile.files[0]);\
  \});\
\}\
\
document.addEventListener('DOMContentLoaded', init);}