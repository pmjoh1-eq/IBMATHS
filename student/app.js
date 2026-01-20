// Robust GitHub Pages base-path handling + visible errors

const plannerEl = document.getElementById("planner");
const statusEl = document.getElementById("status");
const classSelect = document.getElementById("classSelect");

const CLASSES = [
  "12AA_SL", "12AA_HL", "12AI_SL",
  "11AA_SL", "11AA_HL", "11AI_SL"
];

// Data caches
let syllabus = [];
let textbooks = [];

// ---------- boot ----------
init().catch(err => showError(err));

async function init() {
  setStatus("Loading data…");

  // Compute repo root (works for https://user.github.io/repo/student/index.html)
  const repoRoot = getRepoRoot();

  // Build URLs safely
  const syllabusUrl = new URL("data/syllabus_objectives.json", repoRoot).toString();
  const textbooksUrl = new URL("data/textbook_references.json", repoRoot).toString();

  // Load global datasets
  [syllabus, textbooks] = await Promise.all([
    loadJSON(syllabusUrl, "syllabus_objectives.json"),
    loadJSON(textbooksUrl, "textbook_references.json"),
  ]);

  // Populate class dropdown
  classSelect.innerHTML = "";
  for (const c of CLASSES) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    classSelect.appendChild(opt);
  }

  classSelect.addEventListener("change", () => {
    loadAndRenderSelected(repoRoot).catch(err => showError(err));
  });

  // Initial render
  await loadAndRenderSelected(repoRoot);

  clearStatus();
}

async function loadAndRenderSelected(repoRoot) {
  const classId = classSelect.value || CLASSES[0];
  classSelect.value = classId;

  setStatus(`Loading plan: ${classId}…`);

  const planUrl = new URL(`data/plans/${classId}.json`, repoRoot).toString();
  const plan = await loadJSON(planUrl, `${classId}.json`);

  renderPlan(plan);

  clearStatus();
  await typesetMath();
}

// ---------- rendering ----------
function renderPlan(plan) {
  plannerEl.innerHTML = "";

  const header = document.createElement("div");
  header.className = "planHeader";
  header.innerHTML = `
    <div class="planTitle">${escapeHtml(plan.label || plan.class_id || "Plan")}</div>
    <div class="planMeta">
      <span class="pill">${escapeHtml(plan.class_id || "")}</span>
      ${plan.programme ? `<span class="pill">${escapeHtml(plan.programme)}</span>` : ""}
      ${plan.level ? `<span class="pill">${escapeHtml(plan.level)}</span>` : ""}
      ${Array.isArray(plan.years) ? `<span class="pill">${escapeHtml(plan.years.join(", "))}</span>` : ""}
    </div>
  `;
  plannerEl.appendChild(header);

  if (!plan.terms || plan.terms.length === 0) {
    plannerEl.appendChild(infoBox("No terms found in this plan file."));
    return;
  }

  for (const term of plan.terms) {
    const termDetails = makeDetails("term", term.label || term.term_id || "Term");
    const termBody = termDetails.querySelector(".detailsBody");

    if (!term.weeks || term.weeks.length === 0) {
      termBody.appendChild(infoBox("No weeks added yet."));
      plannerEl.appendChild(termDetails);
      continue;
    }

    for (const week of term.weeks) {
      const weekDetails = makeDetails("week", week.label || week.week_id || "Week");
      const weekBody = weekDetails.querySelector(".detailsBody");

      if (!week.lessons || week.lessons.length === 0) {
        weekBody.appendChild(infoBox("No lessons added yet."));
        termBody.appendChild(weekDetails);
        continue;
      }

      for (const lesson of week.lessons) {
        const lessonDetails = makeDetails("lesson", lesson.title || lesson.lesson_id || "Lesson");
        const lessonBody = lessonDetails.querySelector(".detailsBody");

        // Syllabus
        lessonBody.appendChild(renderList(
          "Syllabus objectives",
          (lesson.syllabus_ids || []).map(id => {
            const obj = byId(syllabus, id);
            return obj ? obj.text : `<span class="missing">Missing syllabus id: ${escapeHtml(id)}</span>`;
          })
        ));

        // Textbook refs (link if URL)
        lessonBody.appendChild(renderList(
          "Textbook references",
          (lesson.textbook_ids || []).map(id => {
            const tb = byId(textbooks, id);
            if (!tb) return `<span class="missing">Missing textbook id: ${escapeHtml(id)}</span>`;
            const label = escapeHtml(tb.label || id);
            const detail = tb.detail ? ` <span class="muted">— ${escapeHtml(tb.detail)}</span>` : "";
            if (tb.url) {
              const safeUrl = escapeAttr(tb.url);
              return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>${detail}`;
            }
            return `${label}${detail}`;
          })
        ));

        // Homework
        if (lesson.homework && String(lesson.homework).trim() !== "") {
          lessonBody.appendChild(renderBlock("Homework", escapeHtml(String(lesson.homework))));
        }

        // Notes (LaTeX allowed)
        if (lesson.notes_latex && String(lesson.notes_latex).trim() !== "") {
          // Allow LaTeX to pass through; still escape dangerous HTML
          lessonBody.appendChild(renderBlock("Notes", escapeHtmlAllowLatex(String(lesson.notes_latex))));
        }

        weekBody.appendChild(lessonDetails);
      }

      termBody.appendChild(weekDetails);
    }

    plannerEl.appendChild(termDetails);
  }
}

function makeDetails(levelClass, titleText) {
  const details = document.createElement("details");
  details.className = `details ${levelClass}`;

  // Terms default open; weeks/lessons closed
  if (levelClass === "term") details.open = true;

  const summary = document.createElement("summary");
  summary.className = "summary";
  summary.innerHTML = `<span class="summaryText">${escapeHtml(titleText)}</span>`;
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "detailsBody";
  details.appendChild(body);

  return details;
}

function renderList(title, itemsHtml) {
  const wrap = document.createElement("div");
  wrap.className = "block";

  const h = document.createElement("div");
  h.className = "blockTitle";
  h.textContent = title;
  wrap.appendChild(h);

  if (!itemsHtml || itemsHtml.length === 0) {
    wrap.appendChild(infoBox("None."));
    return wrap;
  }

  const ul = document.createElement("ul");
  ul.className = "list";
  for (const item of itemsHtml) {
    const li = document.createElement("li");
    li.innerHTML = item; // already escaped / safe HTML
    ul.appendChild(li);
  }
  wrap.appendChild(ul);

  return wrap;
}

function renderBlock(title, htmlText) {
  const wrap = document.createElement("div");
  wrap.className = "block";

  const h = document.createElement("div");
  h.className = "blockTitle";
  h.textContent = title;
  wrap.appendChild(h);

  const p = document.createElement("div");
  p.className = "para";
  p.innerHTML = htmlText;
  wrap.appendChild(p);

  return wrap;
}

function infoBox(text) {
  const div = document.createElement("div");
  div.className = "info";
  div.textContent = text;
  return div;
}

// ---------- fetch helpers ----------
async function loadJSON(url, labelForErrors) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load ${labelForErrors}: ${res.status} ${res.statusText}\nURL: ${url}`);
  }
  return await res.json();
}

function getRepoRoot() {
  // Example paths:
  // /myrepo/student/index.html -> root = /myrepo/
  // /student/index.html (local) -> root = /
  const path = window.location.pathname;

  const idx = path.lastIndexOf("/student/");
  if (idx >= 0) {
    return window.location.origin + path.slice(0, idx + 1); // include trailing slash
  }

  // fallback: current directory's parent
  const url = new URL(".", window.location.href);
  return url.toString();
}

function byId(arr, id) {
  return arr.find(x => x && x.id === id);
}

// ---------- status / errors ----------
function setStatus(msg) {
  statusEl.hidden = false;
  statusEl.className = "status";
  statusEl.textContent = msg;
}
function clearStatus() {
  statusEl.hidden = true;
  statusEl.textContent = "";
}
function showError(err) {
  statusEl.hidden = false;
  statusEl.className = "status error";
  statusEl.textContent = (err && err.message) ? err.message : String(err);
  console.error(err);
}

// ---------- MathJax ----------
async function typesetMath() {
  // MathJax may not be ready immediately; do not crash
  try {
    if (window.MathJax && typeof window.MathJax.typesetPromise === "function") {
      await window.MathJax.typesetPromise();
    }
  } catch (e) {
    // ignore math rendering errors; keep app functional
    console.warn("MathJax typeset failed:", e);
  }
}

// ---------- escaping ----------
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Allow LaTeX delimiters and backslashes through, but still escape HTML tags.
// (Your notes are LaTeX, not HTML, so this is safe.)
function escapeHtmlAllowLatex(s) {
  return escapeHtml(s)
    // restore common LaTeX sequences after HTML escaping
    .replaceAll("\\\\", "\\"); // keep backslashes from double-escaping look
}

function escapeAttr(s) {
  // minimal attribute escaping for URLs
  return String(s).replaceAll('"', "%22").replaceAll("'", "%27");
}
