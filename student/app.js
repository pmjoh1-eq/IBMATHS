const plannerEl = document.getElementById("planner");
const classSelect = document.getElementById("classSelect");

const CLASSES = [
  "11AA_SL", "11AA_HL", "11AI_SL",
  "12AA_SL", "12AA_HL", "12AI_SL"
];

let syllabus = [];
let textbooks = [];

init();

async function init() {
  syllabus = await loadJSON("../data/syllabus_objectives.json");
  textbooks = await loadJSON("../data/textbook_references.json");

  CLASSES.forEach(cls => {
    const opt = document.createElement("option");
    opt.value = cls;
    opt.textContent = cls;
    classSelect.appendChild(opt);
  });

  classSelect.addEventListener("change", () => {
    loadPlan(classSelect.value);
  });

  loadPlan(CLASSES[0]);
}

async function loadPlan(classId) {
  const plan = await loadJSON(`../data/plans/${classId}.json`);
  renderPlan(plan);
}

function renderPlan(plan) {
  plannerEl.innerHTML = "";

  plan.terms.forEach(term => {
    const termEl = createSection("term", term.label);

    term.weeks.forEach(week => {
      const weekEl = createSection("week", week.label);

      week.lessons.forEach(lesson => {
        const lessonEl = createSection("lesson", lesson.title);

        lessonEl.appendChild(renderList(
          "Syllabus Objectives",
          lesson.syllabus_ids.map(id => findById(syllabus, id)?.text)
        ));

        lessonEl.appendChild(renderList(
          "Textbook References",
          lesson.textbook_ids.map(id => {
            const tb = findById(textbooks, id);
            return tb
              ? `<a href="${tb.url}" target="_blank">${tb.label}</a>`
              : null;
          })
        ));

        if (lesson.homework) {
          lessonEl.appendChild(paragraph("Homework: " + lesson.homework));
        }

        if (lesson.notes_latex) {
          lessonEl.appendChild(paragraph(lesson.notes_latex, true));
        }

        weekEl.appendChild(lessonEl);
      });

      termEl.appendChild(weekEl);
    });

    plannerEl.appendChild(termEl);
  });

  MathJax.typeset();
}

function createSection(cls, title) {
  const div = document.createElement("div");
  div.className = cls;

  const h = document.createElement("h2");
  h.textContent = title;
  h.onclick = () => div.classList.toggle("collapsed");

  div.appendChild(h);
  return div;
}

function renderList(title, items) {
  const div = document.createElement("div");
  div.innerHTML = `<strong>${title}:</strong>`;
  const ul = document.createElement("ul");

  items.filter(Boolean).forEach(item => {
    const li = document.createElement("li");
    li.innerHTML = item;
    ul.appendChild(li);
  });

  div.appendChild(ul);
  return div;
}

function paragraph(text, isLatex = false) {
  const p = document.createElement("p");
  p.innerHTML = text;
  return p;
}

function findById(arr, id) {
  return arr.find(x => x.id === id);
}

async function loadJSON(path) {
  const res = await fetch(path);
  return res.json();
}

