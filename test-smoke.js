/* ============================================================
   تست دودی (smoke test) برای app.js
   ------------------------------------------------------------
   app.js واقعی را در یک sandbox اجرا می‌کند، با:
     • یک DOM تقلبی (همه‌ی سلکتورها یک المان کش‌شده برمی‌گردانند)
     • یک کلاینت Supabase تقلبی که در حافظه ذخیره می‌کند و
       RLS را هم شبیه‌سازی می‌کند (فقط ردیف‌های user_id فعلی)
   هدف: مطمئن شویم load/save/migrate بدون خطا کار می‌کنند و
   ستون‌ها و onConflict درست‌اند.
   ============================================================ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let failures = 0;
const ok = (cond, msg) => {
  if (cond) { console.log('  ✓ ' + msg); }
  else { failures++; console.log('  ✗ ' + msg); }
};
const section = (t) => console.log('\n— ' + t);

/* ---------------- DOM تقلبی ---------------- */
function makeClassList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    toggle: (c, force) => {
      const on = force === undefined ? !set.has(c) : force;
      if (on) set.add(c); else set.delete(c);
      return on;
    },
    contains: (c) => set.has(c)
  };
}
function makeEl() {
  return {
    tagName: 'DIV',
    textContent: '', innerHTML: '', value: '', hidden: false,
    className: '', title: '', disabled: false,
    dataset: {}, style: {},
    classList: makeClassList(),
    addEventListener() {}, appendChild() {}, remove() {}, focus() {},
    scrollIntoView() {}, closest() { return null; },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; }
  };
}

const elCache = new Map();
const doc = {
  documentElement: { dataset: {} },
  body: { appendChild() {} },
  activeElement: null,
  querySelector(sel) {
    if (!elCache.has(sel)) elCache.set(sel, makeEl());
    return elCache.get(sel);
  },
  querySelectorAll() { return []; },
  createElement() { return makeEl(); },
  addEventListener() {}
};

/* ---------------- localStorage / navigator ---------------- */
const ls = new Map();
const localStorage = {
  getItem: (k) => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: (k) => ls.delete(k),
  clear: () => ls.clear()
};
const navigator = { onLine: true };

/* ---------------- Supabase تقلبی ---------------- */
const tables = ['habits', 'logs', 'journal_entries', 'advice',
  'brainstorm_topics', 'gym_sessions', 'workout_plans', 'user_settings'];
const store = {};
tables.forEach((t) => (store[t] = []));

let sessionUser = null;
const stats = { queries: 0 };

function matchFilters(row, filters) {
  return filters.every(([c, v]) => String(row[c]) === String(v));
}

class Query {
  constructor(table) {
    this.table = table;
    this.op = 'select';
    this.filters = [];
    this.orders = [];
    this.payload = null;
    this.opts = null;
    this.mode = null;
  }
  select() { return this; }
  insert(p) { this.op = 'insert'; this.payload = p; return this; }
  upsert(p, o) { this.op = 'upsert'; this.payload = p; this.opts = o || {}; return this; }
  update(p) { this.op = 'update'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.filters.push([c, v]); return this; }
  order(c, o) { this.orders.push([c, o]); return this; }
  single() { this.mode = 'one'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }

  /* RLS شبیه‌سازی: هر ردیفی که user_id نداشته باشد یا مال کاربر نباشد دیده نمی‌شود */
  visible() {
    const uid = sessionUser && sessionUser.id;
    return store[this.table].filter((r) => r.user_id === uid);
  }

  run() {
    stats.queries++;
    const uid = sessionUser && sessionUser.id;
    if (!uid) return { data: null, error: { message: 'not authenticated' } };

    if (this.op === 'select') {
      let rows = this.visible().filter((r) => matchFilters(r, this.filters));
      for (let i = this.orders.length - 1; i >= 0; i--) {
        const [col, opt] = this.orders[i];
        const asc = !opt || opt.ascending !== false;
        rows = [...rows].sort((a, b) => {
          const x = a[col], y = b[col];
          if (x === y) return 0;
          return (x > y ? 1 : -1) * (asc ? 1 : -1);
        });
      }
      if (this.mode) return { data: rows[0] || null, error: null };
      return { data: rows.map((r) => ({ ...r })), error: null };
    }

    if (this.op === 'delete') {
      const before = store[this.table].length;
      store[this.table] = store[this.table].filter(
        (r) => !(r.user_id === uid && matchFilters(r, this.filters)));
      return { data: null, error: null, removed: before - store[this.table].length };
    }

    if (this.op === 'insert' || this.op === 'upsert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      const conflict = (this.opts && this.opts.onConflict)
        ? String(this.opts.onConflict).split(',').map((s) => s.trim())
        : null;

      if (this.op === 'upsert' && !conflict) {
        return { data: null, error: { message: 'upsert بدون onConflict' } };
      }

      for (const row of rows) {
        /* RLS check */
        if (row.user_id !== uid) {
          return { data: null, error: { message: 'new row violates row-level security policy' } };
        }
        /* ستون‌های اجباری */
        for (const must of ['user_id']) {
          if (row[must] === undefined || row[must] === null) {
            return { data: null, error: { message: `null value in column "${must}"` } };
          }
        }

        if (!conflict) { store[this.table].push({ ...row }); continue; }

        const idx = store[this.table].findIndex(
          (r) => r.user_id === uid && conflict.every((c) => String(r[c]) === String(row[c])));
        if (idx >= 0) store[this.table][idx] = { ...store[this.table][idx], ...row };
        else store[this.table].push({ ...row });
      }
      return { data: null, error: null };
    }

    if (this.op === 'update') {
      const rows = this.visible().filter((r) => matchFilters(r, this.filters));
      rows.forEach((r) => Object.assign(r, this.payload));
      return { data: null, error: null };
    }
    return { data: null, error: { message: 'unsupported op ' + this.op } };
  }
}

const authHandlers = [];
const fakeDb = {
  from: (table) => {
    if (!store[table]) throw new Error('unknown table: ' + table);
    return new Query(table);
  },
  auth: {
    getSession: async () => ({ data: { session: sessionUser ? { user: sessionUser } : null } }),
    onAuthStateChange: (cb) => { authHandlers.push(cb); return { data: { subscription: {} } }; },
    signInWithOtp: async () => ({ error: null }),
    verifyOtp: async () => ({ error: null }),
    signOut: async () => ({ error: null })
  },
  channel: () => {
    const ch = { on: () => ch, subscribe: () => ch };
    return ch;
  },
  removeChannel: () => {}
};

/* ---------------- sandbox ---------------- */
const sandbox = {
  document: doc,
  window: {
    supabase: { createClient: () => fakeDb },
    location: { origin: 'https://example.github.io', pathname: '/mypath/', search: '', hash: '' },
    addEventListener() {}
  },
  localStorage,
  navigator,
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  URLSearchParams,
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  Blob: class Blob { constructor(p) { this.parts = p; } },
  confirm: () => true,
  alert: () => {},
  history: { replaceState() {} }
};
sandbox.globalThis = sandbox;
sandbox.window.document = doc;
sandbox.window.localStorage = localStorage;
sandbox.window.navigator = navigator;

let src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
/* دسترسی به توابع/متغیرهای داخلی برای تست */
src += `
;globalThis.__t = {
  handleSession, load, toggleHabit, saveEditor, openEditor, readEditor,
  saveHabitFromModal, openHabitModal, saveHabit, deleteHabit, moveHabit,
  saveAdviceFromModal, openAdviceModal, toggleAdvicePin, deleteAdvice,
  saveTopicFromModal, openTopicModal, saveBrainstormContent, openTopicEditor,
  saveGymFromModal, openGymModal, deleteGym,
  setSessionsPerWeek, savePlanExercise, openPlanExerciseModal,
  saveSettings, migrateLegacyData, clearAll, setLogRow,
  showPage, renderAll, isChecked, defaultHabits,
  getState: () => state,
  setState: (s) => { state = s; },
  getUser: () => currentUser,
  isReady: () => appReady,
  getWeekKey: () => weekKey()
};
`;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'app.js' });
const T = sandbox.__t;

/* ============================================================
   سناریو ۱: اولین ورود → ساخت عادت‌های پیش‌فرض
   ============================================================ */
(async () => {
  section('۱) ورود اول و بارگذاری داده‌ها');
  sessionUser = { id: 'user-1', email: 'tina@example.com' };
  await T.handleSession({ user: sessionUser });

  ok(T.isReady(), 'appReady بعد از load true شد');
  ok(T.getUser().id === 'user-1', 'currentUser ست شد');
  ok(store.habits.length === 4, 'چهار عادت پیش‌فرض در جدول habits ساخته شد (=' + store.habits.length + ')');
  ok(store.user_settings.length === 1, 'ردیف user_settings ساخته شد');
  ok(store.habits.every((h) => h.user_id === 'user-1'), 'user_id همه عادت‌ها درست است');
  ok(store.habits.every((h) => Array.isArray(h.days)), 'ستون days آرایه است');
  ok(store.habits.every((h) => typeof h.sort_order === 'number'), 'ستون sort_order پر است');

  /* ============================================================
     سناریو ۲: تیک زدن عادت (insert) و برداشتن تیک (delete)
     ============================================================ */
  section('۲) toggleHabit → insert سپس delete');
  const h0 = T.getState().habits[0].id;
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  await T.toggleHabit(h0, iso);
  ok(store.logs.length === 1, 'یک ردیف log ساخته شد');
  ok(store.logs[0].habit_id === h0 && store.logs[0].log_date === iso && store.logs[0].done === true,
     'ستون‌های log درست‌اند');
  ok(T.isChecked(h0, iso) === true, 'state.logs هم تیک را نشان می‌دهد');

  await T.toggleHabit(h0, iso);
  ok(store.logs.length === 0, 'با تیک دوم ردیف log حذف شد');
  ok(T.isChecked(h0, iso) === false, 'state.logs هم پاک شد');

  /* ============================================================
     سناریو ۳: ژورنال
     ============================================================ */
  section('۳) ژورنال: ساخت و ویرایش');
  T.openEditor(null);
  doc.querySelector('#jTitle').value = 'روز خوب';
  doc.querySelector('#jDate').value = iso;
  doc.querySelector('#jTags').value = 'سلامتی, کار';
  doc.querySelector('#jGood').value = 'ورزش کردم';
  doc.querySelector('#jLearned').value = 'صبر';
  doc.querySelector('#jFeeling').value = 'خوب';
  doc.querySelector('#jTomorrow').value = 'درس';
  doc.querySelector('#jMood').value = '4';

  await T.saveEditor(true);
  ok(store.journal_entries.length === 1, 'یک ورودی ژورنال ذخیره شد');
  const je = store.journal_entries[0];
  ok(je.entry_date === iso, 'ستون entry_date درست است');
  ok(je.mood === 4, 'mood درست است');
  ok(Array.isArray(je.tags) && je.tags.length === 2, 'tags به‌صورت آرایه ذخیره شد');
  ok(!!je.created_at, 'created_at پر شد');
  ok(T.getState().journal.length === 1, 'state.journal هم به‌روز شد');

  /* ویرایش همان ورودی نباید ردیف دوم بسازد */
  T.openEditor(T.getState().journal[0]);
  doc.querySelector('#jTitle').value = 'روز عالی';
  await T.saveEditor(true);
  ok(store.journal_entries.length === 1, 'ویرایش ردیف جدید نساخت');
  ok(store.journal_entries[0].title === 'روز عالی', 'عنوان آپدیت شد');

  /* ============================================================
     سناریو ۴: عادت جدید + حذف + جابه‌جایی
     ============================================================ */
  section('۴) عادت‌ها: افزودن، جابه‌جایی، حذف با cascade');
  T.openHabitModal();
  doc.querySelector('#hTitle').value = 'مدیتیشن';
  doc.querySelector('#hIcon').value = '🧘';
  doc.querySelector('#hColor').value = '#8b5cf6';
  await T.saveHabitFromModal();
  ok(store.habits.length === 5, 'عادت جدید اضافه شد');
  const newHabit = store.habits.find((h) => h.title === 'مدیتیشن');
  ok(!!newHabit && newHabit.sort_order === 4, 'sort_order عادت جدید درست است');

  const before = T.getState().habits.map((h) => h.id);
  await T.moveHabit(before[0], 1);
  const after = T.getState().habits.map((h) => h.id);
  ok(before[0] === after[1], 'جابه‌جایی در state انجام شد');
  const stored = [...store.habits].sort((a, b) => a.sort_order - b.sort_order).map((h) => h.id);
  ok(stored[1] === before[0], 'ترتیب جدید در دیتابیس هم ذخیره شد');

  /* برای عادت مدیتیشن یک تیک بساز، بعد حذفش کن */
  await T.toggleHabit(newHabit.id, iso);
  ok(store.logs.length === 1, 'تیک برای عادت جدید ثبت شد');
  await T.deleteHabit(newHabit.id);
  ok(!store.habits.some((h) => h.id === newHabit.id), 'عادت حذف شد');
  ok(!store.logs.some((l) => l.habit_id === newHabit.id), 'تیک‌های آن هم حذف شدند (cascade)');

  /* ============================================================
     سناریو ۵: توصیه‌ها
     ============================================================ */
  section('۵) توصیه‌ها');
  T.openAdviceModal();
  doc.querySelector('#adviceText').value = 'هر روز بخند';
  await T.saveAdviceFromModal();
  ok(store.advice.length === 1, 'توصیه ذخیره شد');
  ok(store.advice[0].body === 'هر روز بخند', 'متن در ستون body رفت');

  const advId = T.getState().advice[0].id;
  await T.toggleAdvicePin(advId);
  ok(store.advice[0].pinned === true, 'پین در دیتابیس ذخیره شد');
  await T.deleteAdvice(advId);
  ok(store.advice.length === 0, 'توصیه حذف شد');

  /* ============================================================
     سناریو ۶: برین‌استورم
     ============================================================ */
  section('۶) برین‌استورم');
  T.openTopicModal();
  doc.querySelector('#topicTitle').value = 'ایده کار';
  await T.saveTopicFromModal();
  ok(store.brainstorm_topics.length === 1, 'موضوع ذخیره شد');
  const topic = T.getState().brainstorm[0];
  T.openTopicEditor(topic.id);
  doc.querySelector('#brainstormContent').value = 'متن بلند فکر کردن';
  await T.saveBrainstormContent(false);
  ok(store.brainstorm_topics[0].content === 'متن بلند فکر کردن', 'متن ذخیره شد');
  ok(!!store.brainstorm_topics[0].updated_at, 'updated_at پر شد');

  /* ============================================================
     سناریو ۷: باشگاه
     ============================================================ */
  section('۷) باشگاه');
  T.openGymModal();
  doc.querySelector('#gymName').value = 'سینه';
  doc.querySelector('#gymDate').value = iso;
  doc.querySelector('#gymDuration').value = '70';
  doc.querySelector('#gymQualityValue').value = '5';
  doc.querySelector('#gymEnergyValue').value = '4';
  await T.saveGymFromModal();
  ok(store.gym_sessions.length === 1, 'جلسه ذخیره شد');
  ok(store.gym_sessions[0].session_date === iso, 'ستون session_date درست است');
  ok(store.gym_sessions[0].quality === 5, 'quality درست است');
  ok(Array.isArray(store.gym_sessions[0].exercises), 'exercises آرایه است');
  await T.deleteGym(store.gym_sessions[0].id);
  ok(store.gym_sessions.length === 0, 'جلسه حذف شد');

  /* ============================================================
     سناریو ۸: برنامه ورزشی
     ============================================================ */
  section('۸) برنامه ورزشی');
  await T.setSessionsPerWeek(5);
  const planRow = store.workout_plans[0];
  ok(!!planRow, 'ردیف workout_plans ساخته شد');
  ok(planRow.plan.sessionsPerWeek === 5, 'sessionsPerWeek در jsonb ذخیره شد');
  ok(planRow.user_id === 'user-1', 'user_id درست است');

  T.openPlanExerciseModal(0);
  doc.querySelector('#peName').value = 'پرس سینه';
  doc.querySelector('#peSets').value = '4';
  doc.querySelector('#peReps').value = '8';
  await T.savePlanExercise();
  ok(store.workout_plans[0].plan.days[0].exercises.length === 1, 'حرکت به روز اضافه شد');
  ok(store.workout_plans[0].plan.days[0].rest === false, 'روز از حالت استراحت خارج شد');

  /* ============================================================
     سناریو ۹: تنظیمات
     ============================================================ */
  section('۹) تنظیمات');
  T.getState().settings.name = 'تینا';
  T.getState().settings.theme = 'dark';
  T.getState().weekly[T.getWeekKey()] = 'هفته خوبی بود';
  await T.saveSettings();
  const st = store.user_settings[0];
  ok(st.name === 'تینا', 'اسم ذخیره شد');
  ok(st.theme === 'dark', 'تم ذخیره شد');
  ok(st.weekly[T.getWeekKey()] === 'هفته خوبی بود', 'یادداشت هفتگی در weekly ذخیره شد');

  /* ============================================================
     سناریو ۱۰: رندر همه‌ی صفحه‌ها بدون خطا
     ============================================================ */
  section('۱۰) رندر همه‌ی صفحه‌ها');
  const pages = ['dashboard', 'tasks', 'journal', 'advice', 'brainstorm', 'gym', 'plan', 'stats', 'settings'];
  let renderError = null;
  try { pages.forEach((p) => T.showPage(p)); T.renderAll(); }
  catch (e) { renderError = e; }
  ok(!renderError, 'همه‌ی صفحه‌ها رندر شدند' + (renderError ? ' — خطا: ' + renderError.message : ''));

  /* ============================================================
     سناریو ۱۱: انتقال داده‌های LocalStorage
     ============================================================ */
  section('۱۱) انتقال داده‌های LocalStorage');
  /* یک حساب دوم و خالی */
  sessionUser = null;
  tables.forEach((t) => (store[t] = []));
  sessionUser = { id: 'user-2', email: 'old@example.com' };

  const legacyHabitId = 'legacy01';
  const oldHabits = [{ id: legacyHabitId, title: 'قدیمی', icon: '📖', color: '#3b82f6', days: [0, 2], order: 0 }];
  const oldLogs = { '2026-01-05': { [legacyHabitId]: true }, '2026-01-06': { [legacyHabitId]: true } };
  const oldJournal = [{
    id: 'j1', title: 'خاطره', date: '2026-01-05', mood: 5, tags: ['قدیمی'],
    good: 'خوب', learned: 'یاد', feeling: 'حال', tomorrow: 'فردا', createdAt: 1767600000000
  }];
  const oldAdvice = [{ id: 'a1', text: 'توصیه قدیمی', color: '#dbeafe', pinned: true, createdAt: 1767600000000 }];
  const oldTopics = [{ id: 't1', title: 'موضوع قدیمی', icon: '💭', color: '#dcfce7', content: 'متن', createdAt: 1, updatedAt: 2 }];
  const oldGym = [{ id: 'g1', name: 'جلسه قدیمی', date: '2026-01-04', duration: 50, quality: 4, energy: 3, note: '', exercises: [], createdAt: 1 }];
  const oldPlan = { sessionsPerWeek: 4, days: {} };
  const oldSettings = { name: 'اسم قدیمی', palette: 'blue', theme: 'dark', reminder: '07:00' };

  ls.set('mypath_habits', JSON.stringify(oldHabits));
  ls.set('mypath_logs', JSON.stringify(oldLogs));
  ls.set('mypath_journal', JSON.stringify(oldJournal));
  ls.set('mypath_advice', JSON.stringify(oldAdvice));
  ls.set('mypath_brainstorm', JSON.stringify(oldTopics));
  ls.set('mypath_gym', JSON.stringify(oldGym));
  ls.set('mypath_plan', JSON.stringify(oldPlan));
  ls.set('mypath_settings', JSON.stringify(oldSettings));
  ls.set('mypath_weekly', JSON.stringify({ '2026-W02': 'یادداشت قدیمی' }));

  await T.handleSession({ user: sessionUser });   // حساب خالی → عادت پیش‌فرض می‌سازد
  const preCount = store.habits.length;
  ok(preCount === 4, 'قبل از انتقال، حساب خالی با عادت پیش‌فرض پر شد');

  await T.migrateLegacyData(false);   // ask=false → بدون confirm

  ok(store.habits.some((h) => h.id === legacyHabitId), 'عادت قدیمی منتقل شد');
  ok(store.logs.length === 2, 'دو تیک قدیمی منتقل شد (=' + store.logs.length + ')');
  ok(store.logs.every((l) => l.habit_id === legacyHabitId), 'تیک‌ها به عادت درست وصل‌اند');
  ok(store.journal_entries.some((j) => j.id === 'j1'), 'ژورنال منتقل شد');
  ok(store.journal_entries[0].entry_date === '2026-01-05', 'تاریخ ژورنال حفظ شد');
  ok(store.journal_entries[0].mood === 5 && store.journal_entries[0].tags[0] === 'قدیمی', 'محتوا و تگ حفظ شد');
  ok(store.advice.some((a) => a.id === 'a1' && a.pinned === true), 'توصیه با وضعیت پین منتقل شد');
  ok(store.brainstorm_topics.some((t) => t.id === 't1' && t.content === 'متن'), 'موضوع برین‌استورم منتقل شد');
  ok(store.gym_sessions.some((g) => g.id === 'g1'), 'جلسه باشگاه منتقل شد');
  ok(store.workout_plans[0].plan.sessionsPerWeek === 4, 'برنامه ورزشی قدیمی منتقل شد');
  ok(store.user_settings[0].weekly['2026-W02'] === 'یادداشت قدیمی', 'یادداشت هفتگی منتقل شد');
  /* رفتار مستند: اگر اسم ابری خالی باشد، اسم قدیمی پر می‌شود؛
     اگر کاربر قبلاً اسم گذاشته باشد، بازنویسی نمی‌شود. */
  ok(store.user_settings[0].name === 'اسم قدیمی',
     'اسم خالی ابر با اسم قدیمی پر شد (=' + JSON.stringify(store.user_settings[0].name) + ')');
  ok(!!ls.get('mypath_migrated_to_supabase'), 'پرچم مهاجرت ست شد');
  ok(T.getState().journal.length === 1, 'state بعد از انتقال دوباره از ابر خوانده شد');

  /* انتقال دوباره نباید رکورد تکراری بسازد (upsert) */
  const countBefore = store.journal_entries.length;
  await T.migrateLegacyData(false);
  ok(store.journal_entries.length === countBefore, 'اجرای دوباره‌ی انتقال رکورد تکراری نساخت');

  /* ============================================================
     سناریو ۱۲: پاک کردن همه
     ============================================================ */
  section('۱۲) clearAll');
  await T.clearAll();
  ok(store.habits.length === 4, 'بعد از پاک‌سازی، عادت‌های پیش‌فرض بازسازی شدند');
  ok(store.logs.length === 0, 'تیک‌ها پاک شدند');
  ok(store.journal_entries.length === 0, 'ژورنال پاک شد');
  ok(store.advice.length === 0, 'توصیه‌ها پاک شدند');
  ok(store.brainstorm_topics.length === 0, 'موضوعات پاک شدند');
  ok(store.gym_sessions.length === 0, 'جلسات پاک شدند');

  /* ============================================================
     نتیجه
     ============================================================ */
  console.log('\n' + '='.repeat(50));
  console.log(failures === 0
    ? `همه‌ی تست‌ها پاس شدند ✅  (${stats.queries} کوئری روی دیتابیس تقلبی)`
    : `${failures} تست شکست خورد ❌`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\nخطای غیرمنتظره در تست:', e);
  process.exit(1);
});
