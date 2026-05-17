const STORAGE_KEY = "leave-planner-v2";
const LEGACY_STORAGE_KEY = "leave-planner-v1";
const EDITOR_NAME_KEY = "leave-planner-editor-name";
const EDITOR_VH_KEY = "leave-planner-editor-vh";
const EDITOR_ID_KEY = "leave-planner-editor-id";
const API_STATE_URL = "/api/state";
const API_EMPLOYEE_URL = "/api/employee";
const API_AUDIT_URL = "/api/audit";
const SYNC_INTERVAL_MS = 4000;
const VIEW_MODE_FULL = "full";
const VIEW_MODE_PRESENTATION = "presentation";
const MONTH_NAMES = [
  "Tháng 1",
  "Tháng 2",
  "Tháng 3",
  "Tháng 4",
  "Tháng 5",
  "Tháng 6",
  "Tháng 7",
  "Tháng 8",
  "Tháng 9",
  "Tháng 10",
  "Tháng 11",
  "Tháng 12",
];

const HOLIDAYS_BY_YEAR = {
  2026: {
    "2026-01-01": "Tết Dương lịch",
    "2026-01-02": "Nghỉ Tết Dương lịch",
    "2026-02-16": "Tết Nguyên đán",
    "2026-02-17": "Tết Nguyên đán",
    "2026-02-18": "Tết Nguyên đán",
    "2026-02-19": "Tết Nguyên đán",
    "2026-02-20": "Tết Nguyên đán",
    "2026-04-26": "Giỗ Tổ Hùng Vương",
    "2026-04-27": "Nghỉ bù Giỗ Tổ",
    "2026-04-30": "Ngày Thống nhất",
    "2026-05-01": "Quốc tế Lao động",
    "2026-09-01": "Nghỉ Quốc khánh",
    "2026-09-02": "Quốc khánh",
  },
};

const FIXED_HOLIDAYS = {
  "01-01": "Tết Dương lịch",
  "04-30": "Ngày Thống nhất",
  "05-01": "Quốc tế Lao động",
  "09-02": "Quốc khánh",
};

let flashCells = new Set();
let flashTimer = null;
let renderQueued = false;
let dateInfoCache = new Map();
let lastServerRevision = 0;
let pollingTimer = null;
let isApplyingRemote = false;
const state = loadState();

const els = {
  yearInput: document.querySelector("#yearInput"),
  monthSelect: document.querySelector("#monthSelect"),
  prevMonthBtn: document.querySelector("#prevMonthBtn"),
  nextMonthBtn: document.querySelector("#nextMonthBtn"),
  tableHead: document.querySelector("#tableHead"),
  tableBody: document.querySelector("#tableBody"),
  searchInput: document.querySelector("#searchInput"),
  presentationToggleBtn: document.querySelector("#presentationToggleBtn"),
  totalPeople: document.querySelector("#totalPeople"),
  totalRemain: document.querySelector("#totalRemain"),
  metricPeople: document.querySelector("#metricPeople"),
  metricParts: document.querySelector("#metricParts"),
  metricRemain: document.querySelector("#metricRemain"),
  metricUsed: document.querySelector("#metricUsed"),
  metricUtilization: document.querySelector("#metricUtilization"),
  metricPlan: document.querySelector("#metricPlan"),
  metricRisk: document.querySelector("#metricRisk"),
  controlScore: document.querySelector("#controlScore"),
  insightTitle: document.querySelector("#insightTitle"),
  insightText: document.querySelector("#insightText"),
  balanceList: document.querySelector("#balanceList"),
  openBalanceZoomBtn: document.querySelector("#openBalanceZoomBtn"),
  balanceZoomDialog: document.querySelector("#balanceZoomDialog"),
  closeBalanceZoomBtn: document.querySelector("#closeBalanceZoomBtn"),
  balanceListZoom: document.querySelector("#balanceListZoom"),
  remainChart: document.querySelector("#remainChart"),
  selectedName: document.querySelector("#selectedName"),
  selectedCode: document.querySelector("#selectedCode"),
  selectedPart: document.querySelector("#selectedPart"),
  selectedPosition: document.querySelector("#selectedPosition"),
  selectedEntitlement: document.querySelector("#selectedEntitlement"),
  selectedUsedYear: document.querySelector("#selectedUsedYear"),
  selectedUsedMonth: document.querySelector("#selectedUsedMonth"),
  selectedRemain: document.querySelector("#selectedRemain"),
  quickUpdateForm: document.querySelector("#quickUpdateForm"),
  quickCodeInput: document.querySelector("#quickCodeInput"),
  quickTypeSelect: document.querySelector("#quickTypeSelect"),
  quickStartInput: document.querySelector("#quickStartInput"),
  quickEndInput: document.querySelector("#quickEndInput"),
  quickMessage: document.querySelector("#quickMessage"),
  editorVhInput: document.querySelector("#editorVhInput"),
  addEmployeeBtn: document.querySelector("#addEmployeeBtn"),
  resetDemoBtn: document.querySelector("#resetDemoBtn"),
  viewAuditBtn: document.querySelector("#viewAuditBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importInput: document.querySelector("#importInput"),
  dialog: document.querySelector("#employeeDialog"),
  form: document.querySelector("#employeeForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  closeDialogBtn: document.querySelector("#closeDialogBtn"),
  cancelDialogBtn: document.querySelector("#cancelDialogBtn"),
  deleteEmployeeBtn: document.querySelector("#deleteEmployeeBtn"),
  employeeId: document.querySelector("#employeeId"),
  partInput: document.querySelector("#partInput"),
  codeInput: document.querySelector("#codeInput"),
  nameInput: document.querySelector("#nameInput"),
  positionInput: document.querySelector("#positionInput"),
  hireDateInput: document.querySelector("#hireDateInput"),
  advanceInput: document.querySelector("#advanceInput"),
  auditDialog: document.querySelector("#auditDialog"),
  closeAuditBtn: document.querySelector("#closeAuditBtn"),
  closeAuditBtn2: document.querySelector("#closeAuditBtn2"),
  refreshAuditBtn: document.querySelector("#refreshAuditBtn"),
  auditPassInput: document.querySelector("#auditPassInput"),
  auditMonthInput: document.querySelector("#auditMonthInput"),
  auditMessage: document.querySelector("#auditMessage"),
  auditList: document.querySelector("#auditList"),
};

init();

function init() {
  els.yearInput.value = state.year;
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "Cả năm";
  els.monthSelect.appendChild(allOption);
  MONTH_NAMES.forEach((name, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = name;
    els.monthSelect.appendChild(option);
  });
  els.monthSelect.value = state.month === "all" ? "all" : String(state.month);
  bindEvents();
  initializeAuditMonthInput();
  hydrateEditorVhInput();
  applyViewMode();
  render();
  bootstrapRemote();
}

function initializeAuditMonthInput() {
  if (!els.auditMonthInput) return;
  if (!els.auditMonthInput.value) {
    els.auditMonthInput.value = formatMonthInput(new Date());
  }
}

function hydrateEditorVhInput() {
  if (!els.editorVhInput) return;
  const stored = (localStorage.getItem(EDITOR_VH_KEY) || localStorage.getItem(EDITOR_NAME_KEY) || "").trim().toUpperCase();
  if (stored) els.editorVhInput.value = stored;
}

function handleEditorVhInput() {
  if (!els.editorVhInput) return;
  const normalized = String(els.editorVhInput.value || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  if (normalized !== els.editorVhInput.value) {
    els.editorVhInput.value = normalized;
  }
}

function persistEditorVhFromInput() {
  if (!els.editorVhInput) return;
  const vh = String(els.editorVhInput.value || "").trim().toUpperCase();
  if (!vh) return;
  if (!isValidEditorVh(vh)) {
    showQuickMessage("Mã VH chưa đúng định dạng. VD: VH4354", true);
    return;
  }
  localStorage.setItem(EDITOR_VH_KEY, vh);
  localStorage.setItem(EDITOR_NAME_KEY, vh);
}

function bindEvents() {
  els.yearInput.addEventListener("change", () => {
    state.year = normalizeYear(els.yearInput.value, new Date().getFullYear());
    els.yearInput.value = state.year;
    persistAndRender();
  });
  els.monthSelect.addEventListener("change", () => {
    state.month = els.monthSelect.value === "all" ? "all" : Number(els.monthSelect.value);
    persistAndRender();
  });
  els.prevMonthBtn.addEventListener("click", () => moveMonth(-1));
  els.nextMonthBtn.addEventListener("click", () => moveMonth(1));
  els.searchInput.addEventListener("input", scheduleRender);
  els.presentationToggleBtn.addEventListener("click", togglePresentationMode);
  els.tableBody.addEventListener("click", handleTableClick);
  els.openBalanceZoomBtn.addEventListener("click", openBalanceZoomDialog);
  els.editorVhInput.addEventListener("input", handleEditorVhInput);
  els.editorVhInput.addEventListener("change", persistEditorVhFromInput);
  els.editorVhInput.addEventListener("blur", persistEditorVhFromInput);
  els.quickUpdateForm.addEventListener("submit", applyQuickUpdate);
  els.addEmployeeBtn.addEventListener("click", () => openEmployeeDialog());
  els.resetDemoBtn.addEventListener("click", reloadLatestData);
  els.viewAuditBtn.addEventListener("click", openAuditDialog);
  els.exportBtn.addEventListener("click", exportData);
  els.importInput.addEventListener("change", importData);
  els.closeDialogBtn.addEventListener("click", () => els.dialog.close());
  els.cancelDialogBtn.addEventListener("click", () => els.dialog.close());
  els.deleteEmployeeBtn.addEventListener("click", deleteCurrentEmployee);
  els.form.addEventListener("submit", saveEmployee);
  els.closeBalanceZoomBtn.addEventListener("click", () => els.balanceZoomDialog.close());
  els.closeAuditBtn.addEventListener("click", () => els.auditDialog.close());
  els.closeAuditBtn2.addEventListener("click", () => els.auditDialog.close());
  els.refreshAuditBtn.addEventListener("click", loadAuditLogs);
}

async function bootstrapRemote() {
  const remote = await fetchStateFromServer();
  if (remote) {
    applyServerState(remote);
    render();
  }
  if (pollingTimer) window.clearInterval(pollingTimer);
  pollingTimer = window.setInterval(syncFromServer, SYNC_INTERVAL_MS);
}

function loadState() {
  const now = new Date();
  const fallback = {
    year: now.getFullYear(),
    month: "all",
    employees: [],
    selectedEmployeeId: "",
    viewMode: VIEW_MODE_FULL,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.employees)) return fallback;
    return {
      year: normalizeYear(parsed.year, fallback.year),
      month: normalizeMonth(parsed.month, fallback.month),
      employees: parsed.employees.map(normalizeEmployee),
      selectedEmployeeId: String(parsed.selectedEmployeeId || ""),
      viewMode: normalizeViewMode(parsed.viewMode || fallback.viewMode),
    };
  } catch {
    return fallback;
  }
}

function normalizeEmployee(employee = {}) {
  const safeEmployee = employee && typeof employee === "object" ? employee : {};
  return {
    id: String(safeEmployee.id || createId()),
    part: String(safeEmployee.part || ""),
    code: String(safeEmployee.code || ""),
    name: String(safeEmployee.name || ""),
    position: String(safeEmployee.position || ""),
    hireDate: isValidDateKey(safeEmployee.hireDate) ? safeEmployee.hireDate : "",
    advance: clamp(Number(safeEmployee.advance) || 0, 0, 365),
    leaves: normalizeLeaves(safeEmployee.leaves || {}),
  };
}

function normalizeLeaves(leaves) {
  if (!leaves || typeof leaves !== "object") return {};
  return Object.fromEntries(
    Object.entries(leaves)
      .filter(([dateKey]) => isValidDateKey(dateKey))
      .map(([dateKey, value]) => {
        if (value && typeof value === "object") {
          return [dateKey, { plan: Boolean(value.plan), actual: Boolean(value.actual) }];
        }
        return [dateKey, { plan: value === "plan" || value === "both", actual: value === "actual" || value === "both" }];
      })
  );
}

function persistAndRender(options = {}) {
  const { promptForActor = false, syncToServer = true, reason = "state.update" } = options;
  persistLocalBackup();
  scheduleRender();
  if (!isApplyingRemote && syncToServer) {
    pushStateToServer({ promptForActor, reason });
  }
}

function persistLocalBackup() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showQuickMessage("Browser không lưu được dữ liệu local. Hãy Export để backup.", true);
  }
}

function normalizeViewMode(value) {
  return value === VIEW_MODE_PRESENTATION ? VIEW_MODE_PRESENTATION : VIEW_MODE_FULL;
}

function togglePresentationMode() {
  state.viewMode = state.viewMode === VIEW_MODE_PRESENTATION ? VIEW_MODE_FULL : VIEW_MODE_PRESENTATION;
  persistLocalBackup();
  applyViewMode();
  scheduleRender();
}

function applyViewMode() {
  const presentation = state.viewMode === VIEW_MODE_PRESENTATION;
  document.body.classList.toggle("presentation-mode", presentation);
  els.presentationToggleBtn.textContent = presentation ? "Back To Full View" : "Presentation View";
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  window.requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

async function reloadLatestData() {
  const synced = await syncFromServer({ force: true });
  if (synced) {
    showQuickMessage("Đã tải dữ liệu mới nhất từ server.");
  } else {
    showQuickMessage("Không tải được dữ liệu mới nhất. Kiểm tra kết nối server.", true);
  }
}

function moveMonth(delta) {
  if (state.month === "all") {
    state.month = delta > 0 ? 0 : 11;
  } else {
    const next = state.month + delta;
    if (next < 0) {
      state.month = 11;
      state.year -= 1;
    } else if (next > 11) {
      state.month = 0;
      state.year += 1;
    } else {
      state.month = next;
    }
  }
  els.yearInput.value = state.year;
  els.monthSelect.value = state.month === "all" ? "all" : String(state.month);
  persistAndRender();
}

function render() {
  applyViewMode();
  const columns = getDateColumns();
  const filtered = filteredEmployees();
  const view = buildEmployeeView(filtered);
  renderHead(columns);
  renderBody(columns, view);
  renderSelectedEmployee();
  renderSummary(view);
  renderBalanceList(view);
  renderChart(view);
}

function getDateColumns() {
  dateInfoCache = new Map();
  const months = state.month === "all" ? [...Array(12).keys()] : [state.month];
  const columns = [];
  months.forEach((month, monthIndex) => {
    for (let day = 1; day <= daysInMonth(state.year, month); day += 1) {
      const dateKey = makeDateKey(state.year, month, day);
      const info = getDateInfo(dateKey);
      columns.push({ type: "day", month, day, dateKey, ...info });
    }
    if (state.month === "all" && monthIndex < months.length - 1) {
      columns.push({ type: "gap", month });
    }
  });
  return columns;
}

function renderHead(columns) {
  const fixedHeaders = [
    ["No", "col-no sticky-col"],
    ["Part/Sec.", "col-part sticky-col"],
    ["ID code", "col-code sticky-col"],
    ["Name", "col-name sticky-col"],
    ["Position", "col-position sticky-col"],
    ["Plan/Actual", ""],
    ["Hire date", ""],
    ["Exp.", "meta-cell"],
    [`AL ${state.year}`, "meta-cell"],
    ["Used", "meta-cell"],
    ["Remain", "meta-cell"],
    ["Edit", ""],
  ];
  const topRow = document.createElement("tr");
  fixedHeaders.forEach(([label, className]) => {
    const th = document.createElement("th");
    th.textContent = label;
    th.className = className;
    th.rowSpan = 2;
    topRow.appendChild(th);
  });

  const months = monthGroups(columns);
  months.forEach((group) => {
    const th = document.createElement("th");
    th.colSpan = group.count;
    th.textContent = MONTH_NAMES[group.month];
    th.className = "month-head";
    topRow.appendChild(th);
    if (group.hasGap) {
      const gap = document.createElement("th");
      gap.rowSpan = 2;
      gap.className = "month-gap";
      topRow.appendChild(gap);
    }
  });

  const dayRow = document.createElement("tr");
  columns
    .filter((column) => column.type === "day")
    .forEach((column) => {
      const th = document.createElement("th");
      th.className = column.dayClass;
      th.textContent = String(column.day);
      th.title = column.title;
      dayRow.appendChild(th);
    });

  els.tableHead.replaceChildren(topRow, dayRow);
}

function monthGroups(columns) {
  const groups = [];
  columns.forEach((column) => {
    if (column.type === "gap") {
      groups[groups.length - 1].hasGap = true;
      return;
    }
    const last = groups[groups.length - 1];
    if (!last || last.month !== column.month) {
      groups.push({ month: column.month, count: 1, hasGap: false });
    } else {
      last.count += 1;
    }
  });
  return groups;
}

function buildEmployeeView(employees) {
  return employees.map((employee, index) => {
    const balance = calculateBalance(employee, state.year);
    return {
      employee,
      index,
      balance,
      warning: shouldWarn(balance.remain),
      planned: countPlannedLeave(employee, state.year),
    };
  });
}

function renderBody(columns, view) {
  const fragment = document.createDocumentFragment();
  view.forEach((item) => {
    fragment.appendChild(renderEmployeeRow(item, "plan", columns));
    fragment.appendChild(renderEmployeeRow(item, "actual", columns));
  });
  els.tableBody.replaceChildren(fragment);
}

function renderEmployeeRow(item, type, columns) {
  const { employee, index, balance, warning } = item;
  const row = document.createElement("tr");
  row.dataset.employeeId = employee.id;
  row.classList.add("employee-row");
  const isSelected = state.selectedEmployeeId === employee.id;
  if (isSelected) {
    row.classList.add("selected-employee-row");
  }
  const isPlan = type === "plan";
  if (isPlan) {
    [
      { value: String(index + 1), className: "col-no sticky-col" },
      { value: employee.part, className: "col-part sticky-col" },
      { value: employee.code, className: "col-code sticky-col" },
      {
        value: employee.name,
        className: `col-name sticky-col selectable-cell ${warning ? "name-warning" : ""} ${isSelected ? "selected-name" : ""}`,
        action: "select-employee",
      },
      { value: employee.position || "-", className: "col-position sticky-col" },
    ].forEach(({ value, className, action }) => {
      const td = document.createElement("td");
      td.textContent = value;
      td.className = className;
      td.rowSpan = 2;
      if (action) {
        td.dataset.action = action;
        td.dataset.employeeId = employee.id;
        td.title = `Xem thống kê của ${employee.name}`;
      }
      row.appendChild(td);
    });
  }

  const rowType = document.createElement("td");
  rowType.textContent = isPlan ? "Plan" : "Actual";
  rowType.className = isPlan ? "plan-label" : "actual-label";
  row.appendChild(rowType);

  if (isPlan) {
    [
      [formatDate(employee.hireDate), ""],
      [String(balance.years), "meta-cell"],
      [formatNumber(balance.entitlement), "meta-cell"],
      [formatNumber(balance.used), "meta-cell"],
      [formatNumber(balance.remain), `meta-cell ${warning ? "remain-low" : "remain-ok"}`],
    ].forEach(([value, className]) => {
      const td = document.createElement("td");
      td.textContent = value;
      td.className = className;
      td.rowSpan = 2;
      row.appendChild(td);
    });

    const actionCell = document.createElement("td");
    actionCell.rowSpan = 2;
    const actionWrap = document.createElement("div");
    actionWrap.className = "employee-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.dataset.action = "edit";
    editButton.dataset.employeeId = employee.id;
    editButton.setAttribute("aria-label", "Sửa");
    editButton.textContent = "✎";
    actionWrap.appendChild(editButton);
    actionCell.appendChild(actionWrap);
    row.appendChild(actionCell);
  }

  columns.forEach((column) => {
    const td = document.createElement("td");
    if (column.type === "gap") {
      td.className = "month-gap";
      row.appendChild(td);
      return;
    }
    const leave = employee.leaves[column.dateKey] || {};
    const active = Boolean(leave[type]);
    td.className = column.cellClass;
    const button = document.createElement("button");
    button.type = "button";
    const blocked = isNonWorkingDay(column.dateKey);
    const flashKey = `${employee.id}:${column.dateKey}:${type}`;
    button.className = `leave-toggle ${type} ${active ? "active" : ""} ${flashCells.has(flashKey) ? "flash" : ""}`;
    button.textContent = active ? leaveLabel(type) : "";
    button.title = blocked
      ? `${column.title} (T7/CN/ngày lễ - không nhập phép)`
      : `${employee.name} - ${type} - ${column.title}`;
    button.dataset.action = "toggle-leave";
    button.dataset.employeeId = employee.id;
    button.dataset.dateKey = column.dateKey;
    button.dataset.type = type;
    button.disabled = blocked;
    td.appendChild(button);
    row.appendChild(td);
  });
  return row;
}

function renderSelectedEmployee() {
  const employee = state.employees.find((item) => item.id === state.selectedEmployeeId);
  if (!employee) {
    els.selectedName.textContent = "Chưa chọn nhân viên";
    els.selectedCode.textContent = "Click vào ô Name trong bảng để xem chi tiết";
    els.selectedPart.textContent = "-";
    els.selectedPosition.textContent = "-";
    els.selectedEntitlement.textContent = "0";
    els.selectedUsedYear.textContent = "0";
    els.selectedUsedMonth.textContent = "0";
    els.selectedRemain.textContent = "0";
    return;
  }
  const balance = calculateBalance(employee, state.year);
  const focusedMonth = getFocusedMonth();
  const usedMonth = countActualLeaveByMonth(employee, state.year, focusedMonth);
  els.selectedName.textContent = employee.name || "(No name)";
  els.selectedCode.textContent = `${employee.code || "-"} · Hire ${formatDate(employee.hireDate) || "--/--/----"}`;
  els.selectedPart.textContent = employee.part || "No Part";
  els.selectedPosition.textContent = employee.position || "No Position";
  els.selectedEntitlement.textContent = formatNumber(balance.entitlement);
  els.selectedUsedYear.textContent = formatNumber(balance.used);
  els.selectedUsedMonth.textContent = formatNumber(usedMonth);
  els.selectedRemain.textContent = formatNumber(balance.remain);
}

function renderSummary(view) {
  const metrics = calculatePortfolioMetrics(view);
  els.totalPeople.textContent = String(view.length);
  els.totalRemain.textContent = formatNumber(metrics.remain);
  els.metricPeople.textContent = String(metrics.people);
  els.metricParts.textContent = `${metrics.parts} part${metrics.parts === 1 ? "" : "s"}`;
  els.metricRemain.textContent = formatNumber(metrics.remain);
  els.metricUsed.textContent = formatNumber(metrics.used);
  els.metricUtilization.textContent = `${metrics.utilization}% utilization`;
  els.metricPlan.textContent = formatNumber(metrics.planned);
  els.metricRisk.textContent = String(metrics.risk);
  els.controlScore.textContent = String(metrics.score);
  els.controlScore.parentElement.style.setProperty("--score", `${metrics.score}%`);
  els.controlScore.parentElement.style.setProperty("--score-color", scoreColor(metrics.score));
  els.insightTitle.textContent = metrics.risk ? "Action Required" : metrics.utilization < 35 ? "Early-Year Capacity" : "Balanced";
  els.insightText.textContent = buildInsightText(metrics);
}

function renderBalanceList(view) {
  const fragment = document.createDocumentFragment();
  const zoomFragment = document.createDocumentFragment();
  view
    .slice()
    .sort((a, b) => Number(b.warning) - Number(a.warning) || b.balance.remain - a.balance.remain)
    .forEach(({ employee, balance, warning }) => {
      const item = createBalanceCard(employee, balance, warning);
      fragment.appendChild(item);
      zoomFragment.appendChild(item.cloneNode(true));
    });
  els.balanceList.replaceChildren(fragment);
  if (els.balanceListZoom) {
    els.balanceListZoom.replaceChildren(zoomFragment);
  }
}

function createBalanceCard(employee, balance, warning) {
  const item = document.createElement("div");
  item.className = `balance-item ${warning ? "warning" : ""}`;
  item.innerHTML = `
    <div class="balance-top">
      <span>${escapeHtml(employee.name)}</span>
      <span>${formatNumber(balance.remain)} ngày</span>
    </div>
    <div class="balance-tags">
      <span>${escapeHtml(employee.part || "No Part")}</span>
      <span>${warning ? "Risk" : "On track"}</span>
    </div>
    <div class="balance-meta">${escapeHtml(employee.code)} · AL ${formatNumber(balance.entitlement)} · Used ${formatNumber(
    balance.used
  )} · Advance ${formatNumber(employee.advance)}</div>
  `;
  return item;
}

function renderChart(view) {
  const buckets = new Map();
  view.forEach(({ employee, balance, warning }) => {
    const part = employee.part || "No Part";
    const current = buckets.get(part) || { people: 0, remain: 0, warning: 0 };
    current.people += 1;
    current.remain += balance.remain;
    if (warning) current.warning += 1;
    buckets.set(part, current);
  });
  const values = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const max = Math.max(1, ...values.map(([, item]) => item.remain));
  const axisY = document.createElement("div");
  axisY.className = "axis-y";
  axisY.innerHTML = `
    <span class="axis-title">Tổng phép còn</span>
    <span class="tick top">${formatNumber(max)}</span>
    <span class="tick mid">${formatNumber(max / 2)}</span>
    <span class="tick bottom">0</span>
  `;
  const plot = document.createElement("div");
  plot.className = "plot-area";
  const axisX = document.createElement("div");
  axisX.className = "axis-x";
  axisX.textContent = "Part / Sec.";

  const bars = values.map(([part, item]) => {
      const bar = document.createElement("div");
      bar.className = `bar ${item.warning ? "risk" : ""}`;
      const fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.height = `${Math.max(20, (item.remain / max) * 170)}px`;
      fill.textContent = formatNumber(item.remain);
      const label = document.createElement("div");
      label.className = "bar-label";
      label.textContent = part;
      const sub = document.createElement("div");
      sub.className = "bar-sub";
      sub.textContent = `${item.people} người${item.warning ? ` · ${item.warning} cảnh báo` : ""}`;
      bar.title = `${part}: tổng remain ${formatNumber(item.remain)} ngày, ${item.people} người`;
      bar.append(fill, label, sub);
      return bar;
    });
  plot.replaceChildren(...bars);
  els.remainChart.replaceChildren(axisY, plot, axisX);
}

function calculatePortfolioMetrics(view) {
  const balances = view.map((item) => item.balance);
  const entitlement = balances.reduce((sum, balance) => sum + balance.entitlement, 0);
  const used = balances.reduce((sum, balance) => sum + balance.used, 0);
  const remain = balances.reduce((sum, balance) => sum + balance.remain, 0);
  const planned = view.reduce((sum, item) => sum + item.planned, 0);
  const risk = view.filter((item) => item.warning).length;
  const parts = new Set(view.map((item) => item.employee.part || "No Part")).size;
  const utilization = entitlement ? Math.round((used / entitlement) * 100) : 0;
  const riskPenalty = view.length ? Math.round((risk / view.length) * 52) : 0;
  const utilizationPenalty = Math.max(0, 38 - utilization);
  const score = clamp(100 - riskPenalty - Math.round(utilizationPenalty * 0.45), 0, 100);
  return { people: view.length, parts, entitlement, used, remain, planned, risk, utilization, score };
}

function buildInsightText(metrics) {
  if (!metrics.people) return "No workforce data in the current filter.";
  if (metrics.risk) {
    return `${metrics.risk} employee${metrics.risk === 1 ? "" : "s"} need follow-up under the current checkpoint rule.`;
  }
  if (metrics.utilization < 35) {
    return "Usage is still light versus annual entitlement; monitor planned demand by Part.";
  }
  return "Leave balance and actual usage are within the operating threshold.";
}

function scoreColor(score) {
  if (score < 55) return "var(--red)";
  if (score < 75) return "var(--amber)";
  return "var(--green)";
}

function filteredEmployees() {
  const query = els.searchInput.value.trim().toLowerCase();
  if (!query) return state.employees;
  return state.employees.filter((employee) =>
    [employee.part, employee.code, employee.name, employee.position].some((value) =>
      String(value).toLowerCase().includes(query)
    )
  );
}

function handleTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (button && els.tableBody.contains(button)) {
    const employee = state.employees.find((item) => item.id === button.dataset.employeeId);
    if (!employee) return;
    state.selectedEmployeeId = employee.id;
    persistLocalBackup();
    scheduleRender();
    if (button.dataset.action === "edit") {
      openEmployeeDialog(employee);
      return;
    }
    if (button.dataset.action === "toggle-leave") {
      toggleLeave(employee.id, button.dataset.dateKey, button.dataset.type);
      return;
    }
  }

  const row = event.target.closest("tr[data-employee-id]");
  if (row && els.tableBody.contains(row)) {
    const employeeId = row.dataset.employeeId;
    if (!employeeId || employeeId === state.selectedEmployeeId) return;
    state.selectedEmployeeId = employeeId;
    persistLocalBackup();
    scheduleRender();
  }
}

function calculateBalance(employee, year) {
  const hire = parseLocalDate(employee.hireDate);
  if (!hire) {
    return { years: 0, entitlement: 0, plus: 0, used: 0, remain: 0 };
  }
  const endOfYear = new Date(year, 11, 31);
  const years = fullYearsBetween(hire, endOfYear);
  const base = baseAnnualLeave(hire, year);
  const plus = years >= 10 ? 2 : years >= 5 ? 1 : 0;
  const entitlement = base + plus;
  const used = countActualLeave(employee, year);
  const remain = entitlement - used - (Number(employee.advance) || 0);
  return { years, entitlement, plus, used, remain };
}

function baseAnnualLeave(hire, year) {
  if (hire.getFullYear() > year) return 0;
  if (hire.getFullYear() < year) return 12;
  return 12 - hire.getMonth();
}

function countActualLeave(employee, year) {
  return Object.entries(employee.leaves || {}).reduce((sum, [dateKey, value]) => {
    if (!dateKey.startsWith(`${year}-`)) return sum;
    if (!value.actual || isNonWorkingDay(dateKey)) return sum;
    return sum + 1;
  }, 0);
}

function countPlannedLeave(employee, year) {
  return Object.entries(employee.leaves || {}).reduce((sum, [dateKey, value]) => {
    if (!dateKey.startsWith(`${year}-`)) return sum;
    if (!value.plan || isNonWorkingDay(dateKey)) return sum;
    return sum + 1;
  }, 0);
}

function countActualLeaveByMonth(employee, year, month) {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  return Object.entries(employee.leaves || {}).reduce((sum, [dateKey, value]) => {
    if (!dateKey.startsWith(prefix)) return sum;
    if (!value.actual || isNonWorkingDay(dateKey)) return sum;
    return sum + 1;
  }, 0);
}

function shouldWarn(remain) {
  const checkpointMonth = getCheckpointMonth();
  if (checkpointMonth >= 8) return remain >= 3;
  if (checkpointMonth >= 5) return remain > 8;
  return false;
}

function getCheckpointMonth() {
  if (state.month !== "all") return state.month;
  const now = new Date();
  if (state.year === now.getFullYear()) return now.getMonth();
  return state.year < now.getFullYear() ? 11 : 0;
}

function getFocusedMonth() {
  if (state.month !== "all") return state.month;
  const now = new Date();
  if (state.year === now.getFullYear()) return now.getMonth();
  return 0;
}

function fullYearsBetween(start, end) {
  let years = end.getFullYear() - start.getFullYear();
  const anniversary = new Date(end.getFullYear(), start.getMonth(), start.getDate());
  if (end < anniversary) years -= 1;
  return Math.max(0, years);
}

function daysBetween(start, end) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end - start) / msPerDay) + 1;
}

function applyQuickUpdate(event) {
  event.preventDefault();
  const code = els.quickCodeInput.value.trim().toLowerCase();
  const employee = state.employees.find((item) => item.code.toLowerCase() === code);
  const type = els.quickTypeSelect.value;
  const start = parseLocalDate(els.quickStartInput.value);
  const end = parseLocalDate(els.quickEndInput.value || els.quickStartInput.value);
  if (!employee) {
    showQuickMessage("Không tìm thấy ID code này.", true);
    return;
  }
  if (!start || !end || end < start) {
    showQuickMessage("Khoảng ngày chưa đúng.", true);
    return;
  }
  if (daysBetween(start, end) > 370) {
    showQuickMessage("Khoảng ngày quá dài. Hãy kiểm tra lại năm bắt đầu/kết thúc.", true);
    return;
  }
  if (!requireEditorVh()) return;

  let updated = 0;
  let skipped = 0;
  const flashes = [];
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dateKey = makeDateKey(date.getFullYear(), date.getMonth(), date.getDate());
    if (isNonWorkingDay(dateKey)) {
      skipped += 1;
      continue;
    }
    employee.leaves[dateKey] = employee.leaves[dateKey] || { plan: false, actual: false };
    employee.leaves[dateKey][type] = true;
    flashes.push(`${employee.id}:${dateKey}:${type}`);
    updated += 1;
  }
  flashCells = new Set(flashes);
  state.selectedEmployeeId = employee.id;
  showQuickMessage(`Đã update ${updated} ngày cho ${employee.name}${skipped ? `, bỏ qua ${skipped} T7/CN/ngày lễ` : ""}.`);
  persistAndRender({ promptForActor: true, reason: "leave.quick_update" });
  clearFlashSoon();
}

function showQuickMessage(message, error = false) {
  els.quickMessage.textContent = message;
  els.quickMessage.classList.toggle("error", error);
}

function requireEditorVh() {
  const actor = getEditorIdentity(true);
  if (!actor) {
    showQuickMessage("Nhập mã VH ở ô 'Editor VH (quyền update)' trong Data Control để lưu chỉnh sửa.", true);
    if (els.editorVhInput) els.editorVhInput.focus();
    return null;
  }
  return actor;
}

function openBalanceZoomDialog() {
  if (!els.balanceZoomDialog?.showModal) return;
  els.balanceZoomDialog.showModal();
}

function toggleLeave(employeeId, dateKey, type) {
  const employee = state.employees.find((item) => item.id === employeeId);
  if (!employee) return;
  if (isNonWorkingDay(dateKey)) {
    showQuickMessage("T7/CN và ngày lễ không thể nhập Plan/Actual.", true);
    return;
  }
  if (!requireEditorVh()) return;
  employee.leaves[dateKey] = employee.leaves[dateKey] || { plan: false, actual: false };
  employee.leaves[dateKey][type] = !employee.leaves[dateKey][type];
  state.selectedEmployeeId = employee.id;
  flashCells = new Set([`${employee.id}:${dateKey}:${type}`]);
  if (!employee.leaves[dateKey].plan && !employee.leaves[dateKey].actual) {
    delete employee.leaves[dateKey];
  }
  persistAndRender({ promptForActor: true, reason: "leave.toggle" });
  clearFlashSoon();
}

function clearFlashSoon() {
  if (flashTimer) window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => {
    flashCells = new Set();
    flashTimer = null;
    scheduleRender();
  }, 950);
}

function openEmployeeDialog(employee) {
  const editing = Boolean(employee);
  els.dialogTitle.textContent = editing ? "Sửa nhân sự" : "Thêm nhân sự";
  els.employeeId.value = employee?.id || "";
  els.partInput.value = employee?.part || "";
  els.codeInput.value = employee?.code || "";
  els.nameInput.value = employee?.name || "";
  els.positionInput.value = employee?.position || "";
  els.hireDateInput.value = employee?.hireDate || "";
  els.advanceInput.value = employee?.advance ?? 0;
  els.deleteEmployeeBtn.hidden = !editing;
  els.dialog.showModal();
}

function saveEmployee(event) {
  event.preventDefault();
  if (!requireEditorVh()) return;
  const id = els.employeeId.value || createId();
  const existing = state.employees.find((employee) => employee.id === id);
  const nextEmployee = {
    id,
    part: els.partInput.value.trim(),
    code: els.codeInput.value.trim(),
    name: els.nameInput.value.trim(),
    position: els.positionInput.value.trim(),
    hireDate: els.hireDateInput.value,
    advance: Number(els.advanceInput.value) || 0,
    leaves: existing?.leaves || {},
  };
  if (existing) {
    Object.assign(existing, nextEmployee);
  } else {
    state.employees.push(nextEmployee);
  }
  state.selectedEmployeeId = id;
  els.dialog.close();
  persistAndRender({ promptForActor: true, reason: "employee.save" });
}

async function deleteCurrentEmployee() {
  const id = els.employeeId.value;
  if (!id) return;
  const pass = window.prompt("Nhập pass để xoá dữ liệu nhân sự:");
  if (!pass) {
    return;
  }
  const actor = requireEditorVh();
  if (!actor) {
    return;
  }
  const ok = await deleteEmployeeOnServer(id, pass, actor);
  if (!ok) {
    showQuickMessage("Xoá thất bại trên server.", true);
    return;
  }
  els.dialog.close();
  await syncFromServer({ force: true });
  showQuickMessage("Đã xoá dữ liệu.");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `leave-planner-${state.year}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  importAnyFile(file).finally(() => {
    event.target.value = "";
  });
}

async function importAnyFile(file) {
  try {
    if (!requireEditorVh()) return;
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext === "json") {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (Array.isArray(imported.employees)) {
        state.year = normalizeYear(imported.year, state.year);
        state.month = normalizeMonth(imported.month, state.month);
        state.employees = mergeEmployeesByCode(imported.employees.map(normalizeEmployee));
      } else if (Array.isArray(imported)) {
        state.employees = mergeEmployeesByCode(imported.map(normalizeEmployee));
      } else {
        throw new Error("Invalid JSON shape");
      }
      persistAndRender({ promptForActor: true, reason: "employee.import_json" });
      showQuickMessage("Import JSON thành công.");
      return;
    }

    if (!window.XLSX) {
      throw new Error("Thiếu thư viện đọc Excel");
    }
    const arrayBuffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(arrayBuffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const importedEmployees = rowsToEmployees(rows);
    state.employees = mergeEmployeesByCode(importedEmployees);
    persistAndRender({ promptForActor: true, reason: "employee.import_sheet" });
    showQuickMessage(`Import ${importedEmployees.length} nhân sự từ Excel thành công.`);
  } catch (error) {
    console.error(error);
    showQuickMessage("Import thất bại. Kiểm tra lại format file.", true);
  }
}

function rowsToEmployees(rows) {
  return rows
    .map((row) => {
      const normalized = normalizeRowKeys(row);
      return normalizeEmployee({
        id: normalized.id || createId(),
        part: normalized.part,
        code: normalized.code,
        name: normalized.name,
        position: normalized.position,
        hireDate: normalized.hireDate,
        advance: normalized.advance,
        leaves: {},
      });
    })
    .filter((employee) => employee.code && employee.name);
}

function normalizeRowKeys(row) {
  const pairs = Object.entries(row).map(([k, v]) => [String(k).toLowerCase().trim(), v]);
  const map = Object.fromEntries(pairs);
  const pick = (...keys) => {
    for (const key of keys) {
      if (map[key] !== undefined && String(map[key]).trim() !== "") return map[key];
    }
    return "";
  };
  const rawHire = pick("hiredate", "hire date", "hie date", "startdate", "start date", "ngayvaolam", "ngày vào làm");
  return {
    id: pick("id", "uuid"),
    part: pick("part", "part/sec.", "part/sec", "section", "sec"),
    code: pick("id code", "idcode", "code", "vh"),
    name: pick("name", "fullname", "full name", "họ tên", "ho ten"),
    position: pick("position", "title", "chuc vu", "chức vụ"),
    hireDate: normalizeDateCell(rawHire),
    advance: Number(pick("advance", "advance using al", "advance al")) || 0,
  };
}

function normalizeDateCell(value) {
  if (!value) return "";
  if (typeof value === "number" && window.XLSX?.SSF?.parse_date_code) {
    const parsed = window.XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const slash = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (slash) {
    const d = Number(slash[1]);
    const m = Number(slash[2]);
    const y = Number(slash[3] < 100 ? `20${slash[3]}` : slash[3]);
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return "";
}

function mergeEmployeesByCode(employees) {
  const byCode = new Map();
  employees.forEach((employee) => {
    byCode.set(employee.code.toLowerCase(), employee);
  });
  return [...byCode.values()];
}

function getEditorIdentity(promptIfMissing = false) {
  let editorId = localStorage.getItem(EDITOR_ID_KEY);
  if (!editorId) {
    editorId = createId();
    localStorage.setItem(EDITOR_ID_KEY, editorId);
  }
  let vh = String(els.editorVhInput?.value || localStorage.getItem(EDITOR_VH_KEY) || localStorage.getItem(EDITOR_NAME_KEY) || "")
    .trim()
    .toUpperCase();
  if (promptIfMissing && !isValidEditorVh(vh)) {
    const input = window.prompt("Nhập mã VH người chỉnh sửa (VD: VH4354):");
    vh = String(input || "").trim().toUpperCase();
  }
  if (!isValidEditorVh(vh)) {
    return null;
  }
  if (els.editorVhInput && els.editorVhInput.value !== vh) {
    els.editorVhInput.value = vh;
  }
  localStorage.setItem(EDITOR_VH_KEY, vh);
  localStorage.setItem(EDITOR_NAME_KEY, vh);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  return {
    id: editorId.slice(0, 80),
    vh: vh.slice(0, 80),
    name: vh.slice(0, 80),
    tz: String(tz).slice(0, 60),
    ua: String(navigator.userAgent || "").slice(0, 200),
  };
}

function openAuditDialog() {
  initializeAuditMonthInput();
  els.auditMessage.textContent = "";
  els.auditMessage.classList.remove("error");
  els.auditList.replaceChildren();
  els.auditDialog.showModal();
}

function showAuditMessage(message, error = false) {
  els.auditMessage.textContent = message;
  els.auditMessage.classList.toggle("error", error);
}

async function loadAuditLogs() {
  const pass = els.auditPassInput.value.trim();
  const month = (els.auditMonthInput?.value || "").trim();
  if (!pass) {
    showAuditMessage("Nhập pass quản trị để xem log.", true);
    return;
  }
  if (!month) {
    showAuditMessage("Chọn tháng cần xem log.", true);
    return;
  }
  showAuditMessage("Đang tải hoạt động...");
  const result = await fetchAuditLogs(pass, 500, month);
  if (!result.ok) {
    showAuditMessage(result.error || "Không tải được log.", true);
    return;
  }
  renderAuditLogs(result.events);
  showAuditMessage(`Đã tải ${result.events.length} bản ghi tháng ${month}.`);
}

function renderAuditLogs(events) {
  const fragment = document.createDocumentFragment();
  if (!Array.isArray(events) || !events.length) {
    const empty = document.createElement("div");
    empty.className = "balance-item";
    empty.textContent = "Chưa có hoạt động.";
    fragment.appendChild(empty);
    els.auditList.replaceChildren(fragment);
    return;
  }
  events.forEach((entry) => {
    const detail = entry?.detail && typeof entry.detail === "object" ? entry.detail : {};
    const editor = detail.editor?.vh || detail.editor?.name || detail.editorName || "Unknown";
    const eventLabel = entry?.event || "event";
    const time = formatAuditTime(entry?.ts);
    const summary = buildAuditSummary(eventLabel, detail);
    const item = document.createElement("div");
    item.className = "balance-item";
    item.innerHTML = `
      <div class="balance-top">
        <span>${escapeHtml(editor)}</span>
        <span>${escapeHtml(time)}</span>
      </div>
      <div class="balance-tags">
        <span>${escapeHtml(eventLabel)}</span>
        <span>${escapeHtml(entry?.ip || "-")}</span>
      </div>
      <div class="balance-meta">${escapeHtml(summary)}</div>
    `;
    fragment.appendChild(item);
  });
  els.auditList.replaceChildren(fragment);
}

function buildAuditSummary(eventLabel, detail) {
  if (eventLabel === "state.update") {
    const reason = detail.reason ? `reason=${detail.reason}` : "reason=state.update";
    const vh = detail.editor?.vh || detail.editor?.name || "-";
    return `VH=${vh} · ${reason} · employees=${Number(detail.employees) || 0} · rev=${Number(detail.revision) || 0}`;
  }
  if (eventLabel === "employee.delete") {
    const vh = detail.editor?.vh || detail.editor?.name || "-";
    return `VH=${vh} · employeeId=${detail.employeeId || "-"} · rev=${Number(detail.revision) || 0}`;
  }
  if (eventLabel === "employee.delete.denied" || eventLabel === "audit.read.denied") {
    return `denied · ${detail.reason || "invalid access"}`;
  }
  return JSON.stringify(detail).slice(0, 180);
}

function formatAuditTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

async function fetchStateFromServer() {
  try {
    const response = await fetch(API_STATE_URL, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function applyServerState(remote) {
  if (!remote || typeof remote !== "object") return;
  lastServerRevision = Number(remote.revision) || lastServerRevision;
  isApplyingRemote = true;
  state.year = normalizeYear(remote.year, state.year);
  state.month = normalizeMonth(remote.month, state.month);
  state.employees = Array.isArray(remote.employees) ? remote.employees.map(normalizeEmployee) : [];
  if (!state.employees.some((employee) => employee.id === state.selectedEmployeeId)) {
    state.selectedEmployeeId = "";
  }
  els.yearInput.value = state.year;
  els.monthSelect.value = state.month === "all" ? "all" : String(state.month);
  persistLocalBackup();
  isApplyingRemote = false;
}

async function syncFromServer(options = {}) {
  const remote = await fetchStateFromServer();
  if (!remote) return false;
  const remoteRevision = Number(remote.revision) || 0;
  if (options.force || remoteRevision > lastServerRevision) {
    applyServerState(remote);
    scheduleRender();
    return true;
  }
  return false;
}

async function pushStateToServer(options = {}) {
  try {
    const actor = getEditorIdentity(Boolean(options.promptForActor));
    if (!actor && options.promptForActor) {
      showQuickMessage("Cần nhập mã VH hợp lệ để lưu chỉnh sửa.", true);
      return;
    }
    const payload = {
      revision: lastServerRevision,
      year: state.year,
      month: state.month,
      employees: state.employees,
      actor: actor || undefined,
      reason: String(options.reason || "state.update"),
    };
    const response = await fetch(API_STATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return;
    const saved = await response.json();
    if (saved && typeof saved.revision === "number") {
      lastServerRevision = saved.revision;
    }
  } catch {
    // network sync errors are non-blocking for local editing
  }
}

async function deleteEmployeeOnServer(employeeId, pass, actor) {
  try {
    if (!actor) return false;
    const response = await fetch(`${API_EMPLOYEE_URL}/${encodeURIComponent(employeeId)}`, {
      method: "DELETE",
      headers: {
        "X-Delete-Pass": pass,
        "X-Editor-Name": actor?.name || "Unknown",
        "X-Editor-Id": actor?.id || "",
        "X-Editor-VH": actor?.vh || "",
      },
    });
    if (!response.ok) return false;
    const saved = await response.json();
    if (saved && typeof saved.revision === "number") lastServerRevision = saved.revision;
    return true;
  } catch {
    return false;
  }
}

async function fetchAuditLogs(pass, limit = 100, month = "") {
  try {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (month) params.set("month", month);
    const response = await fetch(`${API_AUDIT_URL}?${params.toString()}`, {
      cache: "no-store",
      headers: {
        "X-Admin-Pass": pass,
      },
    });
    if (!response.ok) {
      if (response.status === 403) return { ok: false, error: "Sai pass quản trị." };
      return { ok: false, error: `Lỗi tải log (${response.status})` };
    }
    const payload = await response.json();
    return { ok: true, events: Array.isArray(payload.events) ? payload.events : [] };
  } catch {
    return { ok: false, error: "Không kết nối được server log." };
  }
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function makeDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseLocalDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function isValidDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Boolean(parseLocalDate(value));
}

function normalizeMonth(value, fallback) {
  if (value === "all") return "all";
  const month = Number(value);
  return Number.isInteger(month) && month >= 0 && month <= 11 ? month : fallback;
}

function normalizeYear(value, fallback) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : fallback;
}

function formatDate(value) {
  const date = parseLocalDate(value);
  if (!date) return "";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function isWeekendDate(date) {
  const weekday = date.getDay();
  return weekday === 0 || weekday === 6;
}

function isWeekendKey(dateKey) {
  const date = parseLocalDate(dateKey);
  return date ? isWeekendDate(date) : false;
}

function isNonWorkingDay(dateKey) {
  const info = getDateInfo(dateKey);
  return info.weekend || Boolean(info.holiday);
}

function getHolidayName(dateKey) {
  const year = Number(dateKey.slice(0, 4));
  const fixed = FIXED_HOLIDAYS[dateKey.slice(5)];
  return HOLIDAYS_BY_YEAR[year]?.[dateKey] || fixed || "";
}

function getDateInfo(dateKey) {
  const cached = dateInfoCache.get(dateKey);
  if (cached) return cached;
  const weekend = isWeekendKey(dateKey);
  const holiday = getHolidayName(dateKey);
  const classes = [];
  if (weekend) classes.push("weekend");
  if (holiday) classes.push("holiday-cell");
  const info = {
    weekend,
    holiday,
    title: dayTitle(dateKey),
    dayClass: ["day-head", ...classes].join(" "),
    cellClass: ["leave-cell", ...classes].join(" "),
  };
  dateInfoCache.set(dateKey, info);
  return info;
}

function dayTitle(dateKey) {
  const date = parseLocalDate(dateKey);
  if (!date) return dateKey;
  const weekday = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const holiday = getHolidayName(dateKey);
  return holiday ? `${weekday} · ${holiday}` : weekday;
}

function leaveLabel(type) {
  return type === "plan" ? "P" : "A";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isValidEditorVh(value) {
  return /^VH[0-9A-Za-z]{2,20}$/.test(String(value || "").trim().toUpperCase());
}

function formatMonthInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
