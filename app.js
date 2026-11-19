/* =========================================================
   Ankur — a local-first tasks & habits tracker
   No dependencies. State lives in localStorage.
   ========================================================= */
'use strict';

const STORE_KEY = 'ankur.v1';
const MS_DAY = 86_400_000;

const CHECK_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 13 4.5 4.5L19 7"/></svg>';
const CAL_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>';
const TRASH_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l.9 12.2a2 2 0 0 0 2 1.8h5.2a2 2 0 0 0 2-1.8L17.5 7"/></svg>';

/* ------------------------- DOM ------------------------- */
const el = {
  todayLabel: document.getElementById('today-label'),
  themeToggle: document.getElementById('theme-toggle'),
  tabs: Array.from(document.querySelectorAll('.tab')),
  views: Array.from(document.querySelectorAll('.view')),

  taskForm: document.getElementById('task-form'),
  taskTitle: document.getElementById('task-title'),
  taskDue: document.getElementById('task-due'),
  taskPriority: document.getElementById('task-priority'),
  taskNote: document.getElementById('task-note'),
  taskList: document.getElementById('task-list'),
  taskEmpty: document.getElementById('task-empty'),
  emptyTitle: document.getElementById('empty-title'),
  emptyText: document.getElementById('empty-text'),
  loadDemo: document.getElementById('load-demo'),
  taskSummary: document.getElementById('task-summary'),
  openCount: document.getElementById('count-open'),
  search: document.getElementById('task-search'),
  sort: document.getElementById('task-sort'),
  filters: Array.from(document.querySelectorAll('[data-filter]')),

  habitForm: document.getElementById('habit-form'),
  habitName: document.getElementById('habit-name'),
  habitList: document.getElementById('habit-list'),
  habitEmpty: document.getElementById('habit-empty'),

  statsBody: document.getElementById('stats-body'),
  resetAll: document.getElementById('reset-all'),

  toast: document.getElementById('toast'),
  toastMsg: document.getElementById('toast-msg'),
  toastAction: document.getElementById('toast-action'),
  topbar: document.querySelector('.topbar'),
};

/* ------------------------ Helpers ----------------------- */
const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const escapeHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

const toISO = (d = new Date()) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

const todayISO = () => toISO();

function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

const dayDiff = (a, b) => Math.round((fromISO(a) - fromISO(b)) / MS_DAY);

function prettyDate(iso) {
  const diff = dayDiff(iso, todayISO());
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return `${-diff}d overdue`;
  if (diff < 7) return fromISO(iso).toLocaleDateString(undefined, { weekday: 'short' });
  return fromISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

/* ------------------------- State ------------------------ */
const DEFAULT_UI = { view: 'tasks', filter: 'all', query: '', sort: 'created' };

function freshState() {
  return { tasks: [], habits: [], theme: 'auto', ui: { ...DEFAULT_UI } };
}

function loadState() {
  const base = freshState();
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== 'object') return base;

  const state = { ...base, ...raw };
  state.tasks = Array.isArray(raw.tasks)
    ? raw.tasks
        .filter((t) => t && typeof t.title === 'string')
        .map((t) => ({
          id: t.id || uid(),
          title: t.title,
          note: typeof t.note === 'string' ? t.note : '',
          due: typeof t.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : null,
          priority: ['high', 'normal', 'low'].includes(t.priority) ? t.priority : 'normal',
          done: Boolean(t.done),
          created: Number(t.created) || Date.now(),
          completedAt: typeof t.completedAt === 'string' ? t.completedAt : null,
        }))
    : [];
  state.habits = Array.isArray(raw.habits)
    ? raw.habits
        .filter((h) => h && typeof h.name === 'string')
        .map((h) => ({
          id: h.id || uid(),
          name: h.name,
          created: Number(h.created) || Date.now(),
          history: h.history && typeof h.history === 'object' ? { ...h.history } : {},
        }))
    : [];
  state.ui = { ...DEFAULT_UI, ...(raw.ui && typeof raw.ui === 'object' ? raw.ui : {}) };
  if (!['tasks', 'habits', 'stats'].includes(state.ui.view)) state.ui.view = 'tasks';
  if (!['all', 'active', 'done'].includes(state.ui.filter)) state.ui.filter = 'all';
  if (!['created', 'due', 'priority', 'title'].includes(state.ui.sort)) state.ui.sort = 'created';
  if (typeof state.ui.query !== 'string') state.ui.query = '';
  if (!['auto', 'light', 'dark'].includes(state.theme)) state.theme = 'auto';
  return state;
}

const state = loadState();
let editingId = null;
let toastTimer = null;
let undoAction = null;

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked — the app still works for this session */
  }
}

/* ------------------------ Theme ------------------------- */
const mq = window.matchMedia('(prefers-color-scheme: dark)');
const THEME_ORDER = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: 'System theme', light: 'Light theme', dark: 'Dark theme' };

function applyTheme() {
  const resolved = state.theme === 'auto' ? (mq.matches ? 'dark' : 'light') : state.theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = state.theme;
  el.themeToggle.setAttribute('aria-label', `${THEME_LABEL[state.theme]} — click to change`);
  el.themeToggle.title = THEME_LABEL[state.theme];
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0e1211' : '#f7f6f2');
}

mq.addEventListener('change', () => {
  if (state.theme === 'auto') applyTheme();
});

el.themeToggle.addEventListener('click', () => {
  const next = THEME_ORDER[(THEME_ORDER.indexOf(state.theme) + 1) % THEME_ORDER.length];
  state.theme = next;
  applyTheme();
  save();
  toast(THEME_LABEL[next]);
});

/* ------------------------- Toast ------------------------ */
function toast(message, action) {
  clearTimeout(toastTimer);
  el.toastMsg.textContent = message;
  undoAction = action || null;
  el.toastAction.hidden = !action;
  el.toast.hidden = false;
  requestAnimationFrame(() => el.toast.classList.add('show'));
  toastTimer = setTimeout(hideToast, action ? 6000 : 2600);
}

function hideToast() {
  clearTimeout(toastTimer);
  el.toast.classList.remove('show');
  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
    undoAction = null;
  }, 220);
}

el.toastAction.addEventListener('click', () => {
  if (typeof undoAction === 'function') undoAction();
  hideToast();
});

/* ------------------------ View tabs --------------------- */
function setView(view) {
  state.ui.view = view;
  save();
  el.tabs.forEach((tab) => {
    const on = tab.dataset.view === view;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  });
  el.views.forEach((panel) => {
    panel.hidden = panel.id !== `view-${view}`;
  });
  if (view === 'stats') renderStats();
  if (view === 'habits') renderHabits();
  if (view === 'tasks') renderTasks();
}

el.tabs.forEach((tab) => {
  tab.addEventListener('click', () => setView(tab.dataset.view));
  tab.addEventListener('keydown', (e) => {
    const i = el.tabs.indexOf(tab);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = el.tabs[(i + (e.key === 'ArrowRight' ? 1 : el.tabs.length - 1)) % el.tabs.length];
      next.focus();
      setView(next.dataset.view);
    }
  });
});

/* ========================= TASKS ========================= */
function visibleTasks() {
  const { filter, query, sort } = state.ui;
  const q = query.trim().toLowerCase();

  let list = state.tasks.filter((t) => {
    if (filter === 'active' && t.done) return false;
    if (filter === 'done' && !t.done) return false;
    if (q && !(`${t.title} ${t.note}`.toLowerCase().includes(q))) return false;
    return true;
  });

  const recentFirst = (a, b) => b.created - a.created;
  list.sort((a, b) => {
    switch (sort) {
      case 'due':
        if (!a.due && !b.due) return recentFirst(a, b);
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due.localeCompare(b.due) || recentFirst(a, b);
      case 'priority':
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || recentFirst(a, b);
      case 'title':
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      default:
        return recentFirst(a, b);
    }
  });

  if (filter === 'all') {
    // finished work sinks to the bottom, but keeps the chosen ordering inside each group
    list = [...list.filter((t) => !t.done), ...list.filter((t) => t.done)];
  }
  return list;
}

function taskTags(t) {
  const tags = [];
  if (t.due) {
    const diff = dayDiff(t.due, todayISO());
    const cls = t.done ? '' : diff < 0 ? 'due-late' : diff === 0 ? 'due-today' : '';
    tags.push(`<span class="chip ${cls}">${CAL_SVG}${escapeHtml(prettyDate(t.due))}</span>`);
  }
  if (t.priority !== 'normal') {
    tags.push(
      `<span class="chip ${t.priority === 'high' ? 'pri-high' : 'pri-low'}">${t.priority === 'high' ? 'High' : 'Low'} priority</span>`
    );
  }
  return tags.length ? `<div class="task-tags">${tags.join('')}</div>` : '';
}

function renderTasks() {
  const list = visibleTasks();
  const editing = editingId;

  el.taskList.innerHTML = list
    .map((t) => {
      const isEditing = t.id === editing;
      const title = isEditing
        ? `<input class="task-edit" type="text" maxlength="140" value="${escapeHtml(t.title)}" aria-label="Rename task" />`
        : `<button class="task-title" type="button" data-act="edit" title="Click to rename">${escapeHtml(t.title)}</button>`;
      return `
        <li class="task ${t.done ? 'is-done' : ''}" data-id="${t.id}">
          <button class="check" type="button" data-act="toggle"
                  aria-pressed="${t.done}" aria-label="${t.done ? 'Mark as not done' : 'Mark as done'}: ${escapeHtml(t.title)}">
            ${CHECK_SVG}
          </button>
          <div class="task-body">
            ${title}
            ${t.note && !isEditing ? `<p class="task-note">${escapeHtml(t.note)}</p>` : ''}
            ${taskTags(t)}
          </div>
          <button class="task-del" type="button" data-act="delete" aria-label="Delete task: ${escapeHtml(t.title)}">
            ${TRASH_SVG}
          </button>
        </li>`;
    })
    .join('');

  // summary line
  const open = state.tasks.filter((t) => !t.done);
  const done = state.tasks.length - open.length;
  const dueToday = open.filter((t) => t.due === todayISO()).length;
  const late = open.filter((t) => t.due && t.due < todayISO()).length;
  const bits = [];
  if (state.tasks.length) {
    bits.push(`${open.length} open`);
    if (dueToday) bits.push(`${dueToday} due today`);
    if (late) bits.push(`${late} overdue`);
    bits.push(`${done} done`);
    el.taskSummary.textContent = bits.join(' · ');
  } else {
    el.taskSummary.textContent = 'Nothing on the list yet.';
  }
  el.openCount.textContent = String(open.length);
  el.openCount.hidden = open.length === 0;

  // empty state
  const hasAny = state.tasks.length > 0;
  el.taskEmpty.hidden = list.length > 0;
  if (!hasAny) {
    el.emptyTitle.textContent = 'A clear list. A clear mind.';
    el.emptyText.textContent = 'Add your first task above — or take a tour with some sample data.';
    el.loadDemo.hidden = false;
  } else {
    el.loadDemo.hidden = true;
    if (state.ui.query.trim()) {
      el.emptyTitle.textContent = 'No matches.';
      el.emptyText.textContent = `Nothing found for “${state.ui.query.trim()}”. Try a different word.`;
    } else if (state.ui.filter === 'active') {
      el.emptyTitle.textContent = 'Nothing left to do.';
      el.emptyText.textContent = 'Every task is done. Enjoy the quiet.';
    } else if (state.ui.filter === 'done') {
      el.emptyTitle.textContent = 'Nothing finished yet.';
      el.emptyText.textContent = 'Check a task off and it will land here.';
    } else {
      el.emptyTitle.textContent = 'No tasks here.';
      el.emptyText.textContent = 'Add one above to get going.';
    }
  }

  // focus the inline editor — but never steal focus from the search box
  const input = el.taskList.querySelector('.task-edit');
  if (input && document.activeElement !== el.search) {
    input.focus();
    try {
      input.setSelectionRange(input.value.length, input.value.length);
    } catch {
      /* some browsers disallow selection on unrendered inputs */
    }
  }
}

/* ---------- task mutations ---------- */
function commitEdit(value) {
  if (!editingId) return;
  const task = state.tasks.find((t) => t.id === editingId);
  const title = value.trim();
  editingId = null;
  if (task && title && title !== task.title) {
    task.title = title;
    save();
  }
  renderTasks();
}

el.taskForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = el.taskTitle.value.trim();
  if (!title) {
    el.taskTitle.focus();
    return;
  }
  state.tasks.push({
    id: uid(),
    title,
    note: el.taskNote.value.trim(),
    due: el.taskDue.value || null,
    priority: el.taskPriority.value,
    done: false,
    created: Date.now(),
    completedAt: null,
  });
  save();
  el.taskTitle.value = '';
  el.taskNote.value = '';
  el.taskDue.value = '';
  el.taskPriority.value = 'normal';
  if (state.ui.filter === 'done') {
    state.ui.filter = 'all';
    syncFilterButtons();
  }
  if (state.ui.query) {
    state.ui.query = '';
    el.search.value = '';
  }
  renderTasks();
  el.taskTitle.focus();
});

el.taskList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const li = btn.closest('.task');
  if (!li) return;
  const task = state.tasks.find((t) => t.id === li.dataset.id);
  if (!task) return;

  if (btn.dataset.act === 'toggle') {
    task.done = !task.done;
    task.completedAt = task.done ? new Date().toISOString() : null;
    save();
    renderTasks();
    if (task.done) toast('Nice — one down.');
  } else if (btn.dataset.act === 'delete') {
    deleteTask(task.id);
  } else if (btn.dataset.act === 'edit') {
    editingId = task.id;
    renderTasks();
  }
});

el.taskList.addEventListener(
  'keydown',
  (e) => {
    if (!e.target.classList.contains('task-edit')) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit(e.target.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      editingId = null;
      renderTasks();
    }
  },
  true
);

el.taskList.addEventListener(
  'blur',
  (e) => {
    if (e.target.classList && e.target.classList.contains('task-edit')) commitEdit(e.target.value);
  },
  true
);

function deleteTask(id) {
  const index = state.tasks.findIndex((t) => t.id === id);
  if (index === -1) return;
  const [removed] = state.tasks.splice(index, 1);
  save();
  renderTasks();
  toast('Task deleted', () => {
    state.tasks.splice(Math.min(index, state.tasks.length), 0, removed);
    save();
    renderTasks();
  });
}

/* ---------- filters, search, sort ---------- */
function syncFilterButtons() {
  el.filters.forEach((b) => b.classList.toggle('active', b.dataset.filter === state.ui.filter));
}

el.filters.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.ui.filter = btn.dataset.filter;
    syncFilterButtons();
    save();
    renderTasks();
  });
});

el.search.value = state.ui.query;
el.sort.value = state.ui.sort;
syncFilterButtons();

el.search.addEventListener('input', () => {
  state.ui.query = el.search.value;
  renderTasks();
  // searching can reveal the editor; keep focus where the user is typing
  if (document.activeElement === el.taskList.querySelector('.task-edit')) return;
});
el.search.addEventListener('blur', save);

el.sort.addEventListener('change', () => {
  state.ui.sort = el.sort.value;
  save();
  renderTasks();
});

/* ======================== HABITS ======================== */
function currentStreak(habit) {
  const h = habit.history || {};
  const today = todayISO();
  let cursor = h[today] ? today : addDays(today, -1); // today isn't required yet
  let n = 0;
  while (h[cursor]) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

function bestStreak(habit) {
  const dates = Object.keys(habit.history || {})
    .filter((d) => habit.history[d])
    .sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of dates) {
    run = prev && dayDiff(d, prev) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

const totalCheckins = (habit) =>
  Object.values(habit.history || {}).filter(Boolean).length;

function renderHabits() {
  el.habitEmpty.hidden = state.habits.length > 0;

  el.habitList.innerHTML = state.habits
    .map((habit) => {
      const today = todayISO();
      const streak = currentStreak(habit);
      const best = bestStreak(habit);
      const total = totalCheckins(habit);
      const dots = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(today, i - 6);
        const on = Boolean(habit.history[date]);
        const cls = [
          'dot',
          on ? 'on' : '',
          date === today ? 'today' : '',
        ].filter(Boolean).join(' ');
        const dayName = fromISO(date).toLocaleDateString(undefined, { weekday: 'narrow' });
        return `<button class="${cls}" type="button" data-act="day" data-date="${date}"
                  aria-pressed="${on}" aria-label="${escapeHtml(
                    fromISO(date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
                  )}">
                  <b>${fromISO(date).getDate()}</b><i>${dayName}</i>
                </button>`;
      }).join('');

      return `
        <article class="habit" data-id="${habit.id}">
          <div class="habit-head">
            <h3 class="habit-name">${escapeHtml(habit.name)}</h3>
            <button class="task-del" type="button" data-act="delete" aria-label="Delete habit: ${escapeHtml(habit.name)}">${TRASH_SVG}</button>
          </div>
          <div class="dots">${dots}</div>
          <div class="habit-meta">
            <span class="${streak >= 3 ? 'streak-hot' : ''}">${streak >= 3 ? '🔥 ' : ''}Streak <strong>${streak}</strong></span>
            <span>Best <strong>${best}</strong></span>
            <span>Done <strong>${total}</strong>×</span>
          </div>
        </article>`;
    })
    .join('');
}

el.habitForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = el.habitName.value.trim();
  if (!name) {
    el.habitName.focus();
    return;
  }
  state.habits.push({ id: uid(), name, created: Date.now(), history: {} });
  save();
  el.habitName.value = '';
  renderHabits();
  el.habitName.focus();
});

el.habitList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const card = btn.closest('.habit');
  if (!card) return;
  const habit = state.habits.find((h) => h.id === card.dataset.id);
  if (!habit) return;

  if (btn.dataset.act === 'day') {
    const date = btn.dataset.date;
    if (habit.history[date]) delete habit.history[date];
    else habit.history[date] = true;
    save();
    renderHabits();
    const streak = currentStreak(habit);
    if (habit.history[date] && streak > 1) toast(`${streak}-day streak on “${habit.name}”.`);
  } else if (btn.dataset.act === 'delete') {
    const index = state.habits.findIndex((h) => h.id === habit.id);
    const [removed] = state.habits.splice(index, 1);
    save();
    renderHabits();
    toast('Habit deleted', () => {
      state.habits.splice(Math.min(index, state.habits.length), 0, removed);
      save();
      renderHabits();
    });
  }
});

/* ======================== STATS ========================= */
function renderStats() {
  const tasks = state.tasks;
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const today = todayISO();

  const overdue = open.filter((t) => t.due && t.due < today).length;
  const dueToday = open.filter((t) => t.due === today).length;
  const completion = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;

  // completions per day, last 7 days
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const perDay = days.map((d) =>
    done.filter((t) => t.completedAt && toISO(new Date(t.completedAt)) === d).length
  );
  const maxDay = Math.max(1, ...perDay);
  const weekDone = perDay.reduce((a, b) => a + b, 0);

  // habit consistency over the same 7 days
  const habitSlots = state.habits.length * 7;
  const habitHits = state.habits.reduce(
    (sum, h) => sum + days.filter((d) => h.history[d]).length,
    0
  );
  const consistency = habitSlots ? Math.round((habitHits / habitSlots) * 100) : 0;

  const ranked = [...state.habits]
    .map((h) => ({ name: h.name, streak: currentStreak(h), total: totalCheckins(h) }))
    .sort((a, b) => b.streak - a.streak || b.total - a.total)
    .slice(0, 5);

  const hasData = tasks.length > 0 || state.habits.length > 0;

  el.statsBody.innerHTML = `
    <div class="stat-grid">
      <div class="stat">
        <div class="stat-label">Completion</div>
        <div class="stat-value">${completion}<span class="stat-sub">%</span></div>
        <div class="stat-sub">${done.length} of ${tasks.length} tasks</div>
      </div>
      <div class="stat">
        <div class="stat-label">Open</div>
        <div class="stat-value">${open.length}</div>
        <div class="stat-sub">${dueToday} due today · ${overdue} overdue</div>
      </div>
      <div class="stat">
        <div class="stat-label">Finished this week</div>
        <div class="stat-value">${weekDone}</div>
        <div class="stat-sub">last 7 days</div>
      </div>
      <div class="stat">
        <div class="stat-label">Habit consistency</div>
        <div class="stat-value">${consistency}<span class="stat-sub">%</span></div>
        <div class="stat-sub">${habitHits} of ${habitSlots} check-ins</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <h2>Momentum</h2>
        <p class="muted">Tasks completed each day</p>
        <div class="chart">
          ${days
            .map(
              (d, i) => `
            <div class="bar-col ${perDay[i] === 0 ? 'empty-day' : ''}" title="${perDay[i]} on ${d}">
              <div class="bar-track"><div class="bar" style="--h:${Math.max(4, (perDay[i] / maxDay) * 100)}%"></div></div>
              <span class="bar-day">${fromISO(d).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
            </div>`
            )
            .join('')}
        </div>
      </div>

      <div class="panel">
        <h2>Longest streaks</h2>
        <p class="muted">Current runs, best first</p>
        ${
          ranked.length
            ? `<ul class="rank-list" style="margin-top:.7rem">
                ${ranked
                  .map(
                    (r) => `<li>
                      <span class="rank-name">${escapeHtml(r.name)}</span>
                      <span class="rank-val">${r.streak ? `${r.streak >= 3 ? '🔥 ' : ''}${r.streak} day${r.streak === 1 ? '' : 's'}` : 'no streak yet'}</span>
                    </li>`
                  )
                  .join('')}
              </ul>`
            : `<p class="muted small" style="margin-top:.9rem">No habits yet — add one to start tracking.</p>`
        }
      </div>
    </div>

    ${
      hasData
        ? ''
        : `<div class="empty" style="margin-top:.9rem">
             <p class="empty-title">No data yet.</p>
             <p class="muted">Add a task or a habit and this page fills itself in.</p>
           </div>`
    }
  `;
}

el.resetAll.addEventListener('click', () => {
  const ok = window.confirm('Delete all tasks and habits from this browser? This cannot be undone.');
  if (!ok) return;
  state.tasks = [];
  state.habits = [];
  state.ui = { ...DEFAULT_UI, view: state.ui.view };
  editingId = null;
  el.search.value = '';
  el.sort.value = state.ui.sort;
  syncFilterButtons();
  save();
  renderTasks();
  renderHabits();
  renderStats();
  toast('All data cleared.');
});

/* ====================== SAMPLE DATA ===================== */
el.loadDemo.addEventListener('click', () => {
  const t = todayISO();
  state.tasks.push(
    { id: uid(), title: 'Plan the week ahead', note: 'Three priorities, nothing more.', due: t, priority: 'high', done: false, created: Date.now() - 5000, completedAt: null },
    { id: uid(), title: 'Reply to the pending emails', note: '', due: addDays(t, 1), priority: 'normal', done: false, created: Date.now() - 4000, completedAt: null },
    { id: uid(), title: 'Water the plants', note: '', due: addDays(t, -1), priority: 'low', done: false, created: Date.now() - 3000, completedAt: null },
    { id: uid(), title: 'Set up the new repo', note: 'Ankur finally has a home.', due: null, priority: 'normal', done: true, created: Date.now() - 2000, completedAt: new Date().toISOString() }
  );

  const habit = (name, offsets) => {
    const history = {};
    offsets.forEach((o) => { history[addDays(t, -o)] = true; });
    return { id: uid(), name, created: Date.now(), history };
  };
  state.habits.push(
    habit('Read 10 pages', [0, 1, 2, 3, 5, 6]),
    habit('Walk 20 minutes', [0, 1, 3, 4, 5]),
    habit('Drink water', [0, 1, 2, 3, 4, 5, 6])
  );

  save();
  renderTasks();
  renderHabits();
  renderStats();
  toast('Sample data loaded — edit or clear it any time.');
});

/* ===================== SHORTCUTS ======================= */
document.addEventListener('keydown', (e) => {
  const target = e.target;
  const typing =
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable);

  if (typing) {
    if (e.key === 'Escape' && target === el.search) {
      el.search.value = '';
      state.ui.query = '';
      save();
      renderTasks();
      target.blur();
    }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.key === '/') {
    e.preventDefault();
    setView('tasks');
    el.search.focus();
    el.search.select();
  } else if (e.key.toLowerCase() === 'n') {
    e.preventDefault();
    setView('tasks');
    el.taskTitle.focus();
  } else if (['1', '2', '3'].includes(e.key)) {
    e.preventDefault();
    setView(['tasks', 'habits', 'stats'][Number(e.key) - 1]);
  }
});

/* ======================== BOOT ========================== */
function renderChrome() {
  const now = new Date();
  el.todayLabel.textContent = now.toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
  });
  el.todayLabel.dateTime = toISO(now);
}

window.addEventListener('scroll', () => {
  el.topbar.classList.toggle('stuck', window.scrollY > 4);
}, { passive: true });

applyTheme();
renderChrome();
setView(state.ui.view);
renderTasks();
renderHabits();
renderStats();
