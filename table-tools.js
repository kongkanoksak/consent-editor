/* table-tools.js
   Adds Table support:
   - Insert table with rows/cols, optional header row
   - User can pick border color + border size
   - Delete table button
   - Tab/Shift+Tab moves cells, Enter inserts new line (<br>)
   - Lists / bold / links work inside cells (execCommand applies normally)
*/

(function () {
  const state = {
    editable: null,
    btn: null,
    deleteBtn: null,
    modal: null,
  };

  const TableTools = {
    init(opts = {}) {
      state.editable = opts.editableEl || document.getElementById("editable");

      if (state.editable) {
        state.editable.addEventListener("keydown", onEditableKeyDown, true);
      }

      // Insert button
      if (opts.button) {
        state.btn = opts.button;
        state.btn.addEventListener("click", onInsertTableClick);
      }

      // Delete button
      if (opts.deleteButton) {
        state.deleteBtn = opts.deleteButton;
        state.deleteBtn.addEventListener("click", onDeleteTableClick);
      }

      // Modal
      if (opts.modal) {
        state.modal = normalizeModal(opts.modal);
        wireModal();
      }
    },

    insertTable(rows, cols, options = {}) {
      ensureEditable();

      const borderColor =
        options.borderColor ||
        (state.modal &&
          state.modal.borderColor &&
          state.modal.borderColor.value) ||
        "#000000";
      const borderSize =
        parseInt(
          options.borderSize ||
            (state.modal &&
              state.modal.borderSize &&
              state.modal.borderSize.value) ||
            1,
          10
        ) || 1;

      const html = buildTableHTML(
        rows,
        cols,
        !!options.header,
        borderColor,
        borderSize
      );
      insertHTMLAtSelection(html, state.editable);

      const firstCell = state.editable.querySelector(
        "table.editor-table td, table.editor-table th"
      );
      if (firstCell) placeCaretAtEnd(firstCell);

      if (typeof window.syncAll === "function") window.syncAll();
    },
  };

  window.TableTools = TableTools;

  // ---------- Insert / Delete Handlers ----------
  function onInsertTableClick() {
    if (state.modal && state.modal.root && state.modal.root._show) {
      state.modal.root._show();
    } else {
      const rc = prompt("Insert table (rows x cols), e.g. 3x2", "3x2");
      if (!rc) return;
      const match = rc.toLowerCase().match(/^\s*(\d+)\s*[x×]\s*(\d+)\s*$/);
      if (!match) return;
      const rows = Math.max(1, parseInt(match[1], 10));
      const cols = Math.max(1, parseInt(match[2], 10));
      TableTools.insertTable(rows, cols, { header: false });
    }
  }

  function onDeleteTableClick() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const node = sel.getRangeAt(0).commonAncestorContainer;
    const table =
      node.nodeType === 1
        ? node.closest("table")
        : node.parentElement && node.parentElement.closest("table");
    if (table) {
      table.remove();
      if (typeof window.syncAll === "function") window.syncAll();
    } else {
      alert("No table selected.");
    }
  }

  // ---------- Modal Helpers ----------
  function normalizeModal(m) {
    return {
      root: m.root,
      rows: m.rows,
      cols: m.cols,
      header: m.header,
      insert: m.insert,
      cancel: m.cancel,
      borderColor: m.borderColor,
      borderSize: m.borderSize,
    };
  }

  function wireModal() {
    if (!state.modal) return;
    const { root, rows, cols, header, insert, cancel } = state.modal;

    root.dataset.open = "false";

    function show() {
      root.style.display = "flex";
      root.setAttribute("aria-hidden", "false");
      setTimeout(() => rows && rows.focus(), 0);
    }
    function hide() {
      root.style.display = "none";
      root.setAttribute("aria-hidden", "true");
      state.editable && state.editable.focus();
    }

    root.addEventListener("click", (e) => {
      if (e.target === root) hide();
    });
    cancel && cancel.addEventListener("click", hide);
    insert &&
      insert.addEventListener("click", () => {
        const r = Math.max(1, parseInt(rows && rows.value, 10) || 0);
        const c = Math.max(1, parseInt(cols && cols.value, 10) || 0);
        const h = !!(header && header.checked);
        if (!r || !c) {
          hide();
          return;
        }
        const borderColor = state.modal.borderColor
          ? state.modal.borderColor.value
          : "#000000";
        const borderSize = state.modal.borderSize
          ? parseInt(state.modal.borderSize.value, 10)
          : 1;
        TableTools.insertTable(r, c, { header: h, borderColor, borderSize });
        hide();
      });

    root._show = show;
    root._hide = hide;
  }

  // ---------- Build Table ----------
  function buildTableHTML(rows, cols, withHeader, borderColor, borderSize) {
    const r = Math.max(1, rows | 0);
    const c = Math.max(1, cols | 0);

    const style = `border:${borderSize}px solid ${borderColor}; border-collapse: collapse;`;
    const cellStyle = `border:${borderSize}px solid ${borderColor}; padding:4px; vertical-align: top;`;

    const thead = withHeader
      ? `<thead><tr>${repeat(
          c,
          () => `<th style="${cellStyle}"><br></th>`
        ).join("")}</tr></thead>`
      : "";

    const bodyRows = repeat(
      r,
      () =>
        `<tr>${repeat(c, () => `<td style="${cellStyle}"><br></td>`).join(
          ""
        )}</tr>`
    ).join("");

    return `<table class="editor-table" style="${style}" contenteditable="false">${thead}<tbody>${bodyRows}</tbody></table>`;
  }

  function repeat(n, fn) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(fn(i));
    return out;
  }

  // ---------- Editing Helpers ----------
  function insertHTMLAtSelection(html, container) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !container.contains(sel.anchorNode)) {
      container.insertAdjacentHTML("beforeend", html);
      return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const frag = range.createContextualFragment(html);
    range.insertNode(frag);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function onEditableKeyDown(e) {
    const cell = getClosestCell(e.target);
    if (!cell) return;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.execCommand("insertLineBreak");
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      moveToAdjacentCell(cell, !e.shiftKey);
      return;
    }
  }

  function getClosestCell(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return el && el.closest("td, th");
  }

  function moveToAdjacentCell(currentCell, forward) {
    const table = currentCell.closest("table");
    if (!table) return;

    const cells = [...table.querySelectorAll("th, td")];
    let idx = cells.indexOf(currentCell);
    if (idx === -1) return;
    idx = idx + (forward ? 1 : -1);

    if (idx >= cells.length) {
      const cols =
        table.querySelectorAll("tr:first-child th, tr:first-child td").length ||
        1;
      const tr = document.createElement("tr");
      for (let i = 0; i < cols; i++) {
        const td = document.createElement("td");
        td.style.border = currentCell.style.border;
        td.style.padding = "4px";
        td.innerHTML = "<br>";
        tr.appendChild(td);
      }
      table.querySelector("tbody")?.appendChild(tr);
      const newCells = [...table.querySelectorAll("th, td")];
      idx = newCells.length - cols;
      placeCaretAtStart(newCells[idx]);
      return;
    }

    if (idx < 0) {
      placeCaretAtStart(cells[0]);
      return;
    }

    placeCaretAtStart(cells[idx]);
  }

  function placeCaretAtStart(el) {
    el.focus?.();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function placeCaretAtEnd(el) {
    el.focus?.();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function ensureEditable() {
    if (!state.editable) {
      state.editable = document.getElementById("editable");
    }
    if (!state.editable) throw new Error("#editable not found for TableTools");

    state.editable.addEventListener(
      "click",
      (e) => {
        const table =
          e.target.closest && e.target.closest("table.editor-table");
        if (table) {
          table.querySelectorAll("td, th").forEach((cell) => {
            cell.setAttribute("contenteditable", "true");
          });
          table.setAttribute("contenteditable", "false");
        }
      },
      { capture: true }
    );
  }
})();
