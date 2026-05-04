const PW_KEY = 'pennywise_plus_state_v2';
const LEGACY_KEY = 'pennywise_plus_state_v1';
const DEFAULT_CATEGORIES = ['Rent/Housing', 'Groceries', 'Eating Out', 'Transportation', 'Gas', 'Utilities', 'Subscriptions', 'Fitness', 'Health', 'School/Work', 'Shopping', 'Entertainment', 'Travel', 'Gifts', 'Savings', 'Debt', 'Miscellaneous'];
const RULE_SEEDS = [
  ['HEB', 'Groceries', 'need', 'variable'],
  ['Walmart', 'Groceries', 'need', 'variable'],
  ['Kroger', 'Groceries', 'need', 'variable'],
  ['Spotify', 'Subscriptions', 'want', 'fixed'],
  ['Netflix', 'Subscriptions', 'want', 'fixed'],
  ['Amazon', 'Shopping', 'want', 'variable'],
  ['Uber', 'Transportation', 'want', 'variable'],
  ['Lyft', 'Transportation', 'want', 'variable'],
  ['Shell', 'Gas', 'need', 'variable'],
  ['Chevron', 'Gas', 'need', 'variable'],
  ['Exxon', 'Gas', 'need', 'variable'],
  ['Chick-fil-A', 'Eating Out', 'want', 'variable'],
  ["McDonald's", 'Eating Out', 'want', 'variable'],
  ['Starbucks', 'Eating Out', 'want', 'variable']
];

let state = loadState();
let charts = {};
let csvRows = [];
let importPreview = [];
let importStats = { imported: 0, duplicates: 0, errors: 0 };

function $(id) {
  return document.getElementById(id);
}

function uid() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return `pw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeDefaultRules() {
  return RULE_SEEDS.map(([text, category, needWant, fixedVariable]) => ({ id: uid(), field: 'merchant', text, category, subcategory: '', needWant, fixedVariable }));
}

function defaultState() {
  return {
    transactions: [],
    categories: [...DEFAULT_CATEGORIES],
    budgets: {},
    monthlyBudget: 0,
    debtTarget: 0,
    goals: [],
    rules: makeDefaultRules(),
    theme: 'dark',
    lastBackupReminder: ''
  };
}

function normalizeImportedState(raw) {
  const base = defaultState();
  const next = { ...base, ...(raw || {}) };
  next.categories = Array.isArray(next.categories) && next.categories.length ? [...new Set([...DEFAULT_CATEGORIES, ...next.categories])] : base.categories;
  next.transactions = Array.isArray(next.transactions) ? next.transactions.map(normalizeTransaction).filter(Boolean) : [];
  next.goals = Array.isArray(next.goals) ? next.goals.map(g => ({ id: g.id || uid(), name: g.name || 'Savings goal', target: Number(g.target || 0), current: Number(g.current || 0), deadline: g.deadline || '' })) : [];
  next.rules = Array.isArray(next.rules) && next.rules.length ? next.rules.map(r => ({ id: r.id || uid(), field: r.field || 'merchant', text: r.text || '', category: r.category || 'Miscellaneous', subcategory: r.subcategory || '', needWant: r.needWant || '', fixedVariable: r.fixedVariable || '' })).filter(r => r.text) : base.rules;
  next.budgets = next.budgets && typeof next.budgets === 'object' ? next.budgets : {};
  next.monthlyBudget = Number(next.monthlyBudget || 0);
  next.theme = next.theme === 'light' ? 'light' : 'dark';
  return next;
}

function loadState() {
  try {
    const stored = localStorage.getItem(PW_KEY) || localStorage.getItem(LEGACY_KEY);
    return normalizeImportedState(stored ? JSON.parse(stored) : null);
  } catch {
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(PW_KEY, JSON.stringify(state));
  } catch {
    toast('Browser storage is full or unavailable. Export a JSON backup before adding more data.');
  }
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function money(value) {
  return Number(value || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function monthEnd() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function parseMoney(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const negative = raw.includes('(') && raw.includes(')');
  const number = Number(raw.replace(/[$,\s()]/g, ''));
  return Number.isFinite(number) ? (negative ? -Math.abs(number) : number) : 0;
}

function parseDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function toast(message) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove('show'), 2800);
}

function sum(list, fn) {
  return list.reduce((total, item) => total + Number(fn(item) || 0), 0);
}

function groupSum(list, keyFn) {
  return list.reduce((acc, item) => {
    const key = keyFn(item) || 'Uncategorized';
    acc[key] = (acc[key] || 0) + Number(item.amount || 0);
    return acc;
  }, {});
}

function getDaysBetween(from, to) {
  if (!from || !to || from > to) return [];
  const days = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function normalizeTransaction(tx) {
  if (!tx) return null;
  const merchant = String(tx.merchant || tx.description || '').trim();
  const notes = String(tx.notes || '').trim();
  const tags = Array.isArray(tx.tags) ? tx.tags : String(tx.tags || '').split(/[|,]/).map(t => t.trim()).filter(Boolean);
  const type = tx.type === 'income' ? 'income' : 'expense';
  const amount = Math.abs(Number(tx.amount || 0));
  if (!tx.date || !amount) return null;
  return {
    id: tx.id || uid(),
    date: parseDate(tx.date) || today(),
    type,
    amount,
    category: tx.category || 'Miscellaneous',
    subcategory: tx.subcategory || '',
    merchant,
    paymentMethod: tx.paymentMethod || tx.payment_method || tx.method || '',
    tags,
    needWant: tx.needWant || 'neutral',
    fixedVariable: tx.fixedVariable || 'variable',
    recurring: tx.recurring || 'none',
    notes,
    createdAt: tx.createdAt || new Date().toISOString()
  };
}

function expenseTransactions(list) {
  return list.filter(tx => tx.type === 'expense');
}

function applyRules(merchant, notes = '', amount = 0) {
  const haystacks = {
    merchant: normalizeText(merchant),
    notes: normalizeText(notes),
    any: normalizeText(`${merchant} ${notes}`)
  };
  const found = state.rules.find(rule => {
    const text = normalizeText(rule.text);
    if (!text) return false;
    const field = rule.field || 'merchant';
    return (haystacks[field] || haystacks.any).includes(text);
  });
  return {
    category: found?.category || 'Miscellaneous',
    subcategory: found?.subcategory || '',
    needWant: found?.needWant || 'neutral',
    fixedVariable: found?.fixedVariable || 'variable'
  };
}

function duplicateKey(tx) {
  return [tx.date, Number(tx.amount || 0).toFixed(2), normalizeText(tx.merchant), normalizeText(tx.notes)].join('|');
}

function getFilterValues() {
  return {
    from: $('dateFrom')?.value || '',
    to: $('dateTo')?.value || '',
    type: $('typeFilter')?.value || 'all',
    category: $('categoryFilter')?.value || 'all',
    method: $('methodFilter')?.value || 'all',
    tag: $('tagFilter')?.value || 'all',
    query: normalizeText($('searchInput')?.value || ''),
    sort: $('sortSelect')?.value || 'dateDesc'
  };
}

function filteredTransactions() {
  const filters = getFilterValues();
  const list = state.transactions.filter(tx => {
    const matchDate = (!filters.from || tx.date >= filters.from) && (!filters.to || tx.date <= filters.to);
    const matchType = filters.type === 'all' || tx.type === filters.type;
    const matchCategory = filters.category === 'all' || tx.category === filters.category;
    const matchMethod = filters.method === 'all' || normalizeText(tx.paymentMethod || 'Unspecified') === normalizeText(filters.method);
    const matchTag = filters.tag === 'all' || (tx.tags || []).some(tag => normalizeText(tag) === normalizeText(filters.tag));
    const blob = normalizeText([tx.merchant, tx.notes, tx.tags?.join(' '), tx.category, tx.subcategory, tx.paymentMethod, tx.type].join(' '));
    return matchDate && matchType && matchCategory && matchMethod && matchTag && (!filters.query || blob.includes(filters.query));
  });
  return sortTransactions(list, filters.sort);
}

function sortTransactions(list, sortBy) {
  const sorted = [...list];
  const text = value => normalizeText(value);
  const sorters = {
    dateDesc: (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    dateAsc: (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
    amountDesc: (a, b) => b.amount - a.amount,
    amountAsc: (a, b) => a.amount - b.amount,
    categoryAsc: (a, b) => text(a.category).localeCompare(text(b.category)),
    merchantAsc: (a, b) => text(a.merchant).localeCompare(text(b.merchant))
  };
  return sorted.sort(sorters[sortBy] || sorters.dateDesc);
}

function init() {
  document.body.classList.toggle('light', state.theme === 'light');
  $('dateFrom').value = monthStart();
  $('dateTo').value = monthEnd();
  bindEvents();
  hydrateSelects();
  updateThemeButton();
  renderAll();
  registerServiceWorker();
}

function bindEvents() {
  document.querySelectorAll('.nav-link').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  $('menuToggle').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('quickAddBtn').addEventListener('click', () => openTransactionDialog());
  $('heroAddBtn').addEventListener('click', () => openTransactionDialog());
  $('heroSampleBtn').addEventListener('click', seedSampleData);
  $('closeDialogBtn').addEventListener('click', () => $('transactionDialog').close());
  $('transactionDialog').addEventListener('click', e => {
    if (e.target === $('transactionDialog')) $('transactionDialog').close();
  });
  $('transactionForm').addEventListener('submit', saveTransactionFromForm);
  $('duplicateTxBtn').addEventListener('click', duplicateCurrentTransaction);
  ['dateFrom', 'dateTo', 'typeFilter', 'categoryFilter', 'methodFilter', 'tagFilter', 'sortSelect', 'searchInput'].forEach(id => $(id).addEventListener('input', renderAll));
  $('resetFiltersBtn').addEventListener('click', resetFilters);
  $('themeToggle').addEventListener('click', toggleTheme);
  $('saveMonthlyBudgetBtn').addEventListener('click', saveMonthlyBudget);
  $('budgetForm').addEventListener('submit', saveBudget);
  $('goalForm').addEventListener('submit', saveGoal);
  $('ruleForm').addEventListener('submit', saveRule);
  $('categoryForm').addEventListener('submit', saveCategory);
  $('exportCsvBtn').addEventListener('click', exportCSV);
  $('exportJsonBtn').addEventListener('click', exportJSON);
  $('jsonImport').addEventListener('change', importJSON);
  $('clearDataBtn').addEventListener('click', clearAllData);
  $('seedDataBtn').addEventListener('click', seedSampleData);
  $('printReportBtn').addEventListener('click', () => window.print());
  $('csvFile').addEventListener('change', handleCsvFile);
  $('previewImportBtn').addEventListener('click', previewImport);
  $('saveImportBtn').addEventListener('click', saveImportPreview);
  $('transactionsBody').addEventListener('click', handleTransactionAction);
  $('mobileTransactions').addEventListener('click', handleTransactionAction);
}

function resetFilters() {
  $('dateFrom').value = monthStart();
  $('dateTo').value = monthEnd();
  $('typeFilter').value = 'all';
  $('categoryFilter').value = 'all';
  $('methodFilter').value = 'all';
  $('tagFilter').value = 'all';
  $('sortSelect').value = 'dateDesc';
  $('searchInput').value = '';
  renderAll();
}

function switchView(view) {
  const titles = {
    dashboard: ['Dashboard', 'Know where every cent goes.'],
    transactions: ['Transactions', 'Audit, search, and clean up your money trail.'],
    budgets: ['Budgets', 'Give every dollar a structure.'],
    goals: ['Goals', 'Use little to do more.'],
    import: ['Import', 'Bring in CSVs and categorize faster.'],
    reports: ['Reports', 'Print or save a clean PDF summary.'],
    settings: ['Settings', 'Control categories, backups, and privacy.']
  };
  document.querySelectorAll('.nav-link').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  document.querySelectorAll('.view').forEach(section => section.classList.toggle('active-view', section.id === view));
  $('viewTitle').textContent = titles[view]?.[0] || 'Dashboard';
  $('viewSubtitle').textContent = titles[view]?.[1] || 'Know where every cent goes.';
  $('sidebar').classList.remove('open');
  renderAll();
}

function hydrateSelects() {
  hydrateCategorySelects();
  hydrateDynamicFilter('methodFilter', uniquePaymentMethods(), 'All methods');
  hydrateDynamicFilter('tagFilter', uniqueTags(), 'All tags');
  $('monthlyBudgetAmount').value = state.monthlyBudget || '';
}

function hydrateCategorySelects() {
  const ids = ['categoryFilter', 'txCategory', 'budgetCategory', 'ruleCategory'];
  ids.forEach(id => {
    const el = $(id);
    if (!el) return;
    const current = el.value;
    el.innerHTML = id === 'categoryFilter' ? '<option value="all">All categories</option>' : '';
    state.categories.forEach(category => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      el.appendChild(option);
    });
    if ([...el.options].some(option => option.value === current)) el.value = current;
  });
}

function hydrateDynamicFilter(id, values, label) {
  const el = $(id);
  const current = el.value;
  el.innerHTML = `<option value="all">${label}</option>`;
  values.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    el.appendChild(option);
  });
  if ([...el.options].some(option => option.value === current)) el.value = current;
}

function uniquePaymentMethods() {
  return [...new Set(state.transactions.map(tx => tx.paymentMethod || 'Unspecified'))].sort((a, b) => a.localeCompare(b));
}

function uniqueTags() {
  return [...new Set(state.transactions.flatMap(tx => tx.tags || []))].sort((a, b) => a.localeCompare(b));
}

function updateThemeButton() {
  $('themeToggle').textContent = state.theme === 'light' ? 'Light mode' : 'Dark mode';
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  document.body.classList.toggle('light', state.theme === 'light');
  saveState();
  updateThemeButton();
  renderCharts();
}

function openTransactionDialog(tx = null) {
  $('dialogTitle').textContent = tx ? 'Edit Transaction' : 'Add Transaction';
  $('transactionId').value = tx?.id || '';
  $('txDate').value = tx?.date || today();
  $('txType').value = tx?.type || 'expense';
  $('txAmount').value = tx?.amount || '';
  $('txCategory').value = tx?.category || 'Miscellaneous';
  $('txSubcategory').value = tx?.subcategory || '';
  $('txMerchant').value = tx?.merchant || '';
  $('txMethod').value = tx?.paymentMethod || '';
  $('txTags').value = Array.isArray(tx?.tags) ? tx.tags.join(', ') : (tx?.tags || '');
  $('txNeedWant').value = tx?.needWant || 'need';
  $('txFixedVariable').value = tx?.fixedVariable || 'variable';
  $('txRecurring').value = tx?.recurring || 'none';
  $('txNotes').value = tx?.notes || '';
  $('duplicateTxBtn').disabled = !tx;
  $('transactionDialog').showModal();
}

function readTransactionForm() {
  const merchant = $('txMerchant').value.trim();
  const notes = $('txNotes').value.trim();
  const ruleDefaults = applyRules(merchant, notes);
  return normalizeTransaction({
    id: $('transactionId').value || uid(),
    date: $('txDate').value,
    type: $('txType').value,
    amount: Number($('txAmount').value),
    category: $('txCategory').value || ruleDefaults.category,
    subcategory: $('txSubcategory').value.trim() || ruleDefaults.subcategory,
    merchant,
    paymentMethod: $('txMethod').value.trim(),
    tags: $('txTags').value.split(',').map(tag => tag.trim()).filter(Boolean),
    needWant: $('txNeedWant').value || ruleDefaults.needWant,
    fixedVariable: $('txFixedVariable').value || ruleDefaults.fixedVariable,
    recurring: $('txRecurring').value,
    notes,
    createdAt: new Date().toISOString()
  });
}

function saveTransactionFromForm(event) {
  event.preventDefault();
  const tx = readTransactionForm();
  if (!tx) {
    toast('Date and amount are required.');
    return;
  }
  const index = state.transactions.findIndex(item => item.id === tx.id);
  if (index >= 0) state.transactions[index] = { ...state.transactions[index], ...tx };
  else state.transactions.push(tx);
  saveState();
  $('transactionDialog').close();
  renderAll();
  toast('Transaction saved.');
}

function duplicateCurrentTransaction() {
  const sourceId = $('transactionId').value;
  const source = state.transactions.find(tx => tx.id === sourceId) || readTransactionForm();
  if (!source) {
    toast('Save the transaction before duplicating it.');
    return;
  }
  const copy = { ...source, id: uid(), date: today(), createdAt: new Date().toISOString(), notes: source.notes ? `${source.notes} (duplicated)` : 'Duplicated transaction' };
  state.transactions.push(copy);
  saveState();
  $('transactionDialog').close();
  renderAll();
  toast('Transaction duplicated.');
}

function handleTransactionAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === 'edit') editTx(id);
  if (button.dataset.action === 'delete') deleteTx(id);
  if (button.dataset.action === 'duplicate') duplicateTx(id);
}

function editTx(id) {
  const tx = state.transactions.find(item => item.id === id);
  if (tx) openTransactionDialog(tx);
}

function deleteTx(id) {
  if (!confirm('Delete this transaction? This cannot be undone.')) return;
  state.transactions = state.transactions.filter(item => item.id !== id);
  saveState();
  renderAll();
  toast('Transaction deleted.');
}

function duplicateTx(id) {
  const tx = state.transactions.find(item => item.id === id);
  if (!tx) return;
  state.transactions.push({ ...tx, id: uid(), date: today(), createdAt: new Date().toISOString(), notes: tx.notes ? `${tx.notes} (duplicated)` : 'Duplicated transaction' });
  saveState();
  renderAll();
  toast('Transaction duplicated.');
}

function renderAll() {
  hydrateSelects();
  renderTransactions();
  renderMetrics();
  renderCharts();
  renderInsights();
  renderBudgets();
  renderGoals();
  renderRules();
  renderCategories();
  renderReport();
}

function renderTransactions() {
  const list = filteredTransactions();
  $('transactionsBody').innerHTML = list.map(tx => `
    <tr>
      <td>${escapeHtml(tx.date)}</td>
      <td><span class="pill ${tx.type}">${escapeHtml(tx.type)}</span></td>
      <td class="${tx.type === 'expense' ? 'amount-expense' : 'amount-income'}">${money(tx.amount)}</td>
      <td>${escapeHtml(tx.category)}</td>
      <td>${escapeHtml(tx.merchant || '')}</td>
      <td>${escapeHtml(tx.paymentMethod || 'Unspecified')}</td>
      <td>${(tx.tags || []).map(tag => `<span class="pill">${escapeHtml(tag)}</span>`).join('')}</td>
      <td class="row-actions">
        <button class="text-btn" type="button" data-action="edit" data-id="${escapeHtml(tx.id)}">Edit</button>
        <button class="text-btn" type="button" data-action="duplicate" data-id="${escapeHtml(tx.id)}">Duplicate</button>
        <button class="text-btn danger-text" type="button" data-action="delete" data-id="${escapeHtml(tx.id)}">Delete</button>
      </td>
    </tr>`).join('');
  $('mobileTransactions').innerHTML = list.map(tx => `
    <article class="transaction-card">
      <div><strong>${escapeHtml(tx.merchant || tx.category)}</strong><span>${escapeHtml(tx.date)} - ${escapeHtml(tx.category)}</span></div>
      <b class="${tx.type === 'expense' ? 'amount-expense' : 'amount-income'}">${money(tx.amount)}</b>
      <p>${escapeHtml(tx.paymentMethod || 'Unspecified')} ${tx.tags?.length ? `- ${escapeHtml(tx.tags.join(', '))}` : ''}</p>
      <div class="row-actions">
        <button class="text-btn" type="button" data-action="edit" data-id="${escapeHtml(tx.id)}">Edit</button>
        <button class="text-btn" type="button" data-action="duplicate" data-id="${escapeHtml(tx.id)}">Duplicate</button>
        <button class="text-btn danger-text" type="button" data-action="delete" data-id="${escapeHtml(tx.id)}">Delete</button>
      </div>
    </article>`).join('');
  $('emptyTransactions').style.display = list.length ? 'none' : 'block';
}

function getSummary(list = filteredTransactions()) {
  const expenses = expenseTransactions(list);
  const income = sum(list.filter(tx => tx.type === 'income'), tx => tx.amount);
  const expenseTotal = sum(expenses, tx => tx.amount);
  const net = income - expenseTotal;
  const byCat = groupSum(expenses, tx => tx.category);
  const topCategory = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a])[0] || 'None';
  const recurring = sum(expenses.filter(tx => tx.recurring && tx.recurring !== 'none'), tx => tx.amount);
  return { income, expenseTotal, net, byCat, topCategory, recurring, expenses };
}

function renderMetrics() {
  const list = filteredTransactions();
  const summary = getSummary(list);
  const budgetUsed = state.monthlyBudget ? Math.round((summary.expenseTotal / state.monthlyBudget) * 100) : 0;
  const remaining = Math.max(0, Number(state.monthlyBudget || 0) - summary.expenseTotal);
  const days = getDaysBetween($('dateFrom').value, $('dateTo').value);
  const spendDays = new Set(summary.expenses.map(tx => tx.date));
  const noSpendDays = days.filter(day => !spendDays.has(day)).length;
  $('metricIncome').textContent = money(summary.income);
  $('metricExpenses').textContent = money(summary.expenseTotal);
  $('metricNet').textContent = money(summary.net);
  $('savingsRate').textContent = summary.income ? `${Math.round((summary.net / summary.income) * 100)}% savings rate` : '0% savings rate';
  $('metricBudgetUsed').textContent = state.monthlyBudget ? `${budgetUsed}%` : 'Not set';
  $('metricBudgetRemaining').textContent = state.monthlyBudget ? `${money(remaining)} remaining` : 'Set one in Budgets';
  $('metricTopCategory').textContent = summary.topCategory;
  $('metricTransactionCount').textContent = list.length;
  $('metricNoSpend').textContent = noSpendDays;
  $('metricRecurring').textContent = money(summary.recurring);
  renderGameStats({ list, summary, budgetUsed, noSpendDays });
}

function renderGameStats({ list, summary, budgetUsed, noSpendDays }) {
  const budgetBonus = state.monthlyBudget && budgetUsed <= 100 ? 18 : state.monthlyBudget ? 8 : 0;
  const goalBonus = Math.min(18, state.goals.length * 6);
  const ruleBonus = Math.min(12, state.rules.length);
  const transactionBonus = Math.min(24, list.length * 3);
  const savingsBonus = summary.net > 0 ? 16 : 0;
  const streakBonus = Math.min(12, noSpendDays);
  const score = Math.max(0, Math.min(100, budgetBonus + goalBonus + ruleBonus + transactionBonus + savingsBonus + streakBonus));
  const level = Math.max(1, Math.ceil(score / 20));
  const titles = ['Novice Tracker', 'Budget Scout', 'Category Ranger', 'Savings Strategist', 'Chaos Tamer'];
  if ($('coinScore')) $('coinScore').textContent = score;
  if ($('playerLevel')) $('playerLevel').textContent = level;
  if ($('xpLabel')) $('xpLabel').textContent = titles[Math.min(titles.length - 1, level - 1)];
  if ($('xpProgress')) $('xpProgress').style.width = `${score}%`;
  if ($('streakLabel')) {
    const underBudget = state.monthlyBudget ? budgetUsed <= 100 : false;
    $('streakLabel').textContent = `${noSpendDays} no-spend day${noSpendDays === 1 ? '' : 's'} this period${underBudget ? ' - budget shield active' : ''}.`;
  }
}

function chartColors() {
  return ['#23e8ff', '#8c5cff', '#ff5cc8', '#35f2a1', '#ffb45c', '#6ea8ff', '#f87272', '#c084fc', '#2dd4bf', '#facc15'];
}

function chartTextColor(token) {
  return getComputedStyle(document.body).getPropertyValue(token).trim();
}

function makeChart(id, type, data, options = {}) {
  const canvas = $(id);
  if (!canvas) return;
  if (charts[id]) {
    charts[id].destroy();
    charts[id] = null;
  }
  if (!window.Chart) {
    canvas.closest('.chart-card')?.classList.add('chart-unavailable');
    return;
  }
  charts[id] = new Chart(canvas, {
    type,
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: chartTextColor('--text') } } },
      scales: type === 'doughnut' ? {} : {
        x: { ticks: { color: chartTextColor('--muted') }, grid: { color: 'rgba(150,160,190,.12)' } },
        y: { ticks: { color: chartTextColor('--muted') }, grid: { color: 'rgba(150,160,190,.12)' } }
      },
      ...options
    }
  });
}

function renderCharts() {
  const list = filteredTransactions();
  const summary = getSummary(list);
  const expenses = summary.expenses;
  const colors = chartColors();
  const byDate = groupSum(expenses, tx => tx.date);
  const dates = Object.keys(byDate).sort();
  const byCat = summary.byCat;
  const catLabels = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]);
  const byNeed = groupSum(expenses, tx => tx.needWant || 'neutral');
  const needLabels = Object.keys(byNeed);
  const byMerchant = groupSum(expenses, tx => tx.merchant || 'Unknown');
  const merchants = Object.keys(byMerchant).sort((a, b) => byMerchant[b] - byMerchant[a]).slice(0, 8);
  const byMethod = groupSum(expenses, tx => tx.paymentMethod || 'Unspecified');
  const methodLabels = Object.keys(byMethod);
  const byFixed = groupSum(expenses, tx => tx.fixedVariable || 'variable');
  const fixedLabels = Object.keys(byFixed);
  const budgetLabels = Object.keys(state.budgets);
  const budgetUsed = budgetLabels.map(cat => byCat[cat] || 0);

  makeChart('trendChart', 'line', { labels: dates, datasets: [{ label: 'Expenses', data: dates.map(d => byDate[d]), tension: .35, fill: true, borderColor: colors[0], backgroundColor: 'rgba(35,232,255,.12)' }] });
  makeChart('categoryChart', 'doughnut', { labels: catLabels, datasets: [{ data: catLabels.map(cat => byCat[cat]), backgroundColor: colors }] });
  makeChart('incomeExpenseChart', 'bar', { labels: ['Income', 'Expenses', 'Net'], datasets: [{ label: 'Amount', data: [summary.income, summary.expenseTotal, summary.net], backgroundColor: [colors[3], colors[2], summary.net >= 0 ? colors[0] : '#f87272'] }] });
  makeChart('needsChart', 'doughnut', { labels: needLabels, datasets: [{ data: needLabels.map(key => byNeed[key]), backgroundColor: colors.slice(2) }] });
  makeChart('merchantChart', 'bar', { labels: merchants, datasets: [{ label: 'Spent', data: merchants.map(m => byMerchant[m]), backgroundColor: colors[2] }] }, { indexAxis: 'y' });
  makeChart('methodChart', 'doughnut', { labels: methodLabels, datasets: [{ data: methodLabels.map(method => byMethod[method]), backgroundColor: colors }] });
  makeChart('fixedChart', 'doughnut', { labels: fixedLabels, datasets: [{ data: fixedLabels.map(key => byFixed[key]), backgroundColor: [colors[1], colors[4], colors[8]] }] });
  makeChart('budgetChart', 'bar', { labels: budgetLabels, datasets: [{ label: 'Used', data: budgetUsed, backgroundColor: colors[0] }, { label: 'Limit', data: budgetLabels.map(cat => state.budgets[cat]), backgroundColor: 'rgba(255,255,255,.22)' }] });
  makeChart('reportCategoryChart', 'doughnut', { labels: catLabels, datasets: [{ data: catLabels.map(cat => byCat[cat]), backgroundColor: colors }] });
  makeChart('reportTrendChart', 'line', { labels: dates, datasets: [{ label: 'Expenses', data: dates.map(d => byDate[d]), tension: .35, borderColor: colors[0], backgroundColor: 'rgba(35,232,255,.12)', fill: true }] });

  $('trendSummary').textContent = dates.length ? `Spending appears across ${dates.length} day(s), totaling ${money(summary.expenseTotal)}.` : 'No expenses in this period.';
  $('categorySummary').textContent = catLabels.length ? `${catLabels[0]} leads spending at ${money(byCat[catLabels[0]])}.` : 'No category spending yet.';
  $('cashflowSummary').textContent = `Income ${money(summary.income)}, expenses ${money(summary.expenseTotal)}, net ${money(summary.net)}.`;
  $('needsSummary').textContent = needLabels.length ? needLabels.map(key => `${key}: ${money(byNeed[key])}`).join(' | ') : 'No needs/wants data yet.';
  $('merchantSummary').textContent = merchants.length ? `${merchants[0]} is the top merchant at ${money(byMerchant[merchants[0]])}.` : 'No merchant data yet.';
  $('methodSummary').textContent = methodLabels.length ? methodLabels.map(key => `${key}: ${money(byMethod[key])}`).join(' | ') : 'No payment method data yet.';
  $('fixedSummary').textContent = fixedLabels.length ? fixedLabels.map(key => `${key}: ${money(byFixed[key])}`).join(' | ') : 'No fixed/variable data yet.';
  $('budgetSummary').textContent = budgetLabels.length ? `${budgetLabels.length} category budget(s) are being tracked.` : 'No category budgets set yet.';
}

function buildInsights() {
  const list = filteredTransactions();
  const summary = getSummary(list);
  if (!list.length) return ['Add transactions or import a CSV to unlock insights.'];
  const insights = [];
  if (summary.topCategory !== 'None') insights.push(`Most spending went to <strong>${escapeHtml(summary.topCategory)}</strong>: ${money(summary.byCat[summary.topCategory])}.`);
  const byMerchant = groupSum(summary.expenses, tx => tx.merchant || 'Unknown');
  const topMerchants = Object.keys(byMerchant).sort((a, b) => byMerchant[b] - byMerchant[a]).slice(0, 5);
  if (topMerchants.length) insights.push(`Your top 5 merchants account for <strong>${Math.round((sum(topMerchants, merchant => byMerchant[merchant]) / Math.max(summary.expenseTotal, 1)) * 100)}%</strong> of spending.`);
  if (summary.recurring) insights.push(`Marked recurring expenses total <strong>${money(summary.recurring)}</strong> in this period.`);
  const wants = sum(summary.expenses.filter(tx => tx.needWant === 'want'), tx => tx.amount);
  insights.push(`Wants represent <strong>${Math.round((wants / Math.max(summary.expenseTotal, 1)) * 100)}%</strong> of selected spending.`);
  if (summary.income) insights.push(`You saved <strong>${Math.round((summary.net / summary.income) * 100)}%</strong> of your income in this period.`);
  const days = getDaysBetween($('dateFrom').value, $('dateTo').value);
  const spendDays = new Set(summary.expenses.map(tx => tx.date));
  insights.push(`You had <strong>${days.filter(day => !spendDays.has(day)).length}</strong> no-spend days.`);
  return insights;
}

function renderInsights() {
  $('insightsList').innerHTML = buildInsights().map(item => `<div class="insight">${item}</div>`).join('');
}

function saveMonthlyBudget() {
  state.monthlyBudget = Number($('monthlyBudgetAmount').value || 0);
  saveState();
  renderAll();
  toast('Monthly budget saved.');
}

function saveBudget(event) {
  event.preventDefault();
  const category = $('budgetCategory').value;
  const amount = Number($('budgetAmount').value);
  if (!category || !amount) {
    toast('Choose a category and budget amount.');
    return;
  }
  state.budgets[category] = amount;
  $('budgetAmount').value = '';
  saveState();
  renderAll();
  toast('Category budget saved.');
}

function renderBudgets() {
  const summary = getSummary(filteredTransactions());
  const byCat = summary.byCat;
  const daysLeft = Math.max(0, new Date(monthEnd()).getDate() - new Date().getDate());
  const daysElapsed = Math.max(1, new Date().getDate());
  const projection = summary.expenseTotal / daysElapsed * new Date(monthEnd()).getDate();
  const entries = Object.entries(state.budgets);
  $('budgetList').innerHTML = [
    state.monthlyBudget ? budgetItemHtml('Overall Monthly Budget', summary.expenseTotal, state.monthlyBudget, 'overall') : '<div class="empty-state">Set an overall monthly budget for the clearest dashboard signal.</div>',
    ...entries.map(([category, limit]) => budgetItemHtml(category, byCat[category] || 0, limit, category))
  ].join('');
  const health = [];
  if (state.monthlyBudget) {
    const remaining = state.monthlyBudget - summary.expenseTotal;
    health.push(remaining >= 0 ? `Overall budget has ${money(remaining)} remaining.` : `Overall budget is over by ${money(Math.abs(remaining))}.`);
    health.push(`Projected end-of-month spending is ${money(projection)} based on current pace.`);
  }
  entries.forEach(([category, limit]) => {
    const used = byCat[category] || 0;
    const pct = Math.round((used / limit) * 100);
    const status = used > limit ? 'critical' : pct >= 85 ? 'warning' : 'positive';
    health.push(`<span class="${status}">${escapeHtml(category)}:</span> ${used > limit ? `over by ${money(used - limit)}` : `${money(limit - used)} remaining`} with ${daysLeft} day(s) left.`);
  });
  $('budgetHealth').innerHTML = health.map(text => `<div class="insight">${text}</div>`).join('') || '<div class="insight">Set budgets to see health checks.</div>';
}

function budgetItemHtml(label, used, limit, key) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const status = used > limit ? 'danger' : pct >= 85 ? 'warning' : 'positive';
  const action = key === 'overall' ? '' : `<button class="text-btn danger-text" type="button" onclick="deleteBudget('${escapeHtml(key)}')">Remove</button>`;
  return `<div class="budget-item ${status}"><div><strong>${escapeHtml(label)}</strong><div class="muted">${money(used)} used of ${money(limit)} - ${Math.max(0, 100 - pct)}% available</div><div class="progress"><span style="width:${pct}%"></span></div></div>${action}</div>`;
}

function deleteBudget(category) {
  delete state.budgets[category];
  saveState();
  renderAll();
  toast('Budget removed.');
}

function saveGoal(event) {
  event.preventDefault();
  const goal = {
    id: $('goalId').value || uid(),
    name: $('goalName').value.trim(),
    target: Number($('goalTarget').value),
    current: Number($('goalCurrent').value || 0),
    deadline: $('goalDeadline').value
  };
  if (!goal.name || !goal.target) {
    toast('Goal name and target are required.');
    return;
  }
  const index = state.goals.findIndex(item => item.id === goal.id);
  if (index >= 0) state.goals[index] = goal;
  else state.goals.push(goal);
  $('goalForm').reset();
  $('goalId').value = '';
  $('saveGoalBtn').textContent = 'Add Goal';
  saveState();
  renderAll();
  toast(index >= 0 ? 'Goal updated.' : 'Goal added.');
}

function renderGoals() {
  $('goalList').innerHTML = state.goals.length ? state.goals.map(goal => {
    const pct = goal.target ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0;
    const deadline = goal.deadline ? new Date(`${goal.deadline}T00:00:00`) : null;
    const months = deadline ? Math.max(1, Math.ceil((deadline - new Date()) / (1000 * 60 * 60 * 24 * 30))) : 1;
    const needed = Math.max(0, (goal.target - goal.current) / months);
    const status = pct >= 100 ? 'Funded' : deadline && deadline < new Date() ? 'Past deadline' : `${money(needed)}/month needed`;
    return `<div class="goal-item"><div><strong>${escapeHtml(goal.name)}</strong><div class="muted">${money(goal.current)} of ${money(goal.target)} - ${pct}% - ${escapeHtml(status)}</div><div class="progress"><span style="width:${pct}%"></span></div></div><div class="row-actions"><button class="text-btn" type="button" onclick="editGoal('${escapeHtml(goal.id)}')">Edit</button><button class="text-btn danger-text" type="button" onclick="deleteGoal('${escapeHtml(goal.id)}')">Delete</button></div></div>`;
  }).join('') : '<div class="empty-state">No savings goals yet.</div>';
}

function editGoal(id) {
  const goal = state.goals.find(item => item.id === id);
  if (!goal) return;
  $('goalId').value = goal.id;
  $('goalName').value = goal.name;
  $('goalTarget').value = goal.target;
  $('goalCurrent').value = goal.current;
  $('goalDeadline').value = goal.deadline || '';
  $('saveGoalBtn').textContent = 'Update Goal';
}

function deleteGoal(id) {
  state.goals = state.goals.filter(goal => goal.id !== id);
  saveState();
  renderAll();
  toast('Goal deleted.');
}

function saveRule(event) {
  event.preventDefault();
  const text = $('ruleText').value.trim();
  if (!text) return;
  state.rules.push({ id: uid(), field: 'any', text, category: $('ruleCategory').value, subcategory: '', needWant: '', fixedVariable: '' });
  event.target.reset();
  saveState();
  renderAll();
  toast('Rule added.');
}

function renderRules() {
  $('ruleList').innerHTML = state.rules.map(rule => `<div class="rule-item"><div>If merchant or notes contain <strong>${escapeHtml(rule.text)}</strong>, use ${escapeHtml(rule.category)}</div><button class="text-btn danger-text" type="button" onclick="deleteRule('${escapeHtml(rule.id)}')">Delete</button></div>`).join('');
}

function deleteRule(id) {
  state.rules = state.rules.filter(rule => rule.id !== id);
  saveState();
  renderAll();
  toast('Rule deleted.');
}

function saveCategory(event) {
  event.preventDefault();
  const category = $('newCategory').value.trim();
  if (!category) return;
  if (!state.categories.includes(category)) state.categories.push(category);
  event.target.reset();
  saveState();
  renderAll();
  toast('Category saved.');
}

function renderCategories() {
  $('categoryList').innerHTML = state.categories.map(category => `<div class="category-item"><span>${escapeHtml(category)}</span><button class="text-btn danger-text" type="button" onclick="deleteCategory('${escapeHtml(category)}')">Delete</button></div>`).join('');
}

function deleteCategory(category) {
  if (DEFAULT_CATEGORIES.includes(category)) {
    toast('Default categories are protected.');
    return;
  }
  state.categories = state.categories.filter(item => item !== category);
  saveState();
  renderAll();
  toast('Category deleted.');
}

function exportCSV() {
  const rows = [
    ['date', 'type', 'amount', 'category', 'subcategory', 'merchant', 'paymentMethod', 'tags', 'needWant', 'fixedVariable', 'recurring', 'notes'],
    ...state.transactions.map(tx => [tx.date, tx.type, tx.amount, tx.category, tx.subcategory, tx.merchant, tx.paymentMethod, (tx.tags || []).join('|'), tx.needWant, tx.fixedVariable, tx.recurring, tx.notes])
  ];
  downloadBlob(rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n'), 'pennywise_transactions.csv', 'text/csv;charset=utf-8');
}

function exportJSON() {
  state.lastBackupReminder = today();
  saveState();
  downloadBlob(JSON.stringify(state, null, 2), 'pennywise_backup.json', 'application/json;charset=utf-8');
}

function downloadBlob(content, name, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = normalizeImportedState(JSON.parse(reader.result));
      saveState();
      renderAll();
      toast('Backup imported.');
    } catch {
      toast('Invalid JSON backup.');
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

function clearAllData() {
  const answer = prompt('This clears all PennyWise+ data in this browser. Type CLEAR to continue.');
  if (answer !== 'CLEAR') return;
  state = defaultState();
  saveState();
  renderAll();
  toast('Data cleared.');
}

function seedSampleData() {
  const sample = [
    ['2026-05-01', 'income', 2200, 'School/Work', 'TAMU Stipend', 'Direct Deposit', 'stipend', 'neutral', 'fixed', 'monthly'],
    ['2026-05-01', 'expense', 850, 'Rent/Housing', 'Apartment', 'Bank Transfer', 'rent', 'need', 'fixed', 'monthly'],
    ['2026-05-02', 'expense', 42.18, 'Groceries', 'HEB', 'Debit', 'food', 'need', 'variable', 'none'],
    ['2026-05-03', 'expense', 12.95, 'Eating Out', 'Torchys', 'Credit', 'tacos', 'want', 'variable', 'none'],
    ['2026-05-04', 'expense', 9.99, 'Subscriptions', 'Spotify', 'Credit', 'music', 'want', 'fixed', 'monthly'],
    ['2026-05-05', 'expense', 33.20, 'Gas', 'Shell', 'Credit', 'car', 'need', 'variable', 'none'],
    ['2026-05-06', 'expense', 18.50, 'Fitness', 'Rec Sports', 'Debit', 'health', 'need', 'variable', 'none'],
    ['2026-05-08', 'expense', 64.77, 'Shopping', 'Walmart', 'Debit', 'supplies', 'want', 'variable', 'none']
  ];
  const existing = new Set(state.transactions.map(duplicateKey));
  const additions = sample.map(row => normalizeTransaction({
    date: row[0],
    type: row[1],
    amount: row[2],
    category: row[3],
    merchant: row[4],
    paymentMethod: row[5],
    tags: [row[6]],
    needWant: row[7],
    fixedVariable: row[8],
    recurring: row[9],
    notes: 'Sample transaction'
  })).filter(tx => tx && !existing.has(duplicateKey(tx)));
  state.transactions.push(...additions);
  state.monthlyBudget = state.monthlyBudget || 1400;
  state.budgets = { Groceries: 250, 'Eating Out': 120, Gas: 120, Subscriptions: 50, ...state.budgets };
  if (!state.goals.length) state.goals.push({ id: uid(), name: 'Emergency fund', target: 1000, current: 275, deadline: '2026-12-31' });
  saveState();
  renderAll();
  toast(additions.length ? 'Sample data loaded.' : 'Sample data was already loaded.');
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (current || row.length) {
        row.push(current);
        rows.push(row);
        row = [];
        current = '';
      }
      if (char === '\r' && next === '\n') index += 1;
    } else {
      current += char;
    }
  }
  if (current || row.length) {
    row.push(current);
    rows.push(row);
  }
  return rows.filter(rowValues => rowValues.some(cell => String(cell).trim()));
}

function handleCsvFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    csvRows = parseCSV(reader.result);
    importPreview = [];
    buildMapping(csvRows[0] || []);
    $('previewBody').innerHTML = '';
    $('previewCount').textContent = '0 rows';
    $('saveImportBtn').disabled = true;
    $('importSummary').textContent = csvRows.length > 1 ? `Loaded ${csvRows.length - 1} row(s). Map columns, then preview.` : 'CSV has no importable rows.';
  };
  reader.readAsText(file);
}

function buildMapping(headers) {
  const fields = [
    ['date', 'Date'],
    ['description', 'Description/notes'],
    ['merchant', 'Merchant/vendor'],
    ['amount', 'Amount'],
    ['debit', 'Debit'],
    ['credit', 'Credit'],
    ['category', 'Category'],
    ['paymentMethod', 'Payment method'],
    ['notes', 'Extra notes'],
    ['tags', 'Tags']
  ];
  $('mappingArea').innerHTML = fields.map(([field, label]) => {
    const options = headers.map((header, index) => `<option value="${index}" ${isLikelyColumn(field, header) ? 'selected' : ''}>${escapeHtml(header)}</option>`).join('');
    return `<div class="field"><label for="map_${field}">${escapeHtml(label)}</label><select id="map_${field}"><option value="">None</option>${options}</select></div>`;
  }).join('');
}

function isLikelyColumn(field, header) {
  const h = normalizeText(header).replace(/[_-]/g, ' ');
  const tests = {
    date: /date|posted|transaction date/,
    description: /description|desc|memo|details|name/,
    merchant: /merchant|vendor|payee|source/,
    amount: /^amount$|transaction amount|net/,
    debit: /debit|withdrawal|spent|charge/,
    credit: /credit|deposit|income/,
    category: /category/,
    paymentMethod: /payment|method|account/,
    notes: /note|memo/,
    tags: /tag/
  };
  return tests[field]?.test(h);
}

function getMap(field) {
  const value = $(`map_${field}`)?.value;
  return value === '' || value === undefined ? null : Number(value);
}

function rowValue(row, field) {
  const index = getMap(field);
  return index === null ? '' : String(row[index] || '').trim();
}

function previewImport() {
  if (csvRows.length < 2) {
    toast('Choose a CSV first.');
    return;
  }
  const existing = new Set(state.transactions.map(duplicateKey));
  importStats = { imported: 0, duplicates: 0, errors: 0 };
  importPreview = [];
  csvRows.slice(1).forEach(row => {
    const date = parseDate(rowValue(row, 'date'));
    const description = rowValue(row, 'description');
    const merchant = rowValue(row, 'merchant') || description;
    const notes = [rowValue(row, 'notes'), description && merchant !== description ? description : ''].filter(Boolean).join(' - ');
    let amount = parseMoney(rowValue(row, 'amount'));
    let type = amount < 0 ? 'expense' : 'income';
    if (!amount) {
      const debit = parseMoney(rowValue(row, 'debit'));
      const credit = parseMoney(rowValue(row, 'credit'));
      amount = Math.abs(debit || credit);
      type = credit ? 'income' : 'expense';
    }
    const ruleDefaults = applyRules(merchant, notes, amount);
    const tx = normalizeTransaction({
      date,
      type,
      amount: Math.abs(amount),
      category: rowValue(row, 'category') || ruleDefaults.category,
      subcategory: ruleDefaults.subcategory,
      merchant,
      paymentMethod: rowValue(row, 'paymentMethod') || 'Imported',
      tags: rowValue(row, 'tags') ? rowValue(row, 'tags').split(/[|,]/).map(tag => tag.trim()).filter(Boolean) : ['imported'],
      needWant: ruleDefaults.needWant,
      fixedVariable: ruleDefaults.fixedVariable,
      recurring: 'none',
      notes: notes || 'Imported from CSV'
    });
    if (!tx) {
      importStats.errors += 1;
      return;
    }
    const key = duplicateKey(tx);
    if (existing.has(key) || importPreview.some(item => duplicateKey(item) === key)) {
      importStats.duplicates += 1;
      return;
    }
    importPreview.push(tx);
    importStats.imported += 1;
  });
  $('previewBody').innerHTML = importPreview.map(tx => `<tr><td>${escapeHtml(tx.date)}</td><td>${money(tx.amount)}</td><td>${escapeHtml(tx.type)}</td><td>${escapeHtml(tx.merchant)}</td><td>${escapeHtml(tx.category)}</td><td>${escapeHtml(tx.notes)}</td></tr>`).join('');
  $('previewCount').textContent = `${importPreview.length} row(s)`;
  $('saveImportBtn').disabled = !importPreview.length;
  $('importSummary').textContent = `Preview ready: ${importStats.imported} importable, ${importStats.duplicates} duplicate(s) skipped, ${importStats.errors} error(s).`;
}

function saveImportPreview() {
  if (!importPreview.length) return;
  state.transactions.push(...importPreview);
  const count = importPreview.length;
  importPreview = [];
  saveState();
  $('saveImportBtn').disabled = true;
  $('previewBody').innerHTML = '';
  $('previewCount').textContent = '0 rows';
  $('importSummary').textContent = `Saved ${count} imported transaction(s). Skipped ${importStats.duplicates} duplicate(s).`;
  renderAll();
  toast('Imported transactions saved.');
}

function renderReport() {
  const list = filteredTransactions();
  const summary = getSummary(list);
  $('reportRange').textContent = `${$('dateFrom').value || 'Start'} to ${$('dateTo').value || 'Today'}`;
  $('reportSummary').innerHTML = `<div><span class="muted">Income</span><h3>${money(summary.income)}</h3></div><div><span class="muted">Expenses</span><h3>${money(summary.expenseTotal)}</h3></div><div><span class="muted">Net</span><h3>${money(summary.net)}</h3></div><div><span class="muted">Transactions</span><h3>${list.length}</h3></div>`;
  $('reportInsights').innerHTML = buildInsights().map(item => `<div class="insight">${item}</div>`).join('');
  $('reportBudget').innerHTML = Object.entries(state.budgets).map(([category, limit]) => {
    const used = summary.byCat[category] || 0;
    return `<div class="insight">${escapeHtml(category)}: ${money(used)} used of ${money(limit)}.</div>`;
  }).join('') || '<div class="insight">No category budgets set.</div>';
  $('reportGoals').innerHTML = state.goals.map(goal => `<div class="insight">${escapeHtml(goal.name)}: ${money(goal.current)} of ${money(goal.target)} saved.</div>`).join('') || '<div class="insight">No savings goals set.</div>';
  const largest = summary.expenses.sort((a, b) => b.amount - a.amount).slice(0, 8);
  $('largestBody').innerHTML = largest.map(tx => `<tr><td>${escapeHtml(tx.date)}</td><td>${money(tx.amount)}</td><td>${escapeHtml(tx.category)}</td><td>${escapeHtml(tx.merchant)}</td><td>${escapeHtml(tx.notes)}</td></tr>`).join('');
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // Service workers are optional; GitHub Pages still works without one.
  });
}

window.deleteBudget = deleteBudget;
window.editGoal = editGoal;
window.deleteGoal = deleteGoal;
window.deleteRule = deleteRule;
window.deleteCategory = deleteCategory;

document.addEventListener('DOMContentLoaded', init);
