// ===================== 状态 =====================
let uploadedFiles = [];
let billData = [];
let rowCounter = 0;

// ===================== 初始化 =====================
document.addEventListener('DOMContentLoaded', () => {
  loadApiConfig();
  setupDragDrop();
  setupFileInput();
  createToastContainer();
});

// ===================== Toast 提示 =====================
function createToastContainer() {
  const el = document.createElement('div');
  el.className = 'toast-container';
  el.id = 'toastContainer';
  document.body.appendChild(el);
}

function toast(msg, type = 'info', duration = 3000) {
  const c = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, duration);
}

// ===================== API 配置 =====================
function toggleApiConfig() {
  const body = document.getElementById('apiConfigBody');
  const icon = document.getElementById('toggleIcon');
  const isOpen = body.classList.contains('open');
  if (isOpen) { body.classList.remove('open'); icon.textContent = '▼'; }
  else { body.classList.add('open'); icon.textContent = '▲'; }
}

function saveApiConfig() {
  const config = {
    baseUrl: document.getElementById('apiBaseUrl').value,
    apiKey: document.getElementById('apiKey').value,
    model: document.getElementById('apiModel').value,
  };
  localStorage.setItem('billToolApiConfig', JSON.stringify(config));
  const hint = document.getElementById('saveHint');
  hint.textContent = '✓ 已保存';
  setTimeout(() => { hint.textContent = ''; }, 2000);
  toast('API 配置已保存', 'success');
}

function loadApiConfig() {
  const saved = localStorage.getItem('billToolApiConfig');
  if (saved) {
    const c = JSON.parse(saved);
    if (c.baseUrl) document.getElementById('apiBaseUrl').value = c.baseUrl;
    if (c.apiKey) document.getElementById('apiKey').value = c.apiKey;
    if (c.model) document.getElementById('apiModel').value = c.model;
  }
}

function getApiConfig() {
  return {
    baseUrl: document.getElementById('apiBaseUrl').value.replace(/\/$/, '') || 'https://api.moonshot.cn/v1',
    apiKey: document.getElementById('apiKey').value,
    model: document.getElementById('apiModel').value || 'moonshot-v1-8k',
  };
}

// ===================== 文件上传 =====================
function setupFileInput() {
  const input = document.getElementById('fileInput');
  input.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    addFiles(files);
    input.value = ''; // 允许重复选择同一文件
  });
}

function setupDragDrop() {
  const area = document.getElementById('uploadArea');
  area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    addFiles(files);
  });
}

function addFiles(files) {
  files.forEach(file => {
    if (!file.type.startsWith('image/')) return;
    uploadedFiles.push(file);
    renderPreview(file, uploadedFiles.length - 1);
  });
  updateUploadUI();
}

function renderPreview(file, index) {
  const grid = document.getElementById('previewGrid');
  const placeholder = document.getElementById('uploadPlaceholder');
  placeholder.style.display = 'none';
  grid.style.display = 'grid';

  const reader = new FileReader();
  reader.onload = (e) => {
    const item = document.createElement('div');
    item.className = 'preview-item';
    item.id = `preview-${index}`;
    item.innerHTML = `
      <img src="${e.target.result}" alt="${file.name}">
      <button class="preview-delete" onclick="removeFile(${index})" title="删除">✕</button>
    `;
    grid.appendChild(item);
  };
  reader.readAsDataURL(file);
}

function removeFile(index) {
  uploadedFiles[index] = null;
  const el = document.getElementById(`preview-${index}`);
  if (el) el.remove();
  // 清除 null
  uploadedFiles = uploadedFiles.filter(Boolean);
  // 重建预览（简单处理）
  const grid = document.getElementById('previewGrid');
  grid.innerHTML = '';
  if (uploadedFiles.length === 0) {
    grid.style.display = 'none';
    document.getElementById('uploadPlaceholder').style.display = 'flex';
  } else {
    uploadedFiles.forEach((f, i) => renderPreview(f, i));
  }
  updateUploadUI();
}

function updateUploadUI() {
  const btn = document.getElementById('recognizeBtn');
  btn.disabled = uploadedFiles.length === 0;
}

// ===================== AI 识别 =====================
async function startRecognize() {
  const config = getApiConfig();
  if (!config.apiKey) {
    // 没有配置 API Key，展开配置区
    const body = document.getElementById('apiConfigBody');
    body.classList.add('open');
    document.getElementById('toggleIcon').textContent = '▲';
    toast('请先配置 API Key', 'error');
    return;
  }

  if (uploadedFiles.length === 0) {
    toast('请先上传图片', 'error');
    return;
  }

  showLoading(true, `正在识别 ${uploadedFiles.length} 张图片...`);

  try {
    // 将所有图片转 base64
    const base64Images = await Promise.all(uploadedFiles.map(fileToBase64));
    const result = await callVisionAPI(config, base64Images);
    const parsed = parseAIResult(result);
    billData = [...billData, ...parsed.rows];
    renderTable();
    document.getElementById('rawText').textContent = result;
    showSection('tableSection');
    toast(`识别成功，共提取 ${parsed.rows.length} 条记录`, 'success');
  } catch (err) {
    console.error(err);
    toast(`识别失败: ${err.message}`, 'error', 5000);
  } finally {
    showLoading(false);
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve({ base64: e.target.result.split(',')[1], type: file.type });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function callVisionAPI(config, images) {
  const content = [
    {
      type: 'text',
      text: `请仔细识别图片中的账单或财务记录，提取所有账单条目，并以如下 JSON 格式返回（只返回 JSON，不要有其他文字）：
{
  "rows": [
    {
      "date": "2024-01-01",
      "description": "摘要说明",
      "category": "类别",
      "income": 0,
      "expense": 0,
      "note": "备注"
    }
  ]
}

要求：
- date：账单日期，格式 YYYY-MM-DD，若无日期则留空字符串
- description：交易摘要或说明，尽量简洁
- category：根据内容自动分类，如：餐饮、交通、购物、转账、工资、其他等
- income：收入金额，数字，无则填 0
- expense：支出金额，数字，无则填 0
- note：其他备注信息

如果图片中有多笔记录，每笔单独一个对象。`
    },
    ...images.map(img => ({
      type: 'image_url',
      image_url: { url: `data:${img.type};base64,${img.base64}`, detail: 'high' }
    }))
  ];

  const resp = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content }],
      max_tokens: 4096,
      temperature: 0.1,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${resp.status}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

function parseAIResult(text) {
  // 尝试提取 JSON
  try {
    // 找到 { 和 } 之间的内容
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const obj = JSON.parse(match[0]);
      if (Array.isArray(obj.rows)) {
        return { rows: obj.rows.map(normalizeRow) };
      }
    }
  } catch (e) { /* ignore */ }

  // 如果 JSON 解析失败，返回一行原始文本
  return {
    rows: [{
      date: '',
      description: '无法解析，请手动填写',
      category: '其他',
      income: 0,
      expense: 0,
      note: text.slice(0, 200),
    }]
  };
}

function normalizeRow(r) {
  return {
    date: r.date || '',
    description: r.description || '',
    category: r.category || '其他',
    income: parseFloat(r.income) || 0,
    expense: parseFloat(r.expense) || 0,
    note: r.note || '',
  };
}

// ===================== 表格渲染 =====================
const CATEGORIES = ['餐饮', '交通', '购物', '娱乐', '工资', '转账', '医疗', '教育', '住房', '通讯', '其他'];

function renderTable() {
  const tbody = document.getElementById('billTableBody');
  tbody.innerHTML = '';
  rowCounter = 0;
  billData.forEach((row, i) => {
    tbody.appendChild(createRow(row, i));
    rowCounter++;
  });
  updateSummary();
}

function createRow(row, index) {
  const tr = document.createElement('tr');
  tr.id = `row-${index}`;
  const catOptions = CATEGORIES.map(c => `<option value="${c}" ${c === row.category ? 'selected' : ''}>${c}</option>`).join('');
  tr.innerHTML = `
    <td class="row-num">${index + 1}</td>
    <td><input type="date" value="${row.date}" onchange="updateCell(${index},'date',this.value)"></td>
    <td><input type="text" value="${row.description}" placeholder="摘要说明" onchange="updateCell(${index},'description',this.value)"></td>
    <td>
      <select onchange="updateCell(${index},'category',this.value)">
        ${catOptions}
        <option value="${row.category}" ${!CATEGORIES.includes(row.category) ? 'selected' : ''}>${!CATEGORIES.includes(row.category) ? row.category : ''}</option>
      </select>
    </td>
    <td class="cell-income"><input type="number" min="0" step="0.01" value="${row.income || ''}" placeholder="0.00" onchange="updateCell(${index},'income',parseFloat(this.value)||0)"></td>
    <td class="cell-expense"><input type="number" min="0" step="0.01" value="${row.expense || ''}" placeholder="0.00" onchange="updateCell(${index},'expense',parseFloat(this.value)||0)"></td>
    <td><input type="text" value="${row.note || ''}" placeholder="备注" onchange="updateCell(${index},'note',this.value)"></td>
    <td><button class="btn-del-row" onclick="deleteRow(${index})" title="删除">🗑</button></td>
  `;
  return tr;
}

function updateCell(index, key, value) {
  if (billData[index]) {
    billData[index][key] = value;
    updateSummary();
  }
}

function deleteRow(index) {
  billData.splice(index, 1);
  renderTable();
}

function addRow() {
  billData.push({ date: '', description: '', category: '其他', income: 0, expense: 0, note: '' });
  renderTable();
  // 滚动到最后一行
  const tbody = document.getElementById('billTableBody');
  const lastRow = tbody.lastElementChild;
  if (lastRow) lastRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function updateSummary() {
  const validRows = billData.filter(r => r);
  const totalIncome = validRows.reduce((s, r) => s + (r.income || 0), 0);
  const totalExpense = validRows.reduce((s, r) => s + (r.expense || 0), 0);
  const net = totalIncome - totalExpense;

  document.getElementById('totalCount').textContent = validRows.length;
  document.getElementById('totalIncome').textContent = `¥${totalIncome.toFixed(2)}`;
  document.getElementById('totalExpense').textContent = `¥${totalExpense.toFixed(2)}`;
  const netEl = document.getElementById('netAmount');
  netEl.textContent = `¥${net.toFixed(2)}`;
  netEl.style.color = net >= 0 ? 'var(--success)' : 'var(--danger)';
}

// ===================== 导出 =====================
function exportCSV() {
  if (billData.length === 0) { toast('没有数据可导出', 'error'); return; }
  const headers = ['序号', '日期', '摘要/说明', '类别', '收入(元)', '支出(元)', '备注'];
  const rows = billData.map((r, i) => [
    i + 1, r.date, `"${r.description}"`, r.category, r.income || 0, r.expense || 0, `"${r.note || ''}"`
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel
  downloadFile(BOM + csv, '账单明细.csv', 'text/csv;charset=utf-8');
  toast('CSV 导出成功', 'success');
}

function exportExcel() {
  if (billData.length === 0) { toast('没有数据可导出', 'error'); return; }
  // 使用简单 HTML 表格，Excel 可直接打开
  const headers = ['序号', '日期', '摘要/说明', '类别', '收入(元)', '支出(元)', '备注'];
  const totalIncome = billData.reduce((s, r) => s + (r.income || 0), 0);
  const totalExpense = billData.reduce((s, r) => s + (r.expense || 0), 0);

  const rows = billData.map((r, i) =>
    `<tr>
      <td>${i + 1}</td>
      <td>${r.date}</td>
      <td>${r.description}</td>
      <td>${r.category}</td>
      <td style="color:green">${r.income || 0}</td>
      <td style="color:red">${r.expense || 0}</td>
      <td>${r.note || ''}</td>
    </tr>`
  ).join('');

  const html = `<html><head><meta charset="UTF-8"></head><body>
    <table border="1" style="border-collapse:collapse;font-family:Arial;font-size:13px">
      <thead><tr style="background:#f3f4f6">${headers.map(h => `<th style="padding:8px 12px">${h}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:#f9fafb;font-weight:bold">
          <td colspan="4" style="padding:8px 12px;text-align:right">合计</td>
          <td style="padding:8px 12px;color:green">${totalIncome.toFixed(2)}</td>
          <td style="padding:8px 12px;color:red">${totalExpense.toFixed(2)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </body></html>`;

  downloadFile(html, '账单明细.xls', 'application/vnd.ms-excel;charset=utf-8');
  toast('Excel 导出成功', 'success');
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===================== 清空 =====================
function clearAll() {
  if (billData.length === 0) return;
  if (!confirm('确定要清空所有账单数据吗？')) return;
  billData = [];
  renderTable();
  toast('数据已清空', 'info');
}

// ===================== 原始文本折叠 =====================
function toggleRaw() {
  const body = document.getElementById('rawResultBody');
  const icon = document.getElementById('rawToggleIcon');
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  icon.textContent = isOpen ? '▶' : '▼';
}

// ===================== 重置上传 =====================
function resetUpload() {
  uploadedFiles = [];
  const grid = document.getElementById('previewGrid');
  grid.innerHTML = '';
  grid.style.display = 'none';
  document.getElementById('uploadPlaceholder').style.display = 'flex';
  updateUploadUI();
  // 保留已识别数据，只重置上传区
  document.getElementById('uploadSection').style.display = 'block';
  document.getElementById('tableSection').style.display = billData.length > 0 ? 'block' : 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===================== UI 控制 =====================
function showLoading(show, text = '') {
  const loadingSection = document.getElementById('loadingSection');
  loadingSection.style.display = show ? 'block' : 'none';
  if (show) {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('tableSection').style.display = 'none';
  } else {
    document.getElementById('uploadSection').style.display = 'block';
  }
}

function showSection(id) {
  document.getElementById(id).style.display = 'block';
  document.getElementById(id).scrollIntoView({ behavior: 'smooth', block: 'start' });
}
