/* ============================================================
   مسیر من — My Path
   اپلیکیشن مدیریت عادت، ژورنال، توصیه‌ها، برین‌استورم، باشگاه
   Vanilla JS + LocalStorage — بدون هیچ وابستگی خارجی
   ============================================================ */
'use strict';

/* ============================================================
   ۱) ابزارهای کمکی
   ============================================================ */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = () => Math.random().toString(36).slice(2, 10);

const toISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const todayISO = () => toISO(new Date());
const faDate = (iso) =>
  new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' })
    .format(fromISO(iso));
const faWeekday = (iso) =>
  new Intl.DateTimeFormat('fa-IR', { weekday: 'long' }).format(fromISO(iso));
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PERSIAN_DAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const WEEKDAY_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
const persianDayIndex = (iso) => (fromISO(iso).getDay() + 1) % 7;

const MOODS = [
  { v: 1, e: '😞' }, { v: 2, e: '😐' }, { v: 3, e: '🙂' },
  { v: 4, e: '😄' }, { v: 5, e: '🤩' }
];
const MOOD_EMOJI = (v) => (MOODS.find((m) => m.v === v) || {}).e || '🙂';

const MUSCLES = ['سینه', 'پشت', 'پا', 'سرشانه', 'بازو', 'شکم', 'ساعد', 'ساق', 'فول‌بادی'];

const QUOTES = [
  'هر روز یک قدم کوچک، بهتر از هیچ قدمیه تینا.',
  'تو از دیروزت قوی‌تری تینا',
  'عادت‌های کوچک، نتایج بزرگ می‌سازن تینا.',
  'به خودت سخت نگیر، ولی رهاش هم نکن تینا',
  'پیشرفت یعنی تکرار تینا',
  'امروز بهترین فرصت برای شروع دوباره‌ست تینا',
  'خودت رو با دیروز خودت مقایسه کن، نه با بقیه تینا',
  'هر روزی که تلاش کنی، برنده‌ای تینا',
  'نظم، آزادی میاره تینا',
  'کارهای کوچک امروز، زندگی بزرگ فردا رو می‌سازن تینا'
];

/* ============================================================
   ۲) کلیدهای LocalStorage
   ============================================================ */
const STORAGE = {
  habits:     'mypath_habits',
  logs:       'mypath_logs',
  journal:    'mypath_journal',
  settings:   'mypath_settings',
  weekly:     'mypath_weekly',
  advice:     'mypath_advice',
  brainstorm: 'mypath_brainstorm',
  gym:        'mypath_gym',
  plan:       'mypath_plan'
};

/* ============================================================
   ۳) state
   ============================================================ */
let state = {
  habits: [],
  logs: {},
  journal: [],
  settings: { name: '', palette: 'green', theme: 'light', reminder: '08:00' },
  weekly: {},
  advice: [],
  brainstorm: [],
  gym: [],
  plan: { sessionsPerWeek: 3, days: {} }
};

/* متغیرهای کمکی */
let editingHabitId = null;
let editingJournalId = null;
let autosaveTimer = null;
let weeklyTimer = null;

let editingAdviceId = null;
let adviceSelectedColor = '#fef3c7';

let editingTopicId = null;
let topicSelectedColor = '#fef3c7';
let currentTopicId = null;
let brainstormTimer = null;

let editingGymId = null;

let currentPlanDay = null;
let currentPlanExIdx = null;

/* ============================================================
   ۴) ذخیره / بارگذاری
   ============================================================ */
function defaultHabits() {
  return [
    { id: uid(), title: 'ورزش',        icon: '🏋️', color: '#10b981', days: [], order: 0 },
    { id: uid(), title: 'مطالعه',       icon: '📖', color: '#3b82f6', days: [], order: 1 },
    { id: uid(), title: 'آب کافی',      icon: '💧', color: '#06b6d4', days: [], order: 2 },
    { id: uid(), title: 'سیگار نکشیدن', icon: '🚭', color: '#ef4444', days: [], order: 3 },
  ];
}

function ensurePlanDefaults() {
  if (!state.plan || typeof state.plan !== 'object') state.plan = {};
  if (typeof state.plan.sessionsPerWeek !== 'number') state.plan.sessionsPerWeek = 3;
  if (!state.plan.days) state.plan.days = {};
  for (let i = 0; i < 7; i++) {
    if (!state.plan.days[i]) state.plan.days[i] = { rest: true, exercises: [] };
    else {
      if (typeof state.plan.days[i].rest !== 'boolean') state.plan.days[i].rest = true;
      if (!Array.isArray(state.plan.days[i].exercises)) state.plan.days[i].exercises = [];
    }
  }
}

function load() {
  try {
    const rawHabits = localStorage.getItem(STORAGE.habits);
    state.habits = rawHabits ? JSON.parse(rawHabits) : defaultHabits();
    if (!rawHabits) save('habits');

    state.logs       = JSON.parse(localStorage.getItem(STORAGE.logs))       || {};
    state.journal    = JSON.parse(localStorage.getItem(STORAGE.journal))    || [];
    state.weekly     = JSON.parse(localStorage.getItem(STORAGE.weekly))     || {};
    state.advice     = JSON.parse(localStorage.getItem(STORAGE.advice))     || [];
    state.brainstorm = JSON.parse(localStorage.getItem(STORAGE.brainstorm)) || [];
    state.gym        = JSON.parse(localStorage.getItem(STORAGE.gym))        || [];
    state.plan       = JSON.parse(localStorage.getItem(STORAGE.plan))       || { sessionsPerWeek: 3, days: {} };

    const rawSettings = JSON.parse(localStorage.getItem(STORAGE.settings));
    if (rawSettings) Object.assign(state.settings, rawSettings);

    ensurePlanDefaults();
  } catch (err) {
    console.error('خطا در خواندن داده‌ها:', err);
  }
}

function save(key) {
  try {
    localStorage.setItem(STORAGE[key], JSON.stringify(state[key]));
  } catch (err) {
    console.error('خطا در ذخیره:', err);
  }
}

/* ============================================================
   ۵) منطق عادت‌ها
   ============================================================ */
const isScheduled = (habit, iso) => {
  if (!habit.days || habit.days.length === 0) return true;
  return habit.days.includes(persianDayIndex(iso));
};
const isChecked = (habitId, iso) => !!(state.logs[iso] && state.logs[iso][habitId]);

function toggleHabit(habitId, iso) {
  state.logs[iso] = state.logs[iso] || {};
  if (state.logs[iso][habitId]) delete state.logs[iso][habitId];
  else state.logs[iso][habitId] = true;
  save('logs');
}

function streak(habit) {
  let count = 0;
  const d = new Date();
  const today = toISO(d);
  if (isScheduled(habit, today) && !isChecked(habit.id, today)) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 400; i++) {
    const iso = toISO(d);
    if (isScheduled(habit, iso)) {
      if (isChecked(habit.id, iso)) count++;
      else break;
    }
    d.setDate(d.getDate() - 1);
  }
  return count;
}

function bestStreakOf(habit) {
  const dates = Object.keys(state.logs).sort();
  if (dates.length === 0) return 0;
  const start = fromISO(dates[0]);
  const end = new Date();
  let max = 0, cur = 0;
  const d = new Date(start);
  while (d <= end) {
    const iso = toISO(d);
    if (isScheduled(habit, iso)) {
      if (isChecked(habit.id, iso)) { cur++; if (cur > max) max = cur; }
      else cur = 0;
    }
    d.setDate(d.getDate() + 1);
  }
  return max;
}

function dayCompletion(iso) {
  const scheduled = state.habits.filter((h) => isScheduled(h, iso));
  if (scheduled.length === 0) return 0;
  const done = scheduled.filter((h) => isChecked(h.id, iso)).length;
  return Math.round((done / scheduled.length) * 100);
}

function overallActiveStreak() {
  let count = 0;
  const d = new Date();
  const today = toISO(d);
  const anyToday = state.logs[today] && Object.values(state.logs[today]).some(Boolean);
  if (!anyToday) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 1000; i++) {
    const iso = toISO(d);
    const any = state.logs[iso] && Object.values(state.logs[iso]).some(Boolean);
    if (any) count++;
    else break;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/* شروع/پایان هفته (شنبه‌محور) */
function startOfWeek(d = new Date()) {
  const day = (d.getDay() + 1) % 7;
  const s = new Date(d);
  s.setDate(s.getDate() - day);
  s.setHours(0, 0, 0, 0);
  return s;
}
function endOfWeek(d = new Date()) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}
function isInThisWeek(iso) {
  const d = fromISO(iso);
  return d >= startOfWeek() && d <= endOfWeek();
}

/* ============================================================
   ۶) توست
   ============================================================ */
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2200);
}

/* ============================================================
   ۷) تاپ‌بار و تنظیمات
   ============================================================ */
function renderTopbar() {
  const iso = todayISO();
  $('#topbarDate').textContent = `${faWeekday(iso)} ${faDate(iso)}`;
  $('#topbarUser').textContent = state.settings.name ? `سلام، ${state.settings.name} 👋` : '';
}

function applySettings() {
  document.documentElement.dataset.theme = state.settings.theme || 'light';
  document.documentElement.dataset.palette = state.settings.palette || 'green';
  $('#themeToggle').textContent = state.settings.theme === 'dark' ? '☀️' : '🌙';
  $('#topbarUser').textContent = state.settings.name ? `سلام، ${state.settings.name} 👋` : '';
}

function renderSettings() {
  $('#setName').value = state.settings.name || '';
  $('#setReminder').value = state.settings.reminder || '08:00';
  $$('#paletteRow button').forEach((b) =>
    b.classList.toggle('sel', b.dataset.palette === state.settings.palette));
}

/* ============================================================
   ۸) داشبورد
   ============================================================ */
function bestHabitByStreak() {
  if (state.habits.length === 0) return null;
  return state.habits.reduce((best, h) =>
    streak(h) > (best ? streak(best) : -1) ? h : best, null);
}

function renderDashboard() {
  const now = new Date();
  const hour = now.getHours();
  const name = state.settings.name || '';
  let greet = 'سلام';
  if (hour >= 5 && hour < 12)       greet = 'صبح‌بخیر';
  else if (hour >= 12 && hour < 17) greet = 'ظهرت بخیر';
  else if (hour >= 17 && hour < 21) greet = 'عصرت بخیر';
  else                              greet = 'شب‌بخیر';
  $('#greeting').textContent = `${greet}${name ? '، ' + name : ''} 🌱`;

  const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  $('#quote').textContent = '« ' + QUOTES[doy % QUOTES.length] + ' »';

  const today = todayISO();
  const pct = dayCompletion(today);
  $('#statToday').textContent = pct + '%';
  $('#dashProgress').style.width = pct + '%';
  $('#todayLabel').textContent = `${faWeekday(today)} ${faDate(today)}`;

  const best = bestHabitByStreak();
  $('#statBest').textContent = best ? `${best.icon} ${best.title}` : '—';
  $('#statStreak').textContent = overallActiveStreak();

  const pending = state.habits
    .filter((h) => isScheduled(h, today) && !isChecked(h.id, today))
    .slice(0, 3);
  const wrap = $('#dashPending');
  if (pending.length === 0) {
    wrap.innerHTML = '<p class="muted">🎉 همه عادت‌های امروز انجام شده! آفرین.</p>';
  } else {
    wrap.innerHTML = pending
      .map((h) => `<div class="pending-item"><span>${h.icon}</span><span>${esc(h.title)}</span></div>`)
      .join('');
  }

  const last = [...state.journal].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  const lj = $('#lastJournal');
  if (!last) {
    lj.innerHTML = '<p class="muted">هنوز ژورنالی ننوشتی. از صفحه ژورنال شروع کن.</p>';
  } else {
    const text = last.good || last.feeling || last.learned || last.tomorrow || '';
    lj.innerHTML = `
      <div class="lj-title">${MOOD_EMOJI(last.mood)} ${esc(last.title || 'بدون عنوان')}</div>
      <div class="muted small">${faDate(last.date)}</div>
      <p>${esc(text.slice(0, 140))}${text.length > 140 ? '…' : ''}</p>`;
  }
}

/* ============================================================
   ۹) عادت‌ها
   ============================================================ */
function renderTasks() {
  const today = todayISO();
  $('#tasksDate').textContent = `${faWeekday(today)} ${faDate(today)}`;

  const scheduled = state.habits.filter((h) => isScheduled(h, today));
  const done = scheduled.filter((h) => isChecked(h.id, today)).length;
  const pct = scheduled.length ? Math.round((done / scheduled.length) * 100) : 0;

  $('#tasksProgress').style.width = pct + '%';
  $('#tasksProgressText').textContent = `${done} از ${scheduled.length} انجام شده`;

  const list = $('#habitList');
  if (state.habits.length === 0) {
    list.innerHTML = '<p class="muted">هنوز عادتی نداری. با دکمه «عادت جدید» شروع کن.</p>';
    return;
  }

  list.innerHTML = state.habits.map((hb) => {
    const sched = isScheduled(hb, today);
    const checked = isChecked(hb.id, today);
    const st = streak(hb);
    const schedTxt = (!hb.days || hb.days.length === 0)
      ? 'هر روز'
      : hb.days.map((d) => PERSIAN_DAYS[d]).join('، ');
    return `
      <div class="habit-row ${sched ? '' : 'off'}" data-id="${hb.id}">
        <button class="check ${checked ? 'checked' : ''}"
                data-act="toggle" style="--c:${hb.color}"
                ${sched ? '' : 'disabled'}>${checked ? '✓' : ''}</button>
        <span class="h-icon">${hb.icon}</span>
        <div class="h-info">
          <div class="h-title">${esc(hb.title)}</div>
          <div class="h-meta">🔥 ${st} روز پشت‌سرهم • ${esc(schedTxt)}</div>
        </div>
        <div class="h-actions">
          <button data-act="up" title="بالا">↑</button>
          <button data-act="down" title="پایین">↓</button>
          <button data-act="edit" title="ویرایش">✏️</button>
          <button data-act="del" title="حذف">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

function moveHabit(id, dir) {
  const i = state.habits.findIndex((h) => h.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= state.habits.length) return;
  [state.habits[i], state.habits[j]] = [state.habits[j], state.habits[i]];
  state.habits.forEach((h, idx) => (h.order = idx));
  save('habits');
  renderTasks();
}

function deleteHabit(id) {
  if (!confirm('این عادت حذف بشه؟ (تاریخچه‌اش هم پاک می‌شه)')) return;
  state.habits = state.habits.filter((h) => h.id !== id);
  Object.values(state.logs).forEach((day) => { delete day[id]; });
  save('habits'); save('logs');
  renderTasks(); renderDashboard();
  toast('حذف شد');
}

/* ============================================================
   ۱۰) ژورنال
   ============================================================ */
function renderJournalList() {
  const search = ($('#jSearch').value || '').trim().toLowerCase();
  const moodF = $('#jMoodFilter').value;
  const tagF = $('#jTagFilter').value;

  let items = [...state.journal].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));

  if (search) {
    items = items.filter((e) =>
      [e.title, e.good, e.learned, e.feeling, e.tomorrow, (e.tags || []).join(' ')]
        .join(' ').toLowerCase().includes(search));
  }
  if (moodF) items = items.filter((e) => e.mood === Number(moodF));
  if (tagF)  items = items.filter((e) => (e.tags || []).includes(tagF));

  const allTags = [...new Set(state.journal.flatMap((e) => e.tags || []))];
  const tagSel = $('#jTagFilter');
  const sig = allTags.join(',');
  if (tagSel.dataset.sig !== sig) {
    const cur = tagSel.value;
    tagSel.innerHTML = '<option value="">همه تگ‌ها</option>' +
      allTags.map((t) => `<option value="${esc(t)}">#${esc(t)}</option>`).join('');
    tagSel.value = allTags.includes(cur) ? cur : '';
    tagSel.dataset.sig = sig;
  }

  const list = $('#journalList');
  if (items.length === 0) { list.innerHTML = '<p class="muted">ورودی‌ای پیدا نشد.</p>'; return; }

  list.innerHTML = items.map((e) => {
    const text = e.good || e.feeling || e.learned || e.tomorrow || '';
    const excerpt = text.slice(0, 160);
    return `
      <div class="journal-item" data-id="${e.id}">
        <div class="ji-head">
          <div class="ji-title">${MOOD_EMOJI(e.mood)} ${esc(e.title || 'بدون عنوان')}</div>
          <div class="ji-meta">${faDate(e.date)}</div>
        </div>
        ${(e.tags && e.tags.length)
          ? `<div class="ji-tags">${e.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
        ${excerpt ? `<p class="ji-preview">${esc(excerpt)}${text.length > 160 ? '…' : ''}</p>` : ''}
        <div class="ji-actions">
          <button data-act="edit">✏️ ویرایش</button>
          <button data-act="del">🗑️ حذف</button>
        </div>
      </div>`;
  }).join('');
}

function setMood(v) {
  $('#jMood').value = v;
  $$('#moodPicker button').forEach((b) =>
    b.classList.toggle('sel', Number(b.dataset.mood) === v));
}
function updateDateHint() {
  const val = $('#jDate').value;
  $('#jDateHint').textContent = val ? faDate(val) : '';
}
function readEditor() {
  return {
    title: $('#jTitle').value.trim(),
    date: $('#jDate').value || todayISO(),
    mood: Number($('#jMood').value) || 3,
    tags: $('#jTags').value.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean),
    good: $('#jGood').value.trim(),
    learned: $('#jLearned').value.trim(),
    feeling: $('#jFeeling').value.trim(),
    tomorrow: $('#jTomorrow').value.trim()
  };
}
function editorHasContent(d) {
  return !!(d.title || d.good || d.learned || d.feeling || d.tomorrow || (d.tags && d.tags.length));
}
function openEditor(entry) {
  $('#journalEditor').hidden = false;
  editingJournalId = entry ? entry.id : null;
  if (entry) {
    $('#jTitle').value = entry.title || '';
    $('#jDate').value = entry.date || todayISO();
    $('#jTags').value = (entry.tags || []).join(', ');
    $('#jGood').value = entry.good || '';
    $('#jLearned').value = entry.learned || '';
    $('#jFeeling').value = entry.feeling || '';
    $('#jTomorrow').value = entry.tomorrow || '';
    setMood(entry.mood || 3);
  } else {
    $('#jTitle').value = ''; $('#jDate').value = todayISO(); $('#jTags').value = '';
    $('#jGood').value = ''; $('#jLearned').value = ''; $('#jFeeling').value = ''; $('#jTomorrow').value = '';
    setMood(3);
  }
  updateDateHint();
  $('#autosaveInd').textContent = '';
  $('#journalEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => $('#jTitle').focus(), 200);
}
function closeEditor() {
  clearTimeout(autosaveTimer);
  $('#journalEditor').hidden = true;
  editingJournalId = null;
  $('#autosaveInd').textContent = '';
}
function saveEditor(explicit = true) {
  clearTimeout(autosaveTimer);
  const data = readEditor();
  if (editingJournalId) {
    const e = state.journal.find((x) => x.id === editingJournalId);
    if (e) Object.assign(e, data);
  } else {
    if (!editorHasContent(data)) {
      if (explicit) toast('چیزی برای ذخیره نیست');
      return;
    }
    const entry = Object.assign({ id: uid(), createdAt: Date.now() }, data);
    state.journal.push(entry);
    editingJournalId = entry.id;
  }
  save('journal');
  renderJournalList();
  if (explicit) { closeEditor(); toast('ذخیره شد ✓'); }
}
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  $('#autosaveInd').textContent = 'در حال ذخیره...';
  autosaveTimer = setTimeout(() => {
    saveEditor(false);
    $('#autosaveInd').textContent = 'ذخیره شد ✓';
    setTimeout(() => {
      if ($('#autosaveInd').textContent === 'ذخیره شد ✓') $('#autosaveInd').textContent = '';
    }, 2000);
  }, 2000);
}
function deleteJournal(id) {
  if (!confirm('این ورودی حذف بشه؟')) return;
  state.journal = state.journal.filter((e) => e.id !== id);
  save('journal');
  if (editingJournalId === id) closeEditor();
  renderJournalList();
  toast('حذف شد');
}

/* ============================================================
   ۱۱) تاپ توصیه‌ها
   ============================================================ */
function renderAdvice() {
  const search = ($('#adviceSearch').value || '').trim().toLowerCase();
  const sort = $('#adviceSort').value;

  let items = [...state.advice];
  if (search) items = items.filter((a) => a.text.toLowerCase().includes(search));

  if (sort === 'pinned') {
    items.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  } else if (sort === 'newest') {
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } else {
    items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  const grid = $('#adviceGrid');
  if (items.length === 0) {
    grid.innerHTML = '<p class="muted">هنوز توصیه‌ای نداری. یه توصیه که به ذهنت رسیده رو ثبت کن 💡</p>';
    return;
  }

  grid.innerHTML = items.map((a) => {
    // رنگ پس‌زمینه تطبیقی با تم (color-mix در JS پشتیبانی نمی‌شه، پس با استایل inline)
    const bgStyle = `background: color-mix(in srgb, ${a.color} 65%, var(--card));`;
    return `
      <div class="advice-card ${a.pinned ? 'pinned' : ''}" style="${bgStyle}" data-id="${a.id}">
        <div class="advice-card-text">${esc(a.text)}</div>
        <div class="advice-card-footer">
          <span class="advice-date">${faDate(new Date(a.createdAt).toISOString().slice(0, 10))}</span>
          <div class="advice-actions">
            <button data-act="pin" title="${a.pinned ? 'برداشتن پین' : 'پین'}">📌</button>
            <button data-act="edit" title="ویرایش">✏️</button>
            <button data-act="del" title="حذف">🗑️</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function openAdviceModal(id) {
  editingAdviceId = id || null;
  const a = id ? state.advice.find((x) => x.id === id) : null;
  $('#adviceModalTitle').textContent = a ? 'ویرایش توصیه' : 'توصیه جدید';
  $('#adviceText').value = a ? a.text : '';
  adviceSelectedColor = a ? a.color : '#fef3c7';
  $$('#adviceColorRow button').forEach((b) =>
    b.classList.toggle('sel', b.dataset.color === adviceSelectedColor));
  $('#adviceModal').classList.add('open');
  setTimeout(() => $('#adviceText').focus(), 100);
}
function closeAdviceModal() {
  $('#adviceModal').classList.remove('open');
  editingAdviceId = null;
}
function saveAdviceFromModal() {
  const text = $('#adviceText').value.trim();
  if (!text) { toast('متن توصیه رو بنویس'); return; }
  if (editingAdviceId) {
    const a = state.advice.find((x) => x.id === editingAdviceId);
    if (a) { a.text = text; a.color = adviceSelectedColor; }
  } else {
    state.advice.push({
      id: uid(), text, color: adviceSelectedColor,
      pinned: false, createdAt: Date.now()
    });
  }
  save('advice');
  closeAdviceModal();
  renderAdvice();
  toast('ذخیره شد ✓');
}
function toggleAdvicePin(id) {
  const a = state.advice.find((x) => x.id === id);
  if (!a) return;
  a.pinned = !a.pinned;
  save('advice');
  renderAdvice();
}
function deleteAdvice(id) {
  if (!confirm('این توصیه حذف بشه؟')) return;
  state.advice = state.advice.filter((a) => a.id !== id);
  save('advice');
  renderAdvice();
  toast('حذف شد');
}

/* ============================================================
   ۱۲) برین‌استورم
   ============================================================ */
function renderBrainstorm() {
  const search = ($('#topicSearch').value || '').trim().toLowerCase();
  let items = [...state.brainstorm].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (search) {
    items = items.filter((t) =>
      (t.title || '').toLowerCase().includes(search) ||
      (t.content || '').toLowerCase().includes(search));
  }

  const grid = $('#topicGrid');
  if (items.length === 0) {
    grid.innerHTML = '<p class="muted">هنوز موضوعی نداری. یه موضوع جدید بساز تا شروع کنیم 🧠</p>';
    return;
  }

  grid.innerHTML = items.map((t) => {
    const bgStyle = `background: color-mix(in srgb, ${t.color} 65%, var(--card));`;
    const preview = (t.content || '').slice(0, 80);
    const upd = t.updatedAt ? faDate(new Date(t.updatedAt).toISOString().slice(0, 10)) : '';
    return `
      <div class="topic-card" style="${bgStyle}" data-id="${t.id}">
        <div class="topic-icon">${t.icon || '🧠'}</div>
        <div class="topic-title">${esc(t.title)}</div>
        ${preview ? `<div class="muted small" style="margin-top:4px">${esc(preview)}${(t.content || '').length > 80 ? '…' : ''}</div>` : ''}
        <div class="topic-meta">آخرین ویرایش: ${upd || '—'}</div>
        <div class="topic-actions">
          <button data-act="edit" title="ویرایش">✏️</button>
          <button data-act="del" title="حذف">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

function openTopicModal(id) {
  editingTopicId = id || null;
  const t = id ? state.brainstorm.find((x) => x.id === id) : null;
  $('#topicModalTitle').textContent = t ? 'ویرایش موضوع' : 'موضوع جدید';
  $('#topicTitle').value = t ? t.title : '';
  $('#topicIcon').value = t ? t.icon : '🧠';
  topicSelectedColor = t ? t.color : '#fef3c7';
  $$('#topicColorRow button').forEach((b) =>
    b.classList.toggle('sel', b.dataset.color === topicSelectedColor));
  $('#topicModal').classList.add('open');
  setTimeout(() => $('#topicTitle').focus(), 100);
}
function closeTopicModal() {
  $('#topicModal').classList.remove('open');
  editingTopicId = null;
}
function saveTopicFromModal() {
  const title = $('#topicTitle').value.trim();
  if (!title) { toast('اسم موضوع رو بنویس'); return; }
  const icon = $('#topicIcon').value.trim() || '🧠';
  const color = topicSelectedColor;
  if (editingTopicId) {
    const t = state.brainstorm.find((x) => x.id === editingTopicId);
    if (t) { t.title = title; t.icon = icon; t.color = color; t.updatedAt = Date.now(); }
  } else {
    state.brainstorm.push({
      id: uid(), title, icon, color, content: '',
      createdAt: Date.now(), updatedAt: Date.now()
    });
  }
  save('brainstorm');
  closeTopicModal();
  renderBrainstorm();
  toast('ذخیره شد ✓');
}
function deleteTopic(id) {
  if (!confirm('این موضوع و محتواش حذف بشه؟')) return;
  state.brainstorm = state.brainstorm.filter((t) => t.id !== id);
  save('brainstorm');
  renderBrainstorm();
  if (currentTopicId === id) closeTopicEditor();
  toast('حذف شد');
}

function openTopicEditor(id) {
  const t = state.brainstorm.find((x) => x.id === id);
  if (!t) return;
  currentTopicId = id;
  $('#brainstormListView').hidden = true;
  $('#brainstormEditorView').hidden = false;
  $('#editorTopicIcon').textContent = t.icon || '🧠';
  $('#editorTopicTitle').textContent = t.title;
  $('#brainstormContent').value = t.content || '';
  updateBrainstormWordCount();
  $('#brainstormSaveInd').textContent = '';
  setTimeout(() => $('#brainstormContent').focus(), 100);
}
function closeTopicEditor() {
  clearTimeout(brainstormTimer);
  $('#brainstormEditorView').hidden = true;
  $('#brainstormListView').hidden = false;
  currentTopicId = null;
  renderBrainstorm();
}
function updateBrainstormWordCount() {
  const txt = $('#brainstormContent').value.trim();
  const count = txt ? txt.split(/\s+/).length : 0;
  $('#brainstormWordCount').textContent = `${count} کلمه`;
}
function saveBrainstormContent(silent = false) {
  if (!currentTopicId) return;
  const t = state.brainstorm.find((x) => x.id === currentTopicId);
  if (!t) return;
  t.content = $('#brainstormContent').value;
  t.updatedAt = Date.now();
  save('brainstorm');
  if (!silent) toast('ذخیره شد ✓');
}
function scheduleBrainstormSave() {
  clearTimeout(brainstormTimer);
  $('#brainstormSaveInd').textContent = 'در حال ذخیره...';
  brainstormTimer = setTimeout(() => {
    saveBrainstormContent(true);
    $('#brainstormSaveInd').textContent = 'ذخیره شد ✓';
    setTimeout(() => {
      if ($('#brainstormSaveInd').textContent === 'ذخیره شد ✓') $('#brainstormSaveInd').textContent = '';
    }, 2000);
  }, 1500);
}
function downloadTopic() {
  if (!currentTopicId) return;
  const t = state.brainstorm.find((x) => x.id === currentTopicId);
  if (!t) return;
  const txt = `# ${t.title}\n\n${t.content || ''}`;
  download(new Blob([txt], { type: 'text/plain;charset=utf-8' }),
           `${(t.title || 'topic').replace(/\s+/g, '-')}.txt`);
  toast('دانلود شد ✓');
}

/* ============================================================
   ۱۳) باشگاه
   ============================================================ */
function gymExercisesTotal(exercises) {
  return (exercises || []).reduce((sum, e) => sum + (Number(e.sets) || 0) * (Number(e.reps) || 0), 0);
}

function gymWeightTotal(exercises) {
  return (exercises || []).reduce((sum, e) => {
    const w = Number(e.weight) || 0;
    const s = Number(e.sets) || 0;
    const r = Number(e.reps) || 0;
    return sum + w * s * r;
  }, 0);
}

function renderGymStats() {
  const weekSessions = state.gym.filter((g) => isInThisWeek(g.date));
  $('#gymWeekSessions').textContent = weekSessions.length;

  if (weekSessions.length) {
    const avg = weekSessions.reduce((s, g) => s + (Number(g.quality) || 0), 0) / weekSessions.length;
    $('#gymAvgQuality').textContent = avg.toFixed(1) + ' ⭐';
  } else {
    $('#gymAvgQuality').textContent = '—';
  }

  const weekWeight = weekSessions.reduce((s, g) => s + gymWeightTotal(g.exercises), 0);
  $('#gymWeekWeight').textContent = Math.round(weekWeight).toLocaleString('fa-IR');
}

function renderGym() {
  renderGymStats();
  const list = $('#gymList');
  if (state.gym.length === 0) {
    list.innerHTML = '<p class="muted">هنوز جلسه‌ای ثبت نکردی. اولین جلسه‌ت رو با دکمه «جلسه جدید» ثبت کن 💪</p>';
    return;
  }
  const sorted = [...state.gym].sort((a, b) => b.date.localeCompare(a.date));
  list.innerHTML = sorted.map((g) => {
    const stars = '⭐'.repeat(Number(g.quality) || 0);
    const exRows = (g.exercises || []).map((ex) => `
      <div class="gym-exercise">
        <div class="gym-ex-name">${esc(ex.name)}</div>
        <div class="gym-ex-meta">
          ${esc(ex.muscle)} • ${ex.sets || 0}×${ex.reps || 0}
          ${ex.weight ? ' • ' + ex.weight + 'kg' : ''}
          ${ex.note ? ' • ' + esc(ex.note) : ''}
        </div>
      </div>`).join('');
    return `
      <div class="gym-item" data-id="${g.id}">
        <div class="gym-head" data-act="toggle">
          <div class="gym-head-main">
            <div class="gym-title">${esc(g.name || 'جلسه')}</div>
            <div class="gym-sub">${faDate(g.date)} • ${g.duration || 0} دقیقه</div>
          </div>
          <div class="gym-badges">
            ${stars ? `<span class="gym-badge">${stars}</span>` : ''}
            <span class="gym-badge">${MOOD_EMOJI(g.energy)}</span>
          </div>
          <span class="gym-arrow">▾</span>
        </div>
        <div class="gym-body">
          ${exRows || '<p class="muted small">حرکتی ثبت نشده.</p>'}
          ${g.note ? `<div class="gym-note">${esc(g.note)}</div>` : ''}
          <div class="gym-item-actions">
            <button data-act="edit">✏️ ویرایش</button>
            <button data-act="del">🗑️ حذف</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function createGymExerciseRow(ex = {}) {
  const row = document.createElement('div');
  row.className = 'exercise-row';
  row.innerHTML = `
    <input class="ex-name" placeholder="نام حرکت" value="${esc(ex.name || '')}" />
    <select class="ex-muscle">
      ${MUSCLES.map((m) => `<option value="${m}" ${ex.muscle === m ? 'selected' : ''}>${m}</option>`).join('')}
    </select>
    <input class="ex-sets" type="number" min="1" placeholder="ست" value="${ex.sets ?? ''}" />
    <input class="ex-reps" type="number" min="1" placeholder="تکرار" value="${ex.reps ?? ''}" />
    <input class="ex-weight" type="number" min="0" placeholder="وزن" value="${ex.weight ?? ''}" />
    <button class="ex-del" type="button" title="حذف">✕</button>
  `;
  row.querySelector('.ex-del').addEventListener('click', () => row.remove());
  return row;
}

function setStars(value) {
  $('#gymQualityValue').value = value;
  $$('#gymQuality button').forEach((b) =>
    b.classList.toggle('active', Number(b.dataset.v) <= value));
}
function setEnergy(value) {
  $('#gymEnergyValue').value = value;
  $$('#gymEnergy button').forEach((b) =>
    b.classList.toggle('sel', Number(b.dataset.mood) === value));
}

function openGymModal(id) {
  editingGymId = id || null;
  const g = id ? state.gym.find((x) => x.id === id) : null;
  $('#gymModalTitle').textContent = g ? 'ویرایش جلسه' : 'جلسه جدید';
  $('#gymName').value = g ? g.name : '';
  $('#gymDate').value = g ? g.date : todayISO();
  $('#gymDuration').value = g ? g.duration : 60;
  setStars(g ? (Number(g.quality) || 3) : 3);
  setEnergy(g ? (Number(g.energy) || 3) : 3);
  $('#gymNote').value = g ? (g.note || '') : '';

  const container = $('#gymExercises');
  container.innerHTML = '';
  if (g && g.exercises && g.exercises.length) {
    g.exercises.forEach((ex) => container.appendChild(createGymExerciseRow(ex)));
  } else {
    container.appendChild(createGymExerciseRow());
  }

  $('#gymModal').classList.add('open');
}
function closeGymModal() {
  $('#gymModal').classList.remove('open');
  editingGymId = null;
}
function saveGymFromModal() {
  const name = $('#gymName').value.trim();
  if (!name) { toast('اسم جلسه رو بنویس'); return; }
  const date = $('#gymDate').value || todayISO();
  const duration = Number($('#gymDuration').value) || 0;
  const quality = Number($('#gymQualityValue').value) || 3;
  const energy = Number($('#gymEnergyValue').value) || 3;
  const note = $('#gymNote').value.trim();

  const exercises = [];
  $$('#gymExercises .exercise-row').forEach((row) => {
    const exName = row.querySelector('.ex-name').value.trim();
    if (!exName) return;
    exercises.push({
      name: exName,
      muscle: row.querySelector('.ex-muscle').value,
      sets: Number(row.querySelector('.ex-sets').value) || 0,
      reps: Number(row.querySelector('.ex-reps').value) || 0,
      weight: Number(row.querySelector('.ex-weight').value) || 0,
      note: ''
    });
  });

  if (editingGymId) {
    const g = state.gym.find((x) => x.id === editingGymId);
    if (g) Object.assign(g, { name, date, duration, quality, energy, note, exercises });
  } else {
    state.gym.push({ id: uid(), name, date, duration, quality, energy, note, exercises, createdAt: Date.now() });
  }

  save('gym');
  closeGymModal();
  renderGym();
  toast('ذخیره شد ✓');
}
function deleteGym(id) {
  if (!confirm('این جلسه حذف بشه؟')) return;
  state.gym = state.gym.filter((g) => g.id !== id);
  save('gym');
  renderGym();
  toast('حذف شد');
}

/* ============================================================
   ۱۴) برنامه ورزشی
   ============================================================ */
function renderPlan() {
  // تب فعال رو نگه دار
  const activeTab = $('.plan-tab.active')?.dataset.tab || 'plan';

  // جلسات در هفته
  $$('#sessionsPerWeek button').forEach((b) =>
    b.classList.toggle('sel', Number(b.dataset.n) === Number(state.plan.sessionsPerWeek)));

  // روزها
  const daysWrap = $('#planDays');
  daysWrap.innerHTML = PERSIAN_DAYS.map((dayName, i) => {
    const d = state.plan.days[i] || { rest: true, exercises: [] };
    const exHtml = (d.exercises || []).map((ex, idx) => `
      <div class="plan-exercise-item">
        <div class="plan-ex-info">
          <div class="plan-ex-name">${esc(ex.name)}</div>
          <div class="plan-ex-meta">${esc(ex.muscle)} • ${ex.sets}×${ex.reps}</div>
        </div>
        <div class="plan-ex-actions">
          <button data-act="edit-ex" data-day="${i}" data-idx="${idx}">✏️</button>
          <button data-act="del-ex" data-day="${i}" data-idx="${idx}">🗑️</button>
        </div>
      </div>`).join('');

    return `
      <div class="plan-day-card ${d.rest ? 'rest' : ''}">
        <div class="plan-day-head">
          <span class="plan-day-name">${dayName}</span>
          <label class="rest-toggle">
            <input type="checkbox" data-act="toggle-rest" data-day="${i}" ${d.rest ? 'checked' : ''} />
            روز استراحت
          </label>
        </div>
        <div class="plan-day-body">
          ${d.rest
            ? '<div class="plan-rest-msg">😴 روز استراحت</div>'
            : (exHtml + `<button class="btn small" data-act="add-ex" data-day="${i}">➕ افزودن حرکت</button>`)}
        </div>
      </div>`;
  }).join('');

  // رندر تب
  if (activeTab === 'review') renderReview();
}

function setSessionsPerWeek(n) {
  state.plan.sessionsPerWeek = n;
  save('plan');
  renderPlan();
}

function togglePlanDayRest(dayIdx) {
  const d = state.plan.days[dayIdx];
  d.rest = !d.rest;
  save('plan');
  renderPlan();
}

function openPlanExerciseModal(dayIdx, idx) {
  currentPlanDay = dayIdx;
  currentPlanExIdx = (typeof idx === 'number') ? idx : null;
  const ex = (currentPlanExIdx !== null)
    ? state.plan.days[dayIdx].exercises[currentPlanExIdx]
    : null;

  $('#peName').value = ex ? ex.name : '';
  $('#peMuscle').value = ex ? ex.muscle : 'سینه';
  $('#peSets').value = ex ? ex.sets : 3;
  $('#peReps').value = ex ? ex.reps : 10;

  $('#planExerciseModal').classList.add('open');
  setTimeout(() => $('#peName').focus(), 100);
}
function closePlanExerciseModal() {
  $('#planExerciseModal').classList.remove('open');
  currentPlanDay = null;
  currentPlanExIdx = null;
}
function savePlanExercise() {
  const name = $('#peName').value.trim();
  if (!name) { toast('نام حرکت رو بنویس'); return; }
  const muscle = $('#peMuscle').value;
  const sets = Number($('#peSets').value) || 0;
  const reps = Number($('#peReps').value) || 0;

  const d = state.plan.days[currentPlanDay];
  if (currentPlanExIdx !== null && currentPlanExIdx >= 0) {
    d.exercises[currentPlanExIdx] = { name, muscle, sets, reps };
  } else {
    d.exercises.push({ name, muscle, sets, reps });
  }
  d.rest = false;
  save('plan');
  closePlanExerciseModal();
  renderPlan();
  toast('ذخیره شد ✓');
}
function deletePlanExercise(dayIdx, idx) {
  if (!confirm('این حرکت از برنامه حذف بشه؟')) return;
  state.plan.days[dayIdx].exercises.splice(idx, 1);
  save('plan');
  renderPlan();
}

/* بررسی عملکرد */
function renderReview() {
  const wrap = $('#reviewContent');
  if (state.gym.length === 0) {
    wrap.innerHTML = `
      <div class="card">
        <p class="muted">اول چند جلسه توی بخش <b>باشگاه</b> ثبت کن تا بتونم عملکردت رو بررسی کنم 💪</p>
        <button class="btn primary" onclick="document.querySelector('[data-page=gym]').click()">برو به باشگاه</button>
      </div>`;
    return;
  }

  // ── کوتاه‌مدت (این هفته) ──
  const weekSessions = state.gym.filter((g) => isInThisWeek(g.date));
  const goal = Number(state.plan.sessionsPerWeek) || 0;
  const done = weekSessions.length;
  const pct = goal ? Math.min(100, Math.round((done / goal) * 100)) : 0;

  const totalSets = weekSessions.reduce((s, g) =>
    s + (g.exercises || []).reduce((ss, e) => ss + (Number(e.sets) || 0), 0), 0);
  const totalReps = weekSessions.reduce((s, g) =>
    s + (g.exercises || []).reduce((ss, e) => ss + (Number(e.reps) || 0), 0), 0);
  const totalWeight = weekSessions.reduce((s, g) => s + gymWeightTotal(g.exercises), 0);

  const musclesThisWeek = {};
  weekSessions.forEach((g) => {
    (g.exercises || []).forEach((e) => {
      if (!e.muscle) return;
      musclesThisWeek[e.muscle] = (musclesThisWeek[e.muscle] || 0) + (Number(e.sets) || 1);
    });
  });
  const muscleTags = Object.entries(musclesThisWeek)
    .sort((a, b) => b[1] - a[1])
    .map(([m, c]) => `<span class="tag">${esc(m)} × ${c}</span>`)
    .join('') || '<span class="muted small">هیچ عضله‌ای ثبت نشده</span>';

  // پیام خودکار کوتاه‌مدت
  let shortMsg = '';
  if (done === 0) {
    shortMsg = 'این هفته هنوز جلسه‌ای ثبت نکردی. یه شروع کوچیک بکن، مهم‌ترین قدم همینه! 💪';
  } else if (goal && done < goal) {
    shortMsg = `این هفته ${done} از ${goal} جلسه رو رفتی. یه کم مونده به هدفت، ادامه بده!`;
  } else if (goal && done === goal) {
    shortMsg = `این هفته دقیقاً به هدفت رسیدی (${done} از ${goal} جلسه). عالی بود! 🎯`;
  } else if (goal && done > goal) {
    shortMsg = `این هفته ${done} جلسه رفتی، ${done - goal} جلسه بیشتر از هدفت! فوق‌العاده‌ست 🚀`;
  } else {
    shortMsg = `این هفته ${done} جلسه رفتی.`;
  }

  // ── بلندمدت ──
  const totalSessions = state.gym.length;
  const avgQuality = (state.gym.reduce((s, g) => s + (Number(g.quality) || 0), 0) / totalSessions).toFixed(1);
  const avgEnergy = (state.gym.reduce((s, g) => s + (Number(g.energy) || 0), 0) / totalSessions).toFixed(1);

  // PR هر عضله
  const pr = {};
  state.gym.forEach((g) => {
    (g.exercises || []).forEach((e) => {
      if (!e.muscle || !e.weight) return;
      const w = Number(e.weight) || 0;
      if (!pr[e.muscle] || w > pr[e.muscle].weight) {
        pr[e.muscle] = { weight: w, name: e.name };
      }
    });
  });
  const prHtml = Object.keys(pr).length
    ? Object.entries(pr).map(([m, v]) => `
        <div class="pr-item">
          <div class="pr-muscle">${esc(m)}</div>
          <div class="pr-weight">${v.weight} kg</div>
          <div class="pr-name">${esc(v.name)}</div>
        </div>`).join('')
    : '<p class="muted small">هنوز وزنه‌ای ثبت نشده.</p>';

  // نمودار ۸ هفته اخیر
  const weeklyCounts = [];
  for (let i = 7; i >= 0; i--) {
    const ws = startOfWeek();
    ws.setDate(ws.getDate() - i * 7);
    const we = new Date(ws);
    we.setDate(we.getDate() + 6);
    we.setHours(23, 59, 59, 999);
    const count = state.gym.filter((g) => {
      const d = fromISO(g.date);
      return d >= ws && d <= we;
    }).length;
    weeklyCounts.push({ label: `${i === 0 ? 'این هفته' : i + ' هفته پیش'}`, count });
  }
  const maxCount = Math.max(...weeklyCounts.map((w) => w.count), 1);
  const chartHtml = weeklyCounts.map((w) => `
    <div class="bar-col">
      <div class="bar-wrap"><div class="bar" style="height:${(w.count / maxCount) * 100}%"></div></div>
      <div class="bar-val">${w.count}</div>
      <div class="bar-label">${w.label}</div>
    </div>`).join('');

  // تحلیل کلی
  const firstFour = weeklyCounts.slice(0, 4).reduce((s, w) => s + w.count, 0);
  const lastFour  = weeklyCounts.slice(4).reduce((s, w) => s + w.count, 0);
  let trend = 'ثابت';
  if (lastFour > firstFour) trend = 'صعودی 📈';
  else if (lastFour < firstFour) trend = 'نزولی 📉';

  const analysisText = `مجموعاً ${totalSessions} جلسه ثبت کردی، میانگین کیفیتت ${avgQuality} از ۵ و میانگین انرژی ${avgEnergy} از ۵ بوده. روند ۴ هفته اخیرت ${trend}.`;

  wrap.innerHTML = `
    <div class="card">
      <div class="card-head"><h3>عملکرد این هفته</h3></div>
      <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
      <div class="muted small">${done} از ${goal} جلسه (${pct}%)</div>

      <div class="review-stats" style="margin-top:16px">
        <div class="review-stat"><div class="review-stat-val">${totalSets}</div><div class="review-stat-lbl">مجموع ست</div></div>
        <div class="review-stat"><div class="review-stat-val">${totalReps}</div><div class="review-stat-lbl">مجموع تکرار</div></div>
        <div class="review-stat"><div class="review-stat-val">${Math.round(totalWeight).toLocaleString('fa-IR')}</div><div class="review-stat-lbl">مجموع وزنه (kg)</div></div>
      </div>

      <div style="margin-top:8px">
        <div class="muted small" style="margin-bottom:6px">عضلاتی که این هفته کار کردی:</div>
        <div class="ji-tags">${muscleTags}</div>
      </div>

      <div class="review-msg">${shortMsg}</div>
    </div>

    <div class="card">
      <div class="card-head"><h3>عملکرد بلندمدت</h3></div>
      <div class="review-stats">
        <div class="review-stat"><div class="review-stat-val">${totalSessions}</div><div class="review-stat-lbl">کل جلسات</div></div>
        <div class="review-stat"><div class="review-stat-val">${avgQuality}</div><div class="review-stat-lbl">میانگین کیفیت</div></div>
        <div class="review-stat"><div class="review-stat-val">${avgEnergy}</div><div class="review-stat-lbl">میانگین انرژی</div></div>
      </div>

      <div style="margin-top:16px">
        <div class="muted small" style="margin-bottom:6px">🏆 رکورد شخصی هر عضله:</div>
        <div class="pr-grid">${prHtml}</div>
      </div>

      <div style="margin-top:18px">
        <div class="muted small" style="margin-bottom:6px">📊 تعداد جلسات در ۸ هفته اخیر:</div>
        <div class="bar-chart">${chartHtml}</div>
      </div>

      <div class="analysis-card" style="margin-top:16px">
        <p>${analysisText}</p>
      </div>
    </div>`;
}

function switchPlanTab(tab) {
  $$('.plan-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.plan-tab-content').forEach((c) => c.classList.remove('active'));
  if (tab === 'plan') { $('#planTab').classList.add('active'); renderPlan(); }
  else { $('#reviewTab').classList.add('active'); renderReview(); }
}

/* ============================================================
   ۱۵) آمار
   ============================================================ */
function overallStats() {
  const dates = Object.keys(state.logs).sort();
  if (dates.length === 0) return { activeDays: 0, success: 0, bestStreak: 0 };
  const activeDays = dates.filter((d) => Object.values(state.logs[d]).some(Boolean)).length;
  const start = fromISO(dates[0]);
  const end = new Date();
  let sched = 0, done = 0;
  const d = new Date(start);
  while (d <= end) {
    const iso = toISO(d);
    state.habits.forEach((h) => {
      if (isScheduled(h, iso)) { sched++; if (isChecked(h.id, iso)) done++; }
    });
    d.setDate(d.getDate() + 1);
  }
  const success = sched ? Math.round((done / sched) * 100) : 0;
  const bestStreak = state.habits.length
    ? Math.max(...state.habits.map((h) => bestStreakOf(h))) : 0;
  return { activeDays, success, bestStreak };
}

function renderBarChart() {
  const wrap = $('#barChart');
  wrap.innerHTML = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = toISO(d);
    const pct = dayCompletion(iso);
    const col = document.createElement('div');
    col.className = 'bar-col';
    col.innerHTML = `
      <div class="bar-wrap"><div class="bar" style="height:${Math.max(pct, 2)}%"></div></div>
      <div class="bar-label">${WEEKDAY_SHORT[persianDayIndex(iso)]}</div>
      <div class="bar-val">${pct}%</div>`;
    wrap.appendChild(col);
  }
}

function renderMoodChart() {
  const wrap = $('#moodChart');
  wrap.innerHTML = '';
  const entries = [...state.journal].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  if (entries.length < 2) {
    wrap.innerHTML = '<p class="muted small">حداقل دو ورودی ژورنال برای نمایش نمودار لازمه.</p>';
    return;
  }
  const W = 600, H = 160, pad = 26;
  const xs = entries.map((_, i) => pad + i * ((W - 2 * pad) / (entries.length - 1)));
  const ys = entries.map((e) => H - pad - ((e.mood - 1) / 4) * (H - 2 * pad));
  const pts = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
  const circles = xs.map((x, i) =>
    `<circle cx="${x}" cy="${ys[i]}" r="4.5" fill="var(--primary)">
       <title>${faDate(entries[i].date)} — ${MOOD_EMOJI(entries[i].mood)}</title>
     </circle>`).join('');
  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="mood-svg">
      <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="var(--border)" />
      <polyline points="${pts}" fill="none" stroke="var(--primary)"
                stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
      ${circles}
    </svg>`;
}

function renderHeatmap() {
  const wrap = $('#heatmap');
  wrap.innerHTML = '';
  for (let i = 90; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = toISO(d);
    const pct = dayCompletion(iso);
    let lvl = 0;
    if (pct > 0)    lvl = 1;
    if (pct >= 35)  lvl = 2;
    if (pct >= 65)  lvl = 3;
    if (pct >= 100) lvl = 4;
    const el = document.createElement('div');
    el.className = 'hm-cell lvl-' + lvl;
    el.title = `${faDate(iso)} — ${pct}%`;
    wrap.appendChild(el);
  }
}

function renderStats() {
  const st = overallStats();
  $('#stActiveDays').textContent = st.activeDays;
  $('#stSuccess').textContent = st.success + '%';
  $('#stBestStreak').textContent = st.bestStreak;
  renderBarChart();
  renderMoodChart();
  renderHeatmap();
  const wk = weekKey();
  $('#weeklyNote').value = state.weekly[wk] || '';
  $('#weeklySaved').textContent = '';
}

/* ============================================================
   ۱۶) ناوبری
   ============================================================ */
function showPage(page) {
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + page));

  if (page === 'dashboard')  renderDashboard();
  if (page === 'tasks')      renderTasks();
  if (page === 'journal')    renderJournalList();
  if (page === 'advice')     renderAdvice();
  if (page === 'brainstorm') {
    $('#brainstormListView').hidden = false;
    $('#brainstormEditorView').hidden = true;
    currentTopicId = null;
    renderBrainstorm();
  }
  if (page === 'gym')        renderGym();
  if (page === 'plan')       renderPlan();
  if (page === 'stats')      renderStats();
  if (page === 'settings')   renderSettings();
}

/* ============================================================
   ۱۷) خروجی / ورودی داده
   ============================================================ */
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportAll() {
  const data = {
    habits: state.habits, logs: state.logs, journal: state.journal,
    settings: state.settings, weekly: state.weekly,
    advice: state.advice, brainstorm: state.brainstorm,
    gym: state.gym, plan: state.plan,
    exportedAt: new Date().toISOString()
  };
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
           `mypath-backup-${todayISO()}.json`);
  toast('خروجی گرفته شد ✓');
}

function exportJournal() {
  if (state.journal.length === 0) { toast('ژورنال خالیه'); return; }
  const sorted = [...state.journal].sort((a, b) => a.date.localeCompare(b.date));
  const txt = sorted.map((e) => {
    const parts = [`# ${e.title || 'بدون عنوان'}`, `📅 ${faDate(e.date)} ${MOOD_EMOJI(e.mood)}`];
    if (e.tags && e.tags.length) parts.push(`🏷️ ${e.tags.map((t) => '#' + t).join(' ')}`);
    if (e.good)     parts.push(`\n✅ چه کار خوبی کردم:\n${e.good}`);
    if (e.learned)  parts.push(`\n📚 چه چیزی یاد گرفتم:\n${e.learned}`);
    if (e.feeling)  parts.push(`\n💭 چه احساسی دارم:\n${e.feeling}`);
    if (e.tomorrow) parts.push(`\n🎯 برنامه فردا:\n${e.tomorrow}`);
    return parts.join('\n') + '\n\n' + '─'.repeat(40) + '\n';
  }).join('\n');
  download(new Blob([txt], { type: 'text/plain;charset=utf-8' }),
           `mypath-journal-${todayISO()}.txt`);
  toast('ژورنال دانلود شد ✓');
}

function importAll(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!confirm('داده‌های فعلی با فایل جایگزین بشن؟')) return;
      if (data.habits)     state.habits     = data.habits;
      if (data.logs)       state.logs       = data.logs;
      if (data.journal)    state.journal    = data.journal;
      if (data.weekly)     state.weekly     = data.weekly;
      if (data.settings)   Object.assign(state.settings, data.settings);
      if (data.advice)     state.advice     = data.advice;
      if (data.brainstorm) state.brainstorm = data.brainstorm;
      if (data.gym)        state.gym        = data.gym;
      if (data.plan)       state.plan       = data.plan;
      ensurePlanDefaults();
      ['habits','logs','journal','weekly','settings','advice','brainstorm','gym','plan'].forEach(save);
      applySettings();
      renderTopbar();
      showPage('dashboard');
      toast('داده‌ها وارد شدند ✓');
    } catch { toast('فایل معتبر نیست ✗'); }
  };
  reader.readAsText(file);
}

function clearAll() {
  if (!confirm('همه داده‌ها (عادت‌ها، تیک‌ها، ژورنال، توصیه‌ها، برین‌استورم، باشگاه، برنامه) پاک بشن؟')) return;
  if (!confirm('مطمئنی؟ این کار برگشت‌پذیر نیست!')) return;
  Object.values(STORAGE).forEach((k) => localStorage.removeItem(k));
  state = {
    habits: defaultHabits(), logs: {}, journal: [],
    settings: { name: '', palette: 'green', theme: 'light', reminder: '08:00' },
    weekly: {}, advice: [], brainstorm: [], gym: [],
    plan: { sessionsPerWeek: 3, days: {} }
  };
  ensurePlanDefaults();
  ['habits','logs','journal','weekly','settings','advice','brainstorm','gym','plan'].forEach(save);
  applySettings();
  renderTopbar();
  showPage('dashboard');
  toast('همه داده‌ها پاک شد');
}

/* ============================================================
   ۱۸) مودال عادت
   ============================================================ */
function openHabitModal(id) {
  editingHabitId = id || null;
  const hb = id ? state.habits.find((h) => h.id === id) : null;
  $('#habitModalTitle').textContent = hb ? 'ویرایش عادت' : 'عادت جدید';
  $('#hTitle').value = hb ? hb.title : '';
  $('#hIcon').value  = hb ? hb.icon  : '⭐';
  $('#hColor').value = hb ? hb.color : '#10b981';
  const days = hb ? (hb.days || []) : [];
  $$('#habitDays button').forEach((b) =>
    b.classList.toggle('sel', days.includes(Number(b.dataset.day))));
  $('#habitModal').classList.add('open');
  setTimeout(() => $('#hTitle').focus(), 100);
}
function closeHabitModal() {
  $('#habitModal').classList.remove('open');
  editingHabitId = null;
}
function saveHabitFromModal() {
  const title = $('#hTitle').value.trim();
  if (!title) { toast('عنوان عادت رو بنویس'); $('#hTitle').focus(); return; }
  const icon  = $('#hIcon').value.trim() || '⭐';
  const color = $('#hColor').value;
  const days  = $$('#habitDays button.sel').map((b) => Number(b.dataset.day));
  if (editingHabitId) {
    const hb = state.habits.find((h) => h.id === editingHabitId);
    if (hb) Object.assign(hb, { title, icon, color, days });
  } else {
    state.habits.push({ id: uid(), title, icon, color, days, order: state.habits.length });
  }
  save('habits');
  closeHabitModal();
  renderTasks();
  renderDashboard();
  toast('ذخیره شد ✓');
}

/* ============================================================
   ۱۹) بایند کردن رویدادها
   ============================================================ */
function bindEvents() {
  /* --- ناوبری --- */
  $$('.nav-item').forEach((btn) =>
    btn.addEventListener('click', () => showPage(btn.dataset.page)));

  /* --- تم --- */
  $('#themeToggle').addEventListener('click', () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    save('settings');
    applySettings();
  });

  /* --- داشبورد --- */
  $('#startDayBtn').addEventListener('click', () => showPage('tasks'));

  /* --- عادت‌ها --- */
  $('#addHabitBtn').addEventListener('click', () => openHabitModal());
  $('#habitCancelBtn').addEventListener('click', closeHabitModal);
  $('#habitSaveBtn').addEventListener('click', saveHabitFromModal);
  $('#habitModal').addEventListener('click', (e) => {
    if (e.target.id === 'habitModal') closeHabitModal();
  });
  $('#emojiRow').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') $('#hIcon').value = e.target.textContent;
  });
  $('#habitDays').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') e.target.classList.toggle('sel');
  });
  $('#habitList').addEventListener('click', (e) => {
    const row = e.target.closest('.habit-row');
    if (!row) return;
    const id = row.dataset.id;
    const act = e.target.closest('button')?.dataset.act;
    if (!act) return;
    if (act === 'toggle') { toggleHabit(id, todayISO()); renderTasks(); renderDashboard(); }
    else if (act === 'up')   moveHabit(id, -1);
    else if (act === 'down') moveHabit(id, 1);
    else if (act === 'edit') openHabitModal(id);
    else if (act === 'del')  deleteHabit(id);
  });

  /* --- ژورنال --- */
  $('#newJournalBtn').addEventListener('click', () => openEditor(null));
  $('#cancelJournalBtn').addEventListener('click', closeEditor);
  $('#saveJournalBtn').addEventListener('click', () => saveEditor(true));
  $('#moodPicker').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setMood(Number(b.dataset.mood));
  });
  $('#jDate').addEventListener('change', updateDateHint);
  ['#jTitle', '#jDate', '#jTags', '#jGood', '#jLearned', '#jFeeling', '#jTomorrow']
    .forEach((sel) => $(sel).addEventListener('input', scheduleAutosave));
  $('#jSearch').addEventListener('input', renderJournalList);
  $('#jMoodFilter').addEventListener('change', renderJournalList);
  $('#jTagFilter').addEventListener('change', renderJournalList);
  $('#exportJournalBtn').addEventListener('click', exportJournal);
  $('#journalList').addEventListener('click', (e) => {
    const item = e.target.closest('.journal-item');
    if (!item) return;
    const id = item.dataset.id;
    const act = e.target.closest('button')?.dataset.act;
    if (act === 'edit') {
      const entry = state.journal.find((x) => x.id === id);
      if (entry) openEditor(entry);
    } else if (act === 'del') deleteJournal(id);
  });

  /* --- تاپ توصیه‌ها --- */
  $('#addAdviceBtn').addEventListener('click', () => openAdviceModal());
  $('#adviceCancelBtn').addEventListener('click', closeAdviceModal);
  $('#adviceSaveBtn').addEventListener('click', saveAdviceFromModal);
  $('#adviceModal').addEventListener('click', (e) => {
    if (e.target.id === 'adviceModal') closeAdviceModal();
  });
  $('#adviceColorRow').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    adviceSelectedColor = b.dataset.color;
    $$('#adviceColorRow button').forEach((x) =>
      x.classList.toggle('sel', x.dataset.color === adviceSelectedColor));
  });
  $('#adviceSearch').addEventListener('input', renderAdvice);
  $('#adviceSort').addEventListener('change', renderAdvice);
  $('#adviceGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.advice-card');
    if (!card) return;
    const id = card.dataset.id;
    const act = e.target.closest('button')?.dataset.act;
    if (act === 'pin')       toggleAdvicePin(id);
    else if (act === 'edit') openAdviceModal(id);
    else if (act === 'del')  deleteAdvice(id);
  });

  /* --- برین‌استورم --- */
  $('#addTopicBtn').addEventListener('click', () => openTopicModal());
  $('#topicCancelBtn').addEventListener('click', closeTopicModal);
  $('#topicSaveBtn').addEventListener('click', saveTopicFromModal);
  $('#topicModal').addEventListener('click', (e) => {
    if (e.target.id === 'topicModal') closeTopicModal();
  });
  $('#topicEmojiRow').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') $('#topicIcon').value = e.target.textContent;
  });
  $('#topicColorRow').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    topicSelectedColor = b.dataset.color;
    $$('#topicColorRow button').forEach((x) =>
      x.classList.toggle('sel', x.dataset.color === topicSelectedColor));
  });
  $('#topicSearch').addEventListener('input', renderBrainstorm);
  $('#topicGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.topic-card');
    if (!card) return;
    const id = card.dataset.id;
    const act = e.target.closest('button')?.dataset.act;
    if (act === 'edit')       openTopicModal(id);
    else if (act === 'del')   deleteTopic(id);
    else if (!act)            openTopicEditor(id); // کلیک روی کارت
  });
  $('#backToTopicsBtn').addEventListener('click', closeTopicEditor);
  $('#brainstormContent').addEventListener('input', () => {
    updateBrainstormWordCount();
    scheduleBrainstormSave();
  });
  $('#saveBrainstormBtn').addEventListener('click', () => saveBrainstormContent(false));
  $('#downloadTopicBtn').addEventListener('click', downloadTopic);

  /* --- باشگاه --- */
  $('#addGymBtn').addEventListener('click', () => openGymModal());
  $('#gymCancelBtn').addEventListener('click', closeGymModal);
  $('#gymSaveBtn').addEventListener('click', saveGymFromModal);
  $('#gymModal').addEventListener('click', (e) => {
    if (e.target.id === 'gymModal') closeGymModal();
  });
  $('#gymQuality').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setStars(Number(b.dataset.v));
  });
  $('#gymEnergy').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setEnergy(Number(b.dataset.mood));
  });
  $('#addGymExerciseBtn').addEventListener('click', () => {
    $('#gymExercises').appendChild(createGymExerciseRow());
  });
  $('#gymList').addEventListener('click', (e) => {
    const item = e.target.closest('.gym-item');
    if (!item) return;
    const id = item.dataset.id;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'toggle') item.classList.toggle('open');
    else if (act === 'edit') openGymModal(id);
    else if (act === 'del')  deleteGym(id);
  });

  /* --- برنامه ورزشی --- */
  $$('.plan-tab').forEach((b) =>
    b.addEventListener('click', () => switchPlanTab(b.dataset.tab)));
  $('#sessionsPerWeek').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setSessionsPerWeek(Number(b.dataset.n));
  });
  $('#planDays').addEventListener('click', (e) => {
    const target = e.target.closest('[data-act]');
    if (!target) return;
    const act = target.dataset.act;
    const day = Number(target.dataset.day);
    if (act === 'toggle-rest') togglePlanDayRest(day);
    else if (act === 'add-ex')  openPlanExerciseModal(day);
    else if (act === 'edit-ex') openPlanExerciseModal(day, Number(target.dataset.idx));
    else if (act === 'del-ex')  deletePlanExercise(day, Number(target.dataset.idx));
  });
  $('#peCancelBtn').addEventListener('click', closePlanExerciseModal);
  $('#peSaveBtn').addEventListener('click', savePlanExercise);
  $('#planExerciseModal').addEventListener('click', (e) => {
    if (e.target.id === 'planExerciseModal') closePlanExerciseModal();
  });

  /* --- آمار: یادداشت هفتگی --- */
  $('#weeklyNote').addEventListener('input', () => {
    clearTimeout(weeklyTimer);
    $('#weeklySaved').textContent = '...';
    weeklyTimer = setTimeout(() => {
      const wk = weekKey();
      const v = $('#weeklyNote').value.trim();
      if (v) state.weekly[wk] = v;
      else delete state.weekly[wk];
      save('weekly');
      $('#weeklySaved').textContent = 'ذخیره شد ✓';
      setTimeout(() => { $('#weeklySaved').textContent = ''; }, 2000);
    }, 800);
  });

  /* --- تنظیمات --- */
  $('#setName').addEventListener('input', (e) => {
    state.settings.name = e.target.value.trim();
    save('settings');
    applySettings();
  });
  $('#setReminder').addEventListener('change', (e) => {
    state.settings.reminder = e.target.value;
    save('settings');
  });
  $('#paletteRow').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-palette]');
    if (!btn) return;
    state.settings.palette = btn.dataset.palette;
    save('settings');
    applySettings();
    renderSettings();
  });
  $('#exportAllBtn').addEventListener('click', exportAll);
  $('#importFile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) importAll(f);
    e.target.value = '';
  });
  $('#clearAllBtn').addEventListener('click', clearAll);

  /* --- کلید Escape --- */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('#habitModal').classList.contains('open')) closeHabitModal();
      if ($('#adviceModal').classList.contains('open')) closeAdviceModal();
      if ($('#topicModal').classList.contains('open')) closeTopicModal();
      if ($('#gymModal').classList.contains('open')) closeGymModal();
      if ($('#planExerciseModal').classList.contains('open')) closePlanExerciseModal();
      if (!$('#journalEditor').hidden) closeEditor();
    }
  });
}

/* ============================================================
   ۲۰) اجرا
   ============================================================ */
function init() {
  load();
  applySettings();
  renderTopbar();
  bindEvents();
  showPage('dashboard');
}

document.addEventListener('DOMContentLoaded', init);