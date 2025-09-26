// ---------- Minimal sanitizer (no external libs) ----------
function sanitizeHTML(input) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(input, "text/html");

  // remove scripts
  doc
    .querySelectorAll("script, iframe[src^='javascript:']")
    .forEach((n) => n.remove());

  // scrub attributes
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null);
  while (walker.nextNode()) {
    const el = walker.currentNode;
    [...el.attributes].forEach((attr) => {
      const n = attr.name.toLowerCase();
      if (n.startsWith("on")) el.removeAttribute(attr.name); // onload, onclick, etc.
      if (n === "href" || n === "src") {
        if (/^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
      }
      if (n === "style" && /expression\s*\(/i.test(attr.value))
        el.removeAttribute(attr.name);
    });
  }
  return doc.body.innerHTML;
}

// ---------- DOM refs ----------
const drop = document.getElementById("drop");
const fileInput = document.getElementById("fileInput");
const chooseBtn = document.getElementById("chooseBtn");
const editable = document.getElementById("editable");
const codearea = document.getElementById("codearea");
const phoneView = document.getElementById("phoneView");
const refreshBtn = document.getElementById("refreshBtn");

// ---------- Selection save/restore (critical for modals) ----------
let savedSelection = null;

function isRangeInEditable(range) {
  if (!range) return false;
  const { startContainer, endContainer } = range;
  return editable.contains(startContainer) && editable.contains(endContainer);
}

function saveSelection() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    savedSelection = isRangeInEditable(range) ? range.cloneRange() : null;
  } else {
    savedSelection = null;
  }
}

function restoreSelection() {
  editable.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  if (savedSelection && isRangeInEditable(savedSelection)) {
    sel.addRange(savedSelection);
    return true;
  }
  // Fallback: place caret at end of editor
  placeCaretAtEnd(editable);
  return false;
}

function placeCaretAtEnd(el) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// ---------- Toolbar wiring ----------
document.querySelectorAll(".tool[data-cmd]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const cmd = btn.dataset.cmd;
    document.execCommand(cmd, false, null);
    syncAll();
  });
});

const sizeSelect = document.getElementById("sizeSelect");
sizeSelect.addEventListener("change", () => {
  applySizeClassToSelection(sizeSelect.value);
  syncAll();
});

const colorPicker = document.getElementById("colorPicker");
colorPicker.addEventListener("input", () => {
  document.execCommand("foreColor", false, colorPicker.value);
  syncAll();
});

document.getElementById("unlinkBtn").addEventListener("click", () => {
  document.execCommand("unlink", false, null);
  syncAll();
});

// ---------- Link modal ----------
const modal = document.getElementById("modalBackdrop");
const linkBtn = document.getElementById("linkBtn");
const linkUrl = document.getElementById("linkUrl");
const linkCancel = document.getElementById("linkCancel");
const linkApply = document.getElementById("linkApply");

linkBtn.addEventListener("click", () => {
  // Must save selection BEFORE opening the modal (focus will move away)
  if (
    window.getSelection().isCollapsed ||
    !isRangeInEditable(window.getSelection().getRangeAt(0))
  ) {
    alert("Select some text to link first.");
    return;
  }
  saveSelection();
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
  linkUrl.value = "";
  linkUrl.focus();
});
linkCancel.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

linkApply.addEventListener("click", () => {
  const url = linkUrl.value.trim();
  if (!url) {
    closeModal();
    return;
  }
  const safe = /^(https?:\/\/|mailto:|tel:|data:image\/)/i.test(url)
    ? url
    : "https://" + url;

  // restore selection in the editor, create link
  restoreSelection();
  document.execCommand("createLink", false, safe);

  // normalize the created <a>
  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    const node = sel.getRangeAt(0).commonAncestorContainer;
    const anchor = (node.nodeType === 1 ? node : node.parentElement).closest(
      "a"
    );
    if (anchor) {
      anchor.setAttribute("href", safe);
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    }
  }

  closeModal();
  syncAll();
});

function closeModal() {
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
  editable.focus();
}

// ---------- Image insert modal ----------
const imgModal = document.getElementById("imgModal");
const imgUrl = document.getElementById("imgUrl");
const imgCancel = document.getElementById("imgCancel");
const imgApply = document.getElementById("imgApply");
const imageBtn = document.getElementById("imageBtn");

imageBtn.addEventListener("click", () => {
  // Save caret/selection position in the editor so we can insert at that spot
  saveSelection();
  imgModal.style.display = "flex";
  imgModal.setAttribute("aria-hidden", "false");
  imgUrl.value = "";
  imgUrl.focus();
});
imgCancel.addEventListener("click", closeImgModal);
imgModal.addEventListener("click", (e) => {
  if (e.target === imgModal) closeImgModal();
});

imgApply.addEventListener("click", () => {
  const url = imgUrl.value.trim();
  if (!url) {
    closeImgModal();
    return;
  }

  // Restore caret/selection into the editor, then insert image
  restoreSelection();
  const img = insertImage(url);
  closeImgModal();

  if (img) {
    editable.focus();
    currentImg = img; // select new image
    positionResizer(img); // show resize handles
    img.scrollIntoView({ block: "nearest" });
  }
  syncAll();
});

function closeImgModal() {
  imgModal.style.display = "none";
  imgModal.setAttribute("aria-hidden", "true");
  editable.focus();
}

/**
 * Insert an image into the input editor at the caret position (wrapped in <p>).
 * @param {string} url - must be https:// or data:image/...
 * @returns {HTMLImageElement|null}
 */
function insertImage(url) {
  if (!url) return null;
  const safe = /^(https?:\/\/|data:image\/)/i.test(url)
    ? url
    : "https://" + url;

  const img = document.createElement("img");
  img.src = safe;
  img.alt = "";
  img.style.maxWidth = "100%";
  img.style.height = "auto";

  const wrapper = document.createElement("p");
  wrapper.appendChild(img);

  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && isRangeInEditable(sel.getRangeAt(0))) {
    const range = sel.getRangeAt(0);
    range.collapse(false);
    range.insertNode(wrapper);

    // move caret after wrapper
    range.setStartAfter(wrapper);
    range.setEndAfter(wrapper);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    editable.appendChild(wrapper);
    placeCaretAtEnd(editable);
  }
  return img;
}

// ---------- Font size via classes ----------
function applySizeClassToSelection(className) {
  const sel = window.getSelection();
  if (!sel.rangeCount || !isRangeInEditable(sel.getRangeAt(0))) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;

  const span = document.createElement("span");
  const all = [
    "size-normal",
    "size-smaller",
    "size-smallest",
    "size-larger",
    "size-largest",
  ];
  span.className = all.filter((c) => c !== className).join(" ");
  span.appendChild(range.extractContents());
  span.classList.add(className);
  range.insertNode(span);

  sel.removeAllRanges();
  const newRange = document.createRange();
  newRange.selectNodeContents(span);
  sel.addRange(newRange);
}

// ---------- Keep preview & code in sync ----------
function syncAll() {
  const sanitized = sanitizeHTML(editable.innerHTML);
  // textarea shows just the fragment
  codearea.value = sanitized.trim();
  // iframe gets a minimal preview document
  phoneView.srcdoc = previewDoc(sanitized);
}

function previewDoc(body) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <base target="_blank">
  <style>
    body { font: 16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#0f172a; margin:16px; }
    img { max-width:100%; height:auto; }
    table { width:100%; border-collapse:collapse; }
    .size-smallest{font-size:.75rem}.size-smaller{font-size:.875rem}.size-normal{font-size:1rem}.size-larger{font-size:1.125rem}.size-largest{font-size:1.25rem}
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

refreshBtn.addEventListener("click", syncAll);
editable.addEventListener("input", debounce(syncAll, 120));

// ---------- Upload handlers ----------
["dragenter", "dragover"].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    drop.classList.add("drag");
  })
);
["dragleave", "drop"].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
  })
);
drop.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) handleFile(f);
});
chooseBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) handleFile(f);
  fileInput.value = "";
});

async function handleFile(file) {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".html") || name.endsWith(".htm")) {
    const text = await file.text();
    editable.innerHTML = extractBodyHTML(text);
    syncAll();
    return;
  }
  if (name.endsWith(".txt")) {
    const text = await file.text();
    editable.innerHTML = textToParagraphs(text);
    syncAll();
    return;
  }
  if (name.endsWith(".docx")) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const html = await window.DocxConverter.convertToHtml(arrayBuffer);
      editable.innerHTML = html;
      syncAll();
    } catch (err) {
      console.error(err);
      alert(
        "DOCX conversion failed: " + (err && err.message ? err.message : err)
      );
    }
    return;
  }

// NEW: PDF
  if (name.endsWith(".pdf")) {
    try {
      const arrayBuffer = await file.arrayBuffer();

      // Choose your default behavior here:
      //   "text"  → editable paragraphs
      //   "image" → page snapshots
      const IMPORT_MODE = "text"; // or "image"

      const html = await convertPdfToHtml(arrayBuffer, IMPORT_MODE);
      editable.innerHTML = html || "<p>(No text extracted)</p>";
      syncAll();
    } catch (err) {
      console.error(err);
      alert("PDF import failed: " + (err?.message || err));
    }
    return;
  }

  
  alert("Unsupported file type. Please use .docx, .html, or .txt.");
}

// ---------- Utils ----------
function textToParagraphs(text) {
  return text
    .split(/\n{2,}/)
    .map((block) => {
      const p = block.trim().replace(/\n/g, "<br>");
      return `<p>${escapeHtml(p)}</p>`;
    })
    .join("\n");
}
function extractBodyHTML(html) {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.innerHTML || html;
  } catch {
    return html;
  }
}
function wrapHTML(body) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Consent Content</title>
  <style>
    body { font: 16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:#0f172a; margin:16px; }
    img { max-width:100%; height:auto; }
    .size-smallest{font-size:.75rem}.size-smaller{font-size:.875rem}.size-normal{font-size:1rem}.size-larger{font-size:1.125rem}.size-largest{font-size:1.25rem}
  </style>
</head>
<body>
${body}
</body>
</html>`;
}
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

// ===== Image Resizer Overlay (fixed-position version) =====
const editorPane = document.querySelector(".editor-pane");
let resizer = null;
let currentImg = null;
let dragState = null;

function createResizer() {
  if (resizer) return resizer;
  const overlay = document.createElement("div");
  overlay.className = "img-resizer";
  overlay.style.position = "fixed"; // <— important
  overlay.style.display = "none";
  overlay.innerHTML = `
    <div class="img-box"></div>
    <div class="handle nw" data-h="nw"></div>
    <div class="handle ne" data-h="ne"></div>
    <div class="handle sw" data-h="sw"></div>
    <div class="handle se" data-h="se"></div>
  `;
  document.body.appendChild(overlay); // <— attach to body (viewport)
  overlay.addEventListener("mousedown", onHandleDown);
  resizer = overlay;
  return overlay;
}

function positionResizer(img) {
  const rect = img.getBoundingClientRect(); // viewport coords
  const overlay = createResizer();
  overlay.style.display = "block";
  overlay.style.left = rect.left + "px";
  overlay.style.top = rect.top + "px";
  overlay.style.width = rect.width + "px";
  overlay.style.height = rect.height + "px";
}

function hideResizer() {
  if (resizer) resizer.style.display = "none";
  currentImg = null;
}

function onHandleDown(e) {
  const handle = e.target.closest(".handle");
  if (!handle || !currentImg) return;
  e.preventDefault();

  const rect = resizer.getBoundingClientRect();
  dragState = {
    handle: handle.dataset.h,
    startW: rect.width,
    startH: rect.height,
    startX: e.clientX,
    startY: e.clientY,
    aspect:
      currentImg.naturalWidth && currentImg.naturalHeight
        ? currentImg.naturalWidth / currentImg.naturalHeight
        : rect.width / Math.max(1, rect.height),
  };
  document.addEventListener("mousemove", onHandleMove);
  document.addEventListener("mouseup", onHandleUp);
}

function onHandleMove(e) {
  if (!dragState || !currentImg) return;
  const dx = e.clientX - dragState.startX;

  let newW;
  switch (dragState.handle) {
    case "se":
    case "ne":
      newW = dragState.startW + dx;
      break;
    case "sw":
    case "nw":
      newW = dragState.startW - dx;
      break;
  }
  newW = Math.max(40, newW);
  const newH = newW / dragState.aspect;

  resizer.style.width = newW + "px";
  resizer.style.height = newH + "px";
}

function onHandleUp() {
  document.removeEventListener("mousemove", onHandleMove);
  document.removeEventListener("mouseup", onHandleUp);
  if (!dragState || !currentImg) {
    dragState = null;
    return;
  }

  // Commit width in pixels; height auto keeps aspect
  const w = parseFloat(resizer.style.width);
  currentImg.style.display = "inline-block"; // helps accuracy
  currentImg.style.width = w + "px";
  currentImg.style.height = "auto";

  dragState = null;
  syncAll();
  // Reposition overlay to the committed size/location
  positionResizer(currentImg);
}

// Show resizer when clicking an image
editable.addEventListener("click", (e) => {
  const img = e.target.closest("img");
  if (img) {
    currentImg = img;
    positionResizer(img);
  } else {
    hideResizer();
  }
});

// Reposition overlay on any scroll/resize/layout change
window.addEventListener(
  "scroll",
  () => {
    if (currentImg) positionResizer(currentImg);
  },
  true
);
window.addEventListener("resize", () => {
  if (currentImg) positionResizer(currentImg);
});
editable.addEventListener("input", () => {
  if (currentImg) positionResizer(currentImg);
});

// ---------- Seed example ----------
editable.innerHTML = `<p style="text-align: center;"><b><span class="size-normal size-smaller size-smallest size-largest size-larger">Title Here</span></b></p><p>&nbsp; &nbsp; &nbsp;ข้าพเจ้ารับทราบว่าเพื่อให้บรรลุตามวัตถุประสงค์ในการใช้บริการต่าง ๆ ของบริษัท <b>แอสเซนด์</b> นาโน จำกัด ข้าพเจ้าให้ความยินยอมแก่บริษัท ทรู มูฟ เอช ยูนิเวอร์แซล คอมมิวนิเคชั่น จำกัด บริษัท ทรู อินเทอร์เน็ต คอร์ปอเรชั่น  จำกัด <font color="#ff2929">บริษัททรูวิชั่นส์กรุ๊ป</font> จำกัด และ <font color="#294cff"><b><u>บริษัททรูดิจิทัลกรุ๊ป</u></b></font> จำกัด (“<b>บริษัทฯ</b>”)  ในการเก็บรวบรวม และ/หรือ ใช้ และ/หรือ เปิดเผย ข้อมูลส่วนบุคคลของข้าพเจ้า และ/หรือข้อมูลใด ๆ อันเกี่ยวกับการใช้สินค้าบริการของข้าพเจ้าให้แก่บริษัท แอสเซนด์ นาโน จำกัด เพื่อวัตถุประสงค์ในการวิเคราะห์สินเชื่อ การทบทวนสินเชื่อ และการใช้สิทธิเรียกร้องเกี่ยวกับสินเชื่อ&nbsp;<strike>ทดสอบ Strike</strike></p><p>&nbsp; &nbsp; &nbsp;ทั้งนี้ ข้าพเจ้ารับทราบว่าบริษัทในกลุ่มทรูหมายถึงบริษัทตามรายชื่อที่กำหนดไว้ในนโยบายคุ้มครองข้อมูลส่วนบุคคล โดยข้าพเจ้าได้อ่านและรับทราบนโยบายคุ้มครองข้อมูลส่วนบุคคลของบริษัทฯ เป็นอย่างดีแล้ว ที่เว็บไซต์ <a href="https://www3.truecorp.co.th/new/privacy-policy" target="_blank" rel="noopener noreferrer">https://www3.truecorp.co.th/new/privacy-policy</a>&nbsp;(*Test <sup><font color="#ed1212">XXX</font></sup>) และ   ข้าพเจ้ารับทราบว่าข้าพเจ้าสามารถใช้สิทธิถอนความยินยอม(<font color="#dd0e0e"><sub>*123</sub></font>)ได้ที่การตั้งค่าความเป็นส่วนตัวในหน้าสินเชื่อของบริษัท แอสเซนด์ นาโน จำกัด ของข้าพเจ้าผ่านแอปพลิเคชันทรูมันนี่ วอลเล็ท <strike>ทดสอบ Strike</strike></p>`;
syncAll();

// --- Initialize TableTools ---
if (window.TableTools) {
  TableTools.init({
    editableEl: document.getElementById("editable"),
    button: document.getElementById("tableBtn"),
    deleteButton: document.getElementById("tableDeleteBtn"),
    modal: {
      root: document.getElementById("tableModal"),
      rows: document.getElementById("tableRows"),
      cols: document.getElementById("tableCols"),
      header: document.getElementById("tableHeader"),
      insert: document.getElementById("tableInsert"),
      cancel: document.getElementById("tableCancel"),
      borderColor: document.getElementById("tableBorderColor"),
      borderSize: document.getElementById("tableBorderSize"),
    },
  });
}

//copy

//###################################################
// ====== GOOGLE SHEET SUBMIT ======

// const SUBMIT_URL ="https://script.google.com/macros/s/AKfycbyoAEH3fCeRkAuBr6lMSt84Baj2oKLKaCMi_Jn7Tcy9-qSQEgV1O1S1vhg2X7mJetazZA/exec"; // <-- replace after Step 3
// const submitBtn = document.getElementById("submitBtn");

// async function gatherFormData() {
//   // Configuration form
//   const cfg = document.getElementById("configForm");
//   const contentForm = document.getElementById("contentForm");

//   // Helper to read radio value by name
//   const rv = (name, fallback = "no") => {
//     const el = cfg.querySelector(`input[name="${name}"]:checked`);
//     return el ? el.value : fallback;
//   };

//   // Use the HTML you show in the code box (already sanitized in your app)
//   const codearea = document.getElementById("codearea");
//   const contentHTML = codearea.value || "";

//   return {
//     // Content section (metadata)
//     agreementNo:
//       contentForm.querySelector('[name="agreementNo"]')?.value?.trim() || "",
//     agreementVersion:
//       contentForm.querySelector('[name="agreementVersion"]')?.value?.trim() ||
//       "",
//     language: contentForm.querySelector('[name="language"]')?.value || "TH",
//     title: contentForm.querySelector('[name="title"]')?.value?.trim() || "",

//     // Configuration section
//     url: cfg.querySelector('[name="url"]')?.value?.trim() || "",
//     disclaimer: cfg.querySelector('[name="disclaimer"]')?.value?.trim() || "",
//     consequence: cfg.querySelector('[name="consequence"]')?.value?.trim() || "",
//     mandatory: rv("mandatory", "no"),
//     staffRevoke: rv("staffRevoke", "no"),
//     custRevoke: rv("custRevoke", "no"),
//     prodRequire: rv("prodRequire", "no"),
//     composite: rv("composite", "no"),
//     parent: cfg.querySelector('[name="parent"]')?.value?.trim() || "",
//     hiddenPeriod:
//       cfg.querySelector('[name="hiddenPeriod"]')?.value?.trim() || "",
//     linkConsent: cfg.querySelector('[name="linkConsent"]')?.value?.trim() || "",
//     relationship:
//       cfg.querySelector('[name="relationship"]')?.value?.trim() || "",
//     startDate: cfg.querySelector('[name="startDate"]')?.value || "",
//     endDate: cfg.querySelector('[name="endDate"]')?.value || "",

//     // Payload content
//     contentHTML, // the generated HTML fragment
//   };
// }

// // const SUBMIT_URL = 'https://script.google.com/macros/s/XXXX/exec'; // <-- /exec URL

// async function submitToSheet() {
//   if (!SUBMIT_URL || SUBMIT_URL.includes("XXXX")) {
//     alert("Please set SUBMIT_URL to your Apps Script /exec URL.");
//     return;
//   }

//   const data = await gatherFormData();
//   if (!data.agreementNo || !data.agreementVersion || !data.title) {
//     alert("Agreement No, Agreement Version, and Title are required.");
//     return;
//   }

//   submitBtn.disabled = true;
//   submitBtn.textContent = "Saving…";

//   try {
//     // Send as x-www-form-urlencoded to avoid CORS preflight
//     const body = new URLSearchParams({ payload: JSON.stringify(data) });

//     const res = await fetch(SUBMIT_URL, {
//       method: "POST",
//       headers: { "Content-Type": "application/x-www-form-urlencoded" },
//       body,
//     });

//     const out = await res.json();
//     if (!res.ok || !out.ok) throw new Error(out.error || res.statusText);

//     alert(`Saved! Agreement ID = ${out.agreementId}`);
//   } catch (err) {
//     console.error(err);
//     alert("Failed to save: " + err.message);
//   } finally {
//     submitBtn.disabled = false;
//     submitBtn.textContent = "Save to Sheet";
//   }
// }

// if (submitBtn) submitBtn.addEventListener("click", submitToSheet);

//####

// ----- Copy Generated HTML to clipboard -----
const copyBtn = document.getElementById("copyBtn");
// const codearea = document.getElementById('codearea');

async function copyGeneratedHtml() {
  const text = codearea?.value ?? "";
  if (!text) {
    alert("Nothing to copy yet. Click Update first or make an edit.");
    return;
  }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for older/non-secure contexts
      const t = document.createElement("textarea");
      t.value = text;
      t.style.position = "fixed";
      t.style.top = "-9999px";
      document.body.appendChild(t);
      t.focus();
      t.select();
      document.execCommand("copy");
      document.body.removeChild(t);
    }
    // quick visual feedback
    const old = copyBtn.textContent;
    copyBtn.textContent = "Copied!";
    copyBtn.disabled = true;
    setTimeout(() => {
      copyBtn.textContent = old;
      copyBtn.disabled = false;
    }, 1200);
  } catch (err) {
    console.error(err);
    alert("Copy failed: " + err.message);
  }
}

if (copyBtn) copyBtn.addEventListener("click", copyGeneratedHtml);



// =============== PDF support (PDF.js) =================

// mode: "text" (editable text) or "image" (page snapshots)
async function convertPdfToHtml(arrayBuffer, mode = "text") {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  if (mode === "image") {
    // Render each page to a canvas, then to <img> data URL
    const imgs = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1.5 }); // tweak for quality
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const url = canvas.toDataURL("image/png");
      imgs.push(`<p><img src="${url}" alt="Page ${p}" /></p>`);
    }
    return imgs.join("\n");
  }

  // Default: TEXT extraction (lightweight, editable)
  const blocks = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    // Join items by line; PDF.js gives fine-grained chunks
    const text = tc.items.map(i => i.str).join(" ");
    if (text.trim()) {
      // split into paragraphs on double line breaks heuristically
      const paras = text
        .split(/\n{2,}/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => `<p>${escapeHtml(s)}</p>`)
        .join("\n");
      blocks.push(paras || `<p><!-- empty page ${p} --></p>`);
    } else {
      blocks.push(`<p><!-- empty page ${p} --></p>`);
    }
  }
  return blocks.join("\n");
}
