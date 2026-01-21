document.addEventListener("DOMContentLoaded", () => {
  init().catch(showError);
});

function $(id) { return document.getElementById(id); }

/* ==============================
   ✅ Hard-coded GitHub settings
   ============================== */
const GH_OWNER  = "pmjoh1-eq";
const GH_REPO   = "IBMATHS";
const GH_BRANCH = "main";

/* Where plans live in your repo */
const PLAN_PATH_TEMPLATE = (classId) => `data/plans/${classId}.json`;

/* Classes */
const CLASSES = ["12AA_SL","12AA_HL","12AI_SL","11AA_SL","11AA_HL","11AI_SL"];

/* Storage keys */
const LS_TOKEN_KEY = "planner_github_token_v1";

/* State */
let repoRoot = "";
let statusEl, treeEl, classSelect, loadBtn, saveBtn, lessonEditorEl, coverageViewEl;
let ghTokenEl, saveTokenBtn, clearTokenBtn;

let syllabus = [];
let textbooks = [];
let plan = null;

let selected = { termIndex: 0, weekIndex: 0, lessonIndex: null };
let collapsed = { terms: {}, weeks: {} };

async function init() {
  statusEl = $("status");
  treeEl = $("tree");
  classSelect = $("classSelect");
  loadBtn = $("loadBtn");
  saveBtn = $("saveBtn");
  lessonEditorEl = $("lessonEditor");
  coverageViewEl = $("coverageView");

  ghTokenEl = $("ghToken");
  saveTokenBtn = $("saveTokenBtn");
  clearTokenBtn = $("clearTokenBtn");

  repoRoot = getRepoRoot();

  // Class dropdown
  classSelect.innerHTML = "";
  for (const c of CLASSES) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    classSelect.appendChild(opt);
  }

  // Load token from localStorage
  const savedToken = localStorage.getItem(LS_TOKEN_KEY) || "";
  if (ghTokenEl) ghTokenEl.value = savedToken;

  saveTokenBtn?.addEventListener("click", () => {
    localStorage.setItem(LS_TOKEN_KEY, ghTokenEl.value.trim());
    setStatus("Token saved locally.", "ok");
    setTimeout(clearStatus, 1200);
  });

  clearTokenBtn?.addEventListener("click", () => {
    localStorage.removeItem(LS_TOKEN_KEY);
    ghTokenEl.value = "";
    setStatus("Token cleared.", "ok");
    setTimeout(clearStatus, 1200);
  });

  classSelect.addEventListener("change", () => loadAll().catch(showError));
  loadBtn.addEventListener("click", () => loadAll().catch(showError));
  saveBtn.addEventListener("click", () => saveToGitHub().catch(showError));

  setStatus("Loading reference data…");
  [syllabus, textbooks] = await Promise.all([
    loadJSON(new URL("data/syllabus_objectives.json", repoRoot).toString(), "syllabus_objectives.json"),
    loadJSON(new URL("data/textbook_references.json", repoRoot).toString(), "textbook_references.json"),
  ]);
  clearStatus();

  await loadAll();
}

/* ---------- Load plan + render ---------- */
async function loadAll() {
  const classId = classSelect.value || CLASSES[0];
  classSelect.value = classId;

  setStatus(`Loading plan: ${classId}…`);
  const url = new URL(PLAN_PATH_TEMPLATE(classId), repoRoot).toString();
  plan = await loadJSON(url, `${classId}.json`);
  clearStatus();

  selected = { termIndex: 0, weekIndex: 0, lessonIndex: null };
  collapsed = { terms: {}, weeks: {} };

  renderTree();
  renderLessonEditor();
  renderCoverage();
}

/* ---------- Tree ---------- */
function renderTree() {
  treeEl.innerHTML = "";
  if (!plan?.terms) return;

  plan.terms.forEach((term, tIdx) => {
    const termKey = String(tIdx);
    if (collapsed.terms[termKey] === undefined) collapsed.terms[termKey] = true;

    const termBox = document.createElement("div");
    termBox.className = "treeItem";

    const hdr = document.createElement("div");
    hdr.className = "treeHdr";

    const left = document.createElement("div");
    left.className = "treeHdrLeft";
    left.innerHTML = `
      <div class="treeTitle">${escapeHtml(term.label || term.term_id || `Term ${tIdx + 1}`)}</div>
      <div class="treeMeta">Term</div>
    `;
    left.onclick = () => {
      collapsed.terms[termKey] = !collapsed.terms[termKey];
      renderTree();
    };

    const btn = document.createElement("button");
    btn.className = "iconBtn";
    btn.textContent = collapsed.terms[termKey] ? "+" : "−";
    btn.onclick = () => {
      collapsed.terms[termKey] = !collapsed.terms[termKey];
      renderTree();
    };

    hdr.appendChild(left);
    hdr.appendChild(btn);
    termBox.appendChild(hdr);

    if (!collapsed.terms[termKey]) {
      const termChildren = document.createElement("div");
      termChildren.className = "treeChildren";

      (term.weeks || []).forEach((week, wIdx) => {
        const wkKey = `${tIdx}-${wIdx}`;
        if (collapsed.weeks[wkKey] === undefined) collapsed.weeks[wkKey] = true;

        const weekBox = document.createElement("div");
        weekBox.className = "treeItem";

        const wh = document.createElement("div");
        wh.className = "treeHdr";

        const wLeft = document.createElement("div");
        wLeft.className = "treeHdrLeft";
        const dateLabel = week.start_date ? ` • starts ${escapeHtml(week.start_date)}` : "";
        wLeft.innerHTML = `
          <div class="treeTitle">${escapeHtml(week.label || week.week_id || `Week ${wIdx + 1}`)}</div>
          <div class="treeMeta">Week${dateLabel}</div>
        `;
        wLeft.onclick = () => {
          collapsed.weeks[wkKey] = !collapsed.weeks[wkKey];
          renderTree();
        };

        const wBtn = document.createElement("button");
        wBtn.className = "iconBtn";
        wBtn.textContent = collapsed.weeks[wkKey] ? "+" : "−";
        wBtn.onclick = () => {
          collapsed.weeks[wkKey] = !collapsed.weeks[wkKey];
          renderTree();
        };

        wh.appendChild(wLeft);
        wh.appendChild(wBtn);
        weekBox.appendChild(wh);

        if (!collapsed.weeks[wkKey]) {
          const weekChildren = document.createElement("div");
          weekChildren.className = "treeChildren";

          (week.lessons || []).forEach((lesson, lIdx) => {
            const b = document.createElement("button");
            b.className = "lessonBtn" + (isSelected(tIdx, wIdx, lIdx) ? " active" : "");
            b.textContent = lesson.title || `Lesson ${lIdx + 1}`;
            b.onclick = () => {
              selected = { termIndex: tIdx, weekIndex: wIdx, lessonIndex: lIdx };
              renderTree();
              renderLessonEditor();
              renderCoverage();
            };
            weekChildren.appendChild(b);
          });

          weekBox.appendChild(weekChildren);
        }

        termChildren.appendChild(weekBox);
      });

      termBox.appendChild(termChildren);
    }

    treeEl.appendChild(termBox);
  });
}

function isSelected(t, w, l) {
  return selected.termIndex === t && selected.weekIndex === w && selected.lessonIndex === l;
}

/* ---------- Lesson editor ---------- */
function renderLessonEditor() {
  const lesson = getSelectedLesson();
  if (!lesson) {
    lessonEditorEl.innerHTML = `<div class="muted">Select a lesson to edit.</div>`;
    return;
  }

  lessonEditorEl.innerHTML = `
    <div class="row">
      <label>Title</label>
      <input id="editTitle" type="text" value="${escapeAttr(lesson.title || "")}">
      <div class="small">Shown in the tree and lesson view.</div>
    </div>

    <div class="row">
      <label>Homework</label>
      <input id="editHomework" type="text" value="${escapeAttr(lesson.homework || "")}">
    </div>

    <div class="row">
      <label>Teacher Notes (LaTeX)</label>
      <textarea id="editNotes">${escapeHtml(lesson.notes_latex || "")}</textarea>
      <div class="small">Student view shows this as text; you can embed LaTeX for MathJax rendering.</div>
    </div>

    <div class="row">
      <label>Syllabus IDs (comma-separated)</label>
      <input id="editSyllabus" type="text" value="${escapeAttr((lesson.syllabus_ids || []).join(", "))}">
    </div>

    <div class="row">
      <label>Textbook IDs (comma-separated)</label>
      <input id="editTextbooks" type="text" value="${escapeAttr((lesson.textbook_ids || []).join(", "))}">
    </div>
  `;

  // Wire inputs → update plan in memory
  $("editTitle").addEventListener("input", (e) => { lesson.title = e.target.value; renderTree(); });
  $("editHomework").addEventListener("input", (e) => { lesson.homework = e.target.value; });
  $("editNotes").addEventListener("input", (e) => { lesson.notes_latex = e.target.value; });
  $("editSyllabus").addEventListener("input", (e) => {
    lesson.syllabus_ids = splitIds(e.target.value);
    renderCoverage();
  });
  $("editTextbooks").addEventListener("input", (e) => { lesson.textbook_ids = splitIds(e.target.value); });

  // Optional MathJax refresh
  typesetMath().catch(() => {});
}

function splitIds(s) {
  return String(s || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

/* ---------- Coverage ---------- */
function renderCoverage() {
  if (!coverageViewEl) return;
  if (!plan?.terms) { coverageViewEl.innerHTML = `<div class="muted">No plan loaded.</div>`; return; }

  const scheduled = new Set();
  for (const term of plan.terms) {
    for (const week of (term.weeks || [])) {
      for (const lesson of (week.lessons || [])) {
        (lesson.syllabus_ids || []).forEach(id => scheduled.add(id));
      }
    }
  }

  const missing = syllabus.filter(s => !scheduled.has(s.id));

  coverageViewEl.innerHTML = missing.length
    ? `<div><strong>${missing.length}</strong> objectives not yet scheduled:</div>
       <ul class="coverList">${missing.slice(0, 300).map(s => `<li><strong>${escapeHtml(s.section || s.id)}</strong> — ${escapeHtml(s.text || "")}</li>`).join("")}</ul>
       ${missing.length > 300 ? `<div class="muted">Showing first 300.</div>` : ""}`
    : `<div class="muted">All syllabus objectives appear scheduled 🎉</div>`;
}

/* ==============================
   ✅ GitHub Save (robust)
   ============================== */
async function saveToGitHub() {
  const token = (ghTokenEl?.value || localStorage.getItem(LS_TOKEN_KEY) || "").trim();
  if (!token) {
    setStatus("No token found. Paste token and click “Save token”.", "error");
    return;
  }

  const classId = classSelect.value || CLASSES[0];
  const path = PLAN_PATH_TEMPLATE(classId);

  setStatus(`Saving ${path} to ${GH_OWNER}/${GH_REPO}@${GH_BRANCH}…`);

  // 1) Get current file (for SHA). If missing, we will create.
  let sha = null;
  const getUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(path).replaceAll("%2F","/")}?ref=${encodeURIComponent(GH_BRANCH)}`;

  const getRes = await fetch(getUrl, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    }
  });

  if (getRes.status === 200) {
    const existing = await getRes.json();
    sha = existing.sha;
  } else if (getRes.status === 404) {
    sha = null; // create new
  } else {
    const t = await safeText(getRes);
    throw new Error(`GitHub GET failed (${getRes.status}). ${t}`);
  }

  // 2) PUT updated content
  const putUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(path).replaceAll("%2F","/")}`;
  const contentB64 = toBase64Utf8(JSON.stringify(plan, null, 2));

  const body = {
    message: `Update plan: ${classId}`,
    content: contentB64,
    branch: GH_BRANCH,
  };
  if (sha) body.sha = sha;

  const putRes = await fetch(putUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(body)
  });

  if (!putRes.ok) {
    const t = await safeText(putRes);
    // Common helpful hints
    if (putRes.status === 401 || putRes.status === 403) {
      throw new Error(
        `GitHub PUT failed (${putRes.status}). Token likely missing permissions.\n` +
        `For fine-grained tokens: allow Repository “IBMATHS” and enable “Contents: Read and write”.\n` +
        `${t}`
      );
    }
    if (putRes.status === 409) {
      throw new Error(
        `GitHub PUT failed (409). File changed since you loaded it.\n` +
        `Click “Reload” then save again.\n` +
        `${t}`
      );
    }
    throw new Error(`GitHub PUT failed (${putRes.status}). ${t}`);
  }

  const putJson = await putRes.json();
  setStatus(`Saved ✓ Commit: ${putJson?.commit?.sha?.slice(0, 7) || "ok"}`, "ok");
  setTimeout(clearStatus, 1800);
}

/* ---------- Helpers ---------- */
async function loadJSON(url, label) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${label}: ${res.status} ${res.statusText}\nURL: ${url}`);
  return await res.json();
}

function getRepoRoot() {
  const path = window.location.pathname;
  const idx = path.lastIndexOf("/teacher/");
  if (idx >= 0) return window.location.origin + path.slice(0, idx + 1);
  return new URL(".", window.location.href).toString();
}

function getSelectedTerm() { return (plan?.terms || [])[selected.termIndex] || null; }
function getSelectedWeek() {
  const term = getSelectedTerm();
  return (term?.weeks || [])[selected.weekIndex] || null;
}
function getSelectedLesson() {
  const week = getSelectedWeek();
  if (!week || selected.lessonIndex === null) return null;
  return (week.lessons || [])[selected.lessonIndex] || null;
}

function setStatus(msg, kind = "info") {
  statusEl.hidden = false;
  statusEl.className = "status" + (kind === "error" ? " error" : kind === "ok" ? " ok" : "");
  statusEl.textContent = msg;
}
function clearStatus() {
  statusEl.hidden = true;
  statusEl.textContent = "";
}
function showError(err) {
  console.error(err);
  setStatus(err?.message || String(err), "error");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function escapeAttr(s) { return escapeHtml(s).replaceAll("`", "&#96;"); }

async function typesetMath() {
  try {
    if (window.MathJax?.typesetPromise) await window.MathJax.typesetPromise();
  } catch {}
}

function toBase64Utf8(str) {
  // Safe base64 for unicode
  return btoa(unescape(encodeURIComponent(str)));
}

async function safeText(res) {
  try { return await res.text(); } catch { return ""; }
}
