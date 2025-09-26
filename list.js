// ----- Minimal store (localStorage) so the mock survives refresh -----
const LS_KEY = "mock_consents";

function seedIfEmpty() {
  if (localStorage.getItem(LS_KEY)) return;
  const now = new Date();
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}`;

  const demo = [
    {
      id: 1,
      agreementNo: "10001",
      agreementName: "Telco Onboarding",
      title: "Consent for Processing Personal Data",
      version: "1",
      language: "TH",
      createdAt: fmt(now),
      createdBy: "demo.user",
    },
    {
      id: 2,
      agreementNo: "10002",
      agreementName: "eKYC",
      title: "Biometric Consent",
      version: "2",
      language: "EN",
      createdAt: fmt(new Date(now.getTime() - 86400000)),
      createdBy: "demo.user",
    },
    {
      id: 3,
      agreementNo: "10003",
      agreementName: "Marketing Opt-in",
      title: "Promotional Messages Consent",
      version: "1",
      language: "TH",
      createdAt: fmt(new Date(now.getTime() - 3600 * 1000 * 5)),
      createdBy: "ops.admin",
    },
  ];
  localStorage.setItem(LS_KEY, JSON.stringify(demo));
}

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveAll(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list || []));
}

// ----- Filtering -----
const fNo = document.getElementById("fNo");
const fName = document.getElementById("fName");
const fTitle = document.getElementById("fTitle");
const fVer = document.getElementById("fVer");
const fLang = document.getElementById("fLang");
const tbody = document.getElementById("tblBody");
const emptyState = document.getElementById("emptyState");

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .trim();
}

function applyFilters(items) {
  const no = normalize(fNo.value);
  const name = normalize(fName.value);
  const title = normalize(fTitle.value);
  const ver = normalize(fVer.value);
  const lang = fLang.value.trim();

  return items.filter((it) => {
    if (no && !normalize(it.agreementNo).includes(no)) return false;
    if (name && !normalize(it.agreementName).includes(name)) return false;
    if (title && !normalize(it.title).includes(title)) return false;
    if (ver && !normalize(it.version).includes(ver)) return false;
    if (lang && it.language !== lang) return false;
    return true;
  });
}

// ----- Rendering -----
function render(list) {
  tbody.innerHTML = "";
  if (!list.length) {
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";

  list.forEach((it, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${escapeHtml(it.agreementNo)}</td>
      <td>${escapeHtml(it.agreementName)}</td>
      <td title="${escapeHtml(it.title)}">${escapeHtml(it.title)}</td>
      <td>${escapeHtml(it.version)}</td>
      <td>${escapeHtml(it.language)}</td>
      <td>${escapeHtml(it.createdAt)}</td>
      <td>${escapeHtml(it.createdBy)}</td>
      <td>
        <div class="actions">
          <a class="link-btn" href="createNewConsent.html?mode=view&id=${
            it.id
          }">View</a>
          <a class="link-btn" href="createNewConsent.html?mode=copy&from=${
            it.id
          }">Copy</a>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function refresh() {
  const all = loadAll();
  render(applyFilters(all));
}

// ----- Utils -----
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms);
  };
}

// ----- Init -----
seedIfEmpty();
[fNo, fName, fTitle, fVer, fLang].forEach((el) =>
  el.addEventListener("input", debounce(refresh, 120))
);
refresh();
