/* ABAP Quest: a small RPG to learn modern ABAP.
   Content comes from quest-data.js. Progress is saved in this browser (localStorage). No dependencies.
   Rules: the first right answer to a question gives XP by rarity; right answers on different days move it up
   five review boxes (back after 1, 2, 4, 8 and 16 days), and a wrong answer sends it back to box 1 for tomorrow.
   Each zone opens when the boss of the previous one falls; the final boss opens with all eight. */
(function () {
  'use strict';
  const D = window.QUEST_DATA;
  const app = document.getElementById('quest');
  if (!D || !app) return;

  const ZONES = D.zones, RAID = D.raid, LEVELS = D.levels, ACH = D.achievements, QUESTIONS = D.questions;
  const QBY = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));
  const ZBY = Object.fromEntries(ZONES.map(z => [z.id, z]));
  const ZIDX = Object.fromEntries(ZONES.map((z, i) => [z.id, i]));
  const RXP = { c: 10, r: 15, e: 25 };
  const XP = { side: 15, daily: 15, ach: 20, review: 10, boss: 150, bossAgain: 20, flawless: 50, raid: 400, raidAgain: 40, duel: 10 };
  const BOXES = [1, 2, 4, 8, 16];
  const LS = 'abapquest.portfolio.v1';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- Texts ---------- */
  const UI = {
    en: {
      tagline: 'An RPG to learn modern ABAP',
      lead: 'Eight zones, a boss guarding each one and a final go-live to survive. Answer, read why, and come back to review what you missed.',
      start: 'Start the adventure', cont: 'Continue: {zone}', duel: 'Quick duel', duelHint: '5 random questions from every zone',
      review: 'Review', reviewDue: 'Review · {n}', reviewNone: 'Nothing to review today',
      level: 'Level', toNext: '{xp} XP · {left} to the next level', maxLevel: '{xp} XP · top level',
      streak: 'Streak', days: n => (n === 1 ? '1 day' : n + ' days'),
      bosses: 'Bosses', mastered: 'Mastered', achievements: 'Achievements',
      mapEyebrow: 'The map', mapTitle: 'Choose your path', mapLead: 'Each zone opens when you defeat the boss of the one before.',
      zoneN: 'Zone {n}', here: 'You are here', cleared: 'Cleared', locked: 'Locked',
      lockedBy: 'Defeat {boss} to open it', learned: '{a} of {b} learned', bossLabel: 'Boss',
      raidEyebrow: 'Final boss', raidLocked: 'Opens when the 8 zone bosses have fallen ({n} of 8).',
      raidRules: '{size} rare and epic questions from every zone. Land {hits} hits before you lose {lives} lives.',
      fight: 'Fight', fightAgain: 'Fight again', defeated: 'Defeated',
      explorer: 'Explorer mode', explorerHint: 'Open every zone without defeating the bosses.',
      reset: 'Reset progress', resetSure: 'Tap again to erase everything',
      backMap: 'Map', training: 'Training',
      trainLead: '5 questions, new and missed ones first. The first right answer to each one gives XP: common 10, rare 15, epic 25.',
      startTraining: 'Start training', dotNew: 'New', dotMiss: 'Missed', dotOk: 'Learned', dotMaster: 'Mastered',
      bossRules: 'Land {hits} hits before you lose {lives} lives.',
      bossReward: 'First victory: +150 XP, and +50 more if you keep every life.',
      attempts: n => (n === 1 ? '1 attempt' : n + ' attempts'), flawless: 'Flawless',
      sideTitle: 'Side quests', sideLead: 'Practice in a real system, for example the free SAP BTP trial. Tick them off on your honour: +15 XP each.',
      open: 'Open',
      mode: { train: 'Training', boss: 'Boss fight', raid: 'Final boss', review: 'Review', duel: 'Quick duel' },
      counter: 'Question {i} of {n}', round: 'Round {i}', rarity: { c: 'Common', r: 'Rare', e: 'Epic' },
      right: 'Right!', wrong: 'Not quite.', answerWas: 'The right answer is highlighted.',
      hit: 'Hit!', hurt: 'You lose a life', next: 'Next', result: 'See the result', leave: 'Leave',
      keysHint: 'Answer with 1–4 and continue with Enter.',
      doneTrain: 'Training complete', doneReview: 'Review complete', doneDuel: 'Duel over',
      victory: 'Victory!', defeat: 'Defeated',
      score: '{ok} of {n} right · +{xp} XP',
      bossWinFirst: '{boss} has fallen.', opens: '{zone} is now open.', bossWinAgain: 'You beat {boss} again.',
      bossLose: '{boss} wins this time. Train the zone and come back: the questions you missed will come first.',
      raidWin: 'The go-live went smoothly and everyone went home on time. You are a legend.',
      raidLose: 'The go-live slipped to Monday. Review your weak zones and try again.',
      duelPerfect: 'Five out of five. Not bad at all.',
      again: 'Play again', backZone: 'Back to the zone', toMap: 'Back to the map',
      daily: 'Daily bonus', achGot: 'Achievement: {name}', levelUp: 'Level {n}! You are now {title}', sideDone: 'Side quest complete',
      achTitle: 'Achievements', achLead: 'Each one gives +20 XP.', achCount: '{a} of {b} unlocked',
      reviewEmpty: 'Nothing to review today. Questions you answer come back after 1, 2, 4, 8 and 16 days, and the ones you miss come back tomorrow.',
      xpUnit: 'XP',
    },
    es: {
      tagline: 'Un RPG para aprender ABAP moderno',
      lead: 'Ocho zonas, un jefe que guarda cada una y un go-live final al que sobrevivir. Responde, lee el porqué y vuelve a repasar lo que fallaste.',
      start: 'Empezar la aventura', cont: 'Continuar: {zone}', duel: 'Duelo rápido', duelHint: '5 preguntas al azar de todas las zonas',
      review: 'Repaso', reviewDue: 'Repaso · {n}', reviewNone: 'Hoy no hay nada que repasar',
      level: 'Nivel', toNext: '{xp} XP · faltan {left} para el siguiente nivel', maxLevel: '{xp} XP · nivel máximo',
      streak: 'Racha', days: n => (n === 1 ? '1 día' : n + ' días'),
      bosses: 'Jefes', mastered: 'Dominadas', achievements: 'Logros',
      mapEyebrow: 'El mapa', mapTitle: 'Elige tu camino', mapLead: 'Cada zona se abre cuando derrotas al jefe de la anterior.',
      zoneN: 'Zona {n}', here: 'Estás aquí', cleared: 'Superada', locked: 'Bloqueada',
      lockedBy: 'Derrota a {boss} para abrirla', learned: '{a} de {b} aprendidas', bossLabel: 'Jefe',
      raidEyebrow: 'Jefe final', raidLocked: 'Se abre cuando caigan los 8 jefes de zona ({n} de 8).',
      raidRules: '{size} preguntas raras y épicas de todas las zonas. Acierta {hits} golpes antes de perder {lives} vidas.',
      fight: 'Luchar', fightAgain: 'Volver a luchar', defeated: 'Derrotado',
      explorer: 'Modo explorador', explorerHint: 'Abre todas las zonas sin derrotar a los jefes.',
      reset: 'Borrar progreso', resetSure: 'Pulsa otra vez para borrarlo todo',
      backMap: 'Mapa', training: 'Entrenamiento',
      trainLead: '5 preguntas, primero las nuevas y las falladas. El primer acierto de cada una da XP: común 10, rara 15, épica 25.',
      startTraining: 'Empezar a entrenar', dotNew: 'Nueva', dotMiss: 'Fallada', dotOk: 'Aprendida', dotMaster: 'Dominada',
      bossRules: 'Acierta {hits} golpes antes de perder {lives} vidas.',
      bossReward: 'Primera victoria: +150 XP, y +50 más si no pierdes ninguna vida.',
      attempts: n => (n === 1 ? '1 intento' : n + ' intentos'), flawless: 'Impecable',
      sideTitle: 'Misiones secundarias', sideLead: 'Practica en un sistema real, por ejemplo el trial gratuito de SAP BTP. Márcalas por tu honor: +15 XP cada una.',
      open: 'Abrir',
      mode: { train: 'Entrenamiento', boss: 'Combate contra el jefe', raid: 'Jefe final', review: 'Repaso', duel: 'Duelo rápido' },
      counter: 'Pregunta {i} de {n}', round: 'Ronda {i}', rarity: { c: 'Común', r: 'Rara', e: 'Épica' },
      right: '¡Correcto!', wrong: 'No exactamente.', answerWas: 'La respuesta correcta está marcada.',
      hit: '¡Golpe!', hurt: 'Pierdes una vida', next: 'Siguiente', result: 'Ver el resultado', leave: 'Salir',
      keysHint: 'Responde con 1–4 y continúa con Intro.',
      doneTrain: 'Entrenamiento completado', doneReview: 'Repaso completado', doneDuel: 'Duelo terminado',
      victory: '¡Victoria!', defeat: 'Derrota',
      score: '{ok} de {n} correctas · +{xp} XP',
      bossWinFirst: '{boss} ha caído.', opens: '{zone} ya está abierta.', bossWinAgain: 'Has vuelto a vencer a {boss}.',
      bossLose: '{boss} gana esta vez. Entrena la zona y vuelve: las preguntas que fallaste saldrán primero.',
      raidWin: 'El go-live salió bien y todo el mundo se fue a casa a su hora. Eres una leyenda.',
      raidLose: 'El go-live se ha ido al lunes. Repasa tus zonas flojas y vuelve a intentarlo.',
      duelPerfect: 'Cinco de cinco. Nada mal.',
      again: 'Jugar otra vez', backZone: 'Volver a la zona', toMap: 'Volver al mapa',
      daily: 'Bonus diario', achGot: 'Logro: {name}', levelUp: '¡Nivel {n}! Ahora eres {title}', sideDone: 'Misión completada',
      achTitle: 'Logros', achLead: 'Cada uno da +20 XP.', achCount: '{a} de {b} desbloqueados',
      reviewEmpty: 'Hoy no hay nada que repasar. Las preguntas que respondes vuelven a los 1, 2, 4, 8 y 16 días, y las que fallas vuelven mañana.',
      xpUnit: 'XP',
    },
  };
  let lang = document.documentElement.lang === 'es' ? 'es' : 'en';
  const t = (key, vars) => {
    let s = UI[lang][key];
    if (s === undefined) s = UI.en[key];
    if (typeof s !== 'string' || !vars) return s;
    s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
    // Names inside a sentence: "Defeat the Coupler", "Derrota al Acoplador"
    return lang === 'es' ? s.replace(/\ba El /g, 'al ').replace(/\bde El /g, 'del ') : s.replace(/([a-z,]) The /g, '$1 the ');
  };
  const L = o => (o && typeof o === 'object' && !Array.isArray(o) ? (o[lang] !== undefined ? o[lang] : o.en) : o);

  /* ---------- Small helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = s => esc(s).replace(/\{\{([\s\S]+?)\}\}/g, '<code class="ic">$1</code>');
  const icon = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#q-${name}"/></svg>`;
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pad = n => String(n).padStart(2, '0');
  const dayStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dayStr(new Date());
  const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return dayStr(new Date(y, m - 1, d + n)); };

  /* ---------- ABAP / CDS highlighting (same colours as the portfolio) ---------- */
  const KW = new Set(('ABSTRACT ACTION ALIASES AND APPEND AS ASSIGNING ASSOCIATION AT BASE BEGIN BY CASE CAST CATCH CHANGING CLASS CLASS-DATA ' +
    'CLASS-METHODS COMMIT COND CONSTANTS CONV CORRESPONDING CREATE DATA DECIMALS DEFAULT DEFINE DEFINITION DELETE ELSE ELSEIF EMPTY END ENDCLASS ' +
    'ENDIF ENDLOOP ENDMETHOD ENDTRY ENTITIES ENTITY EXPORTING FIELD FIELD-SYMBOL FIELDS FINAL FOR FROM IF IMPLEMENTATION IMPORTING IN INIT INTO ' +
    'IS KEY LENGTH LINES LOOP METHOD METHODS MODIFY NEW NEXT NOT OF ON OPTIONAL OR P PRIVATE PROTECTED PUBLIC RAISE RAISING READ READ-ONLY ' +
    'REDEFINITION REDUCE REF RESULT RETURNING SAVE SECTION SELECT STANDARD STRING SWITCH TABLE THEN TO TRY TYPE TYPES UPPER VALIDATION VALUE ' +
    'VIEW WHEN WHERE WITH').split(' '));
  const FN = new Set('line_exists line_index lines xsdbool condense to_upper to_lower strlen'.split(' '));
  function hlSeg(src) {
    let out = '', i = 0;
    const n = src.length;
    while (i < n) {
      const ch = src[i], prev = i ? src[i - 1] : ' ';
      if (ch === '"') { out += `<span class="c">${esc(src.slice(i))}</span>`; break; }
      if (ch === "'" || ch === '`') {
        let j = i + 1;
        while (j < n && src[j] !== ch) j++;
        out += `<span class="s">${esc(src.slice(i, j + 1))}</span>`; i = j + 1; continue;
      }
      if (ch === '|') {
        let j = i + 1, buf = '<span class="s">|';
        while (j < n && src[j] !== '|') {
          if (src[j] === '{') {
            const k = src.indexOf('}', j), e = k < 0 ? n : k;
            buf += '{</span>' + hlSeg(src.slice(j + 1, e)) + '<span class="s">' + (k < 0 ? '' : '}');
            j = e + 1; continue;
          }
          buf += esc(src[j]); j++;
        }
        out += buf + (j < n ? '|' : '') + '</span>'; i = Math.min(n, j + 1); continue;
      }
      if (ch === '<' && /[a-z_]/i.test(src[i + 1] || '') && !/[\w)]/.test(prev)) {
        const m = /^<[\w/]+>/.exec(src.slice(i));
        if (m) { out += `<span class="fs">${esc(m[0])}</span>`; i += m[0].length; continue; }
      }
      if (/[a-z_]/i.test(ch) && !/[\w\-~>$.]/.test(prev)) {
        const w = /^[a-z_][\w]*(?:-[a-z_][\w]*)*/i.exec(src.slice(i))[0];
        if (KW.has(w.toUpperCase())) out += `<span class="k">${esc(w)}</span>`;
        else if (FN.has(w.toLowerCase()) && src[i + w.length] === '(') out += `<span class="f">${esc(w)}</span>`;
        else out += esc(w);
        i += w.length; continue;
      }
      if (/\d/.test(ch) && !/[\w\-]/.test(prev)) {
        const m = /^\d+/.exec(src.slice(i));
        out += `<span class="n">${m[0]}</span>`; i += m[0].length; continue;
      }
      out += esc(ch); i++;
    }
    return out;
  }
  // One line per <span class="ln">; --i is the indentation, so phones keep a hanging indent when a line wraps
  const codeHtml = code => code.split('\n').map(line => {
    const ind = line.match(/^ */)[0].length;
    return `<span class="ln"><span class="lc" style="--i:${ind}"><span class="ind">${' '.repeat(ind)}</span>${hlSeg(line.slice(ind))}</span></span>`;
  }).join('');

  /* ---------- State ---------- */
  const fresh = () => ({ v: 1, xp: 0, level: 1, answered: {}, bosses: {}, raid: null, side: {}, days: [], ach: {}, reviews: 0, duelPerfect: false, explorer: false });
  let S = fresh();
  try {
    const raw = JSON.parse(localStorage.getItem(LS) || 'null');
    if (raw && typeof raw === 'object') S = Object.assign(fresh(), raw);
  } catch (e) { /* no storage or broken data: start again */ }
  const save = () => {
    S.level = levelOf(S.xp).n;
    try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { /* private mode */ }
  };

  function levelOf(xp) {
    let n = 1;
    LEVELS.forEach((l, i) => { if (xp >= l.xp) n = i + 1; });
    const next = LEVELS[n] || null;
    return { n, title: L(LEVELS[n - 1].title), from: LEVELS[n - 1].xp, to: next ? next.xp : null };
  }
  function streakOf() {
    const set = new Set(S.days);
    let d = today();
    if (!set.has(d)) d = addDays(d, -1);
    let n = 0;
    while (set.has(d)) { n++; d = addDays(d, -1); }
    return n;
  }
  const bossesWon = () => ZONES.filter(z => S.bosses[z.id] && S.bosses[z.id].won).length;
  const zoneOpen = i => i === 0 || S.explorer || !!(S.bosses[ZONES[i - 1].id] && S.bosses[ZONES[i - 1].id].won);
  const raidOpen = () => bossesWon() >= ZONES.length;
  const masteredCount = () => Object.values(S.answered).filter(r => r.box >= 3).length;
  const sideCount = () => Object.values(S.side).filter(Boolean).length;
  const dueIds = () => {
    const d = today();
    return QUESTIONS.filter(q => { const r = S.answered[q.id]; return r && r.due && r.due <= d; })
      .sort((a, b) => (S.answered[a.id].due < S.answered[b.id].due ? -1 : 1)).map(q => q.id);
  };
  const zoneQs = zid => QUESTIONS.filter(q => q.z === zid);
  const learnedIn = zid => zoneQs(zid).filter(q => S.answered[q.id] && S.answered[q.id].c > 0).length;
  const currentZone = () => {
    for (let i = 0; i < ZONES.length; i++) if (zoneOpen(i) && !(S.bosses[ZONES[i].id] && S.bosses[ZONES[i].id].won)) return ZONES[i];
    return null;
  };

  const ACH_TEST = {
    first: () => Object.values(S.answered).some(r => r.c > 0),
    duel: () => S.duelPerfect,
    trap: () => !!(S.answered.z1q3 && S.answered.z1q3.c > 0),
    master10: () => masteredCount() >= 10,
    master40: () => masteredCount() >= 40,
    epic: () => QUESTIONS.filter(q => q.r === 'e').every(q => S.answered[q.id] && S.answered[q.id].c > 0),
    streak3: () => streakOf() >= 3,
    streak7: () => streakOf() >= 7,
    review3: () => S.reviews >= 3,
    boss1: () => bossesWon() >= 1,
    boss4: () => bossesWon() >= 4,
    boss8: () => bossesWon() >= 8,
    flawless: () => Object.values(S.bosses).some(b => b.flawless),
    side5: () => sideCount() >= 5,
    side20: () => sideCount() >= 20,
    level5: () => levelOf(S.xp).n >= 5,
    level10: () => levelOf(S.xp).n >= 10,
    golive: () => !!(S.raid && S.raid.won),
  };

  /* ---------- Rewards ---------- */
  function award(xp, msg, quiet) {
    const before = levelOf(S.xp).n;
    const d = today();
    if (!S.days.includes(d)) {
      S.days.push(d); S.days = S.days.slice(-120);
      S.xp += XP.daily; toast(t('daily'), XP.daily);
    }
    if (xp > 0) { S.xp += xp; if (!quiet && msg) toast(msg, xp); }
    // Achievements can give the XP that unlocks a level achievement, so check until nothing changes
    for (let again = true; again;) {
      again = false;
      for (const a of ACH) {
        let ok = false;
        try { ok = !S.ach[a.id] && ACH_TEST[a.id](); } catch (e) { ok = false; }
        if (ok) { S.ach[a.id] = d; S.xp += XP.ach; again = true; toast(t('achGot', { name: L(a.name) }), XP.ach, 'ach'); }
      }
    }
    const after = levelOf(S.xp);
    if (after.n > before) toast(t('levelUp', { n: after.n, title: after.title }), 0, 'level');
    save();
  }
  function recordAnswer(q, ok, mode) {
    const r = S.answered[q.id] || (S.answered[q.id] = { c: 0, w: 0, box: 0, due: null, xp: false, lastOk: null });
    const d = today();
    let xp = 0;
    r.last = ok;
    if (ok) {
      r.c++;
      if (r.lastOk !== d) r.box = Math.min(5, r.box + 1);
      r.lastOk = d;
      r.due = addDays(d, BOXES[r.box - 1] || 16);
      if (!r.xp) { xp = RXP[q.r]; r.xp = true; } else xp = mode === 'review' ? 5 : 2;
    } else {
      r.w++; r.box = 1; r.due = addDays(d, 1);
    }
    return xp;
  }

  /* ---------- Toasts ---------- */
  const toasts = $('.q-toasts');
  function toast(msg, xp, kind) {
    if (!toasts) return;
    while (toasts.children.length > 2) toasts.firstChild.remove();
    const el = document.createElement('div');
    el.className = 'q-toast glass ' + (kind || '');
    el.innerHTML = (kind === 'ach' ? icon('star') : kind === 'level' ? icon('crown') : icon('bolt')) +
      `<span>${esc(msg)}</span>` + (xp ? `<b>+${xp} XP</b>` : '');
    toasts.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, kind ? 4200 : 2400);
  }

  /* ---------- Navigation: #zone id, #achievements, #play (a running quiz) ---------- */
  const ui = { view: 'map', zid: null, quiz: null, armed: false };
  function route() {
    const h = location.hash.slice(1);
    if (h === 'play' && ui.quiz) ui.view = 'quiz';
    else {
      ui.quiz = null;
      if (h === 'play' || !h) { ui.view = 'map'; ui.zid = null; }
      else if (h === 'achievements') ui.view = 'ach';
      else if (ZBY[h] && zoneOpen(ZIDX[h])) { ui.view = 'zone'; ui.zid = h; }
      else { ui.view = 'map'; ui.zid = null; }
      if (h === 'play') history.replaceState(null, '', location.pathname + location.search);
    }
    render(true);
  }
  const go = hash => {
    if (('#' + hash) === location.hash || (!hash && !location.hash)) route();
    else location.hash = hash;
  };
  addEventListener('hashchange', route);

  /* ---------- Quiz flow ---------- */
  function pickTraining(qs, n) {
    const d = today();
    const score = q => {
      const r = S.answered[q.id];
      if (!r) return 0;
      if (r.w > r.c) return 1;
      if (r.due && r.due <= d) return 2;
      return 3 + r.box;
    };
    return qs.map(q => ({ id: q.id, s: score(q) + Math.random() * 0.9 })).sort((a, b) => a.s - b.s).slice(0, n).map(x => x.id);
  }
  function startQuiz(mode, zid) {
    let ids = [];
    if (mode === 'train') ids = pickTraining(zoneQs(zid), 5);
    else if (mode === 'boss') ids = shuffle(zoneQs(zid).map(q => q.id));
    else if (mode === 'raid') ids = shuffle(QUESTIONS.filter(q => q.r !== 'c').map(q => q.id)).slice(0, RAID.size);
    else if (mode === 'review') ids = dueIds().slice(0, 10);
    else if (mode === 'duel') ids = shuffle(QUESTIONS.map(q => q.id)).slice(0, 5);
    if (!ids.length) return;
    const cfg = mode === 'boss' ? ZBY[zid].boss : mode === 'raid' ? RAID : null;
    ui.quiz = {
      mode, zid, ids, i: 0, picked: null, order: shuffle(QBY[ids[0]].o.en.map((_, k) => k)),
      ok: 0, bad: 0, xp: 0, lastXp: 0, hits: 0, lives: cfg ? cfg.lives : 0, maxHits: cfg ? cfg.hits : 0, maxLives: cfg ? cfg.lives : 0,
      result: null, finished: false, anim: null, bonus: 0, firstWin: false, flawless: false,
    };
    go('play');
  }
  function pick(k) {
    const qz = ui.quiz;
    if (!qz || qz.finished || qz.picked !== null || !(k >= 0 && k < qz.order.length)) return;
    const q = QBY[qz.ids[qz.i]];
    qz.picked = k;
    const ok = qz.order[k] === 0;   // the right option is always listed first in the data
    const xp = recordAnswer(q, ok, qz.mode);
    qz.lastXp = xp; qz.xp += xp;
    if (ok) qz.ok++; else qz.bad++;
    if (qz.mode === 'boss' || qz.mode === 'raid') {
      if (ok) { qz.hits++; qz.anim = 'hit'; if (qz.hits >= qz.maxHits) qz.result = 'won'; }
      else { qz.lives--; qz.anim = 'hurt'; if (qz.lives <= 0) qz.result = 'lost'; }
    }
    award(xp, '', true);
    render();
    const nb = $('#q-next');
    if (nb) nb.focus({ preventScroll: true });
    const fb = $('.q-feedback');
    if (fb && !reduced) fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function nextQ() {
    const qz = ui.quiz;
    if (!qz || qz.picked === null) return;
    if (qz.finished) return;
    if (qz.result || qz.i + 1 >= qz.ids.length) { finish(); return; }
    qz.i++; qz.picked = null; qz.anim = null; qz.lastXp = 0;
    qz.order = shuffle(QBY[qz.ids[qz.i]].o.en.map((_, k) => k));
    render(true);
  }
  function finish() {
    const qz = ui.quiz;
    if (!qz.result) qz.result = (qz.mode === 'boss' || qz.mode === 'raid') ? 'lost' : 'done';
    qz.finished = true;
    if (qz.mode === 'boss') {
      const z = ZBY[qz.zid];
      const rec = S.bosses[z.id] || { won: false, flawless: false, attempts: 0 };
      rec.attempts++;
      if (qz.result === 'won') {
        const flawless = qz.lives === qz.maxLives;
        let xp = rec.won ? XP.bossAgain : XP.boss;
        if (flawless && !rec.flawless) xp += XP.flawless;
        qz.firstWin = !rec.won; qz.flawless = flawless; qz.bonus = xp;
        rec.won = true; rec.flawless = rec.flawless || flawless;
        S.bosses[z.id] = rec;
        award(xp, L(z.boss.name));
      } else { S.bosses[z.id] = rec; save(); }
    } else if (qz.mode === 'raid') {
      const rec = S.raid || { won: false, attempts: 0 };
      rec.attempts++;
      if (qz.result === 'won') {
        const xp = rec.won ? XP.raidAgain : XP.raid;
        qz.firstWin = !rec.won; qz.bonus = xp; rec.won = true; S.raid = rec;
        award(xp, L(RAID.name));
      } else { S.raid = rec; save(); }
    } else if (qz.mode === 'review') {
      S.reviews = (S.reviews || 0) + 1;
      qz.bonus = qz.ok > 0 ? XP.review : 0;
      award(qz.bonus, t('doneReview'));
    } else if (qz.mode === 'duel') {
      if (qz.ok === qz.ids.length) { S.duelPerfect = true; qz.bonus = XP.duel; }
      award(qz.bonus, t('duel'));
    } else save();
    render(true);
  }

  /* ---------- Views ---------- */
  function hud() {
    const lv = levelOf(S.xp);
    const pct = lv.to ? Math.round(100 * (S.xp - lv.from) / (lv.to - lv.from)) : 100;
    const due = dueIds().length;
    const cur = currentZone();
    const started = S.xp > 0;
    return `
    <section class="q-hero glass">
      <div class="q-hero-copy">
        <p class="eyebrow q-gold">${esc(t('tagline'))}</p>
        <h1 class="q-display">ABAP Quest</h1>
        <p class="q-lead">${esc(t('lead'))}</p>
        <div class="q-actions">
          ${cur ? `<button type="button" class="btn q-btn-gold" data-go="${cur.id}">${icon('play')}${esc(started ? t('cont', { zone: L(cur.name) }) : t('start'))}</button>`
                : raidOpen() ? `<button type="button" class="btn q-btn-gold" data-start="raid">${icon('skull')}${esc(L(RAID.name))}</button>` : ''}
          <button type="button" class="btn" data-start="duel" title="${esc(t('duelHint'))}">${icon('sword')}${esc(t('duel'))}</button>
          <button type="button" class="btn" data-start="review" ${due ? '' : 'disabled'} title="${esc(due ? '' : t('reviewNone'))}">${icon('review')}${esc(due ? t('reviewDue', { n: due }) : t('review'))}</button>
        </div>
      </div>
      <div class="q-stats">
        <div class="q-level">
          <div class="q-medal" style="--p:${pct}"><span>${lv.n}</span></div>
          <div class="q-level-copy">
            <small>${esc(t('level'))} ${lv.n}</small>
            <b>${esc(lv.title)}</b>
            <span>${esc(lv.to ? t('toNext', { xp: S.xp, left: lv.to - S.xp }) : t('maxLevel', { xp: S.xp }))}</span>
          </div>
        </div>
        <div class="q-xpbar"><i style="width:${pct}%"></i></div>
        <div class="q-tiles">
          <div class="q-tile"><span>${icon('flame')}${esc(t('streak'))}</span><b>${esc(t('days')(streakOf()))}</b></div>
          <div class="q-tile"><span>${icon('skull')}${esc(t('bosses'))}</span><b>${bossesWon()} / ${ZONES.length}</b></div>
          <div class="q-tile"><span>${icon('book')}${esc(t('mastered'))}</span><b>${masteredCount()} / ${QUESTIONS.length}</b></div>
          <a class="q-tile link" href="#achievements"><span>${icon('trophy')}${esc(t('achievements'))}</span><b>${Object.keys(S.ach).length} / ${ACH.length}</b></a>
        </div>
      </div>
    </section>`;
  }

  function viewMap() {
    const cur = currentZone();
    const zones = ZONES.map((z, i) => {
      const open = zoneOpen(i);
      const won = !!(S.bosses[z.id] && S.bosses[z.id].won);
      const qs = zoneQs(z.id), learned = learnedIn(z.id);
      const state = !open ? 'is-locked' : won ? 'is-cleared' : (cur && cur.id === z.id ? 'is-current' : 'is-open');
      const pill = !open ? `<span class="q-pill">${icon('lock')}${esc(t('locked'))}</span>`
        : won ? `<span class="q-pill gold">${icon('crown')}${esc(t('cleared'))}</span>`
        : (cur && cur.id === z.id) ? `<span class="q-pill here">${esc(t('here'))}</span>` : '';
      const inner = `
          <span class="q-zone-top"><span class="q-sigil">${icon(z.icon)}</span><span class="q-zone-n">${esc(t('zoneN', { n: i + 1 }))}</span>${pill}</span>
          <span class="q-zone-name">${esc(L(z.name))}</span>
          <span class="q-zone-topic">${esc(L(z.topic))}</span>
          ${open ? `<span class="q-bar"><i style="width:${Math.round(100 * learned / qs.length)}%"></i></span>
          <span class="q-zone-meta"><span>${esc(t('learned', { a: learned, b: qs.length }))}</span><span class="q-boss-mini ${won ? 'won' : ''}">${icon(won ? 'crown' : 'skull')}${esc(L(z.boss.name))}</span></span>`
          : `<span class="q-zone-meta locked">${esc(t('lockedBy', { boss: L(ZONES[i - 1].boss.name) }))}</span>`}`;
      return `<li class="q-zone glass ${state}" style="--n:${i}">${open
        ? `<a class="q-zone-in" href="#${z.id}">${inner}</a>`
        : `<div class="q-zone-in" aria-disabled="true">${inner}</div>`}</li>`;
    }).join('');
    const rOpen = raidOpen(), rWon = !!(S.raid && S.raid.won);
    const raid = `
      <li class="q-raid glass ${rOpen ? '' : 'is-locked'} ${rWon ? 'is-cleared' : ''}">
        <div class="q-raid-portrait">${icon(rWon ? 'crown' : 'skull')}</div>
        <div class="q-raid-copy">
          <p class="eyebrow q-red">${esc(t('raidEyebrow'))}</p>
          <h3 class="q-display">${esc(L(RAID.name))}</h3>
          <p>${esc(L(RAID.flavor))}</p>
          <p class="q-small">${esc(rOpen ? t('raidRules', { size: RAID.size, hits: RAID.hits, lives: RAID.lives }) : t('raidLocked', { n: bossesWon() }))}</p>
        </div>
        ${rOpen ? `<button type="button" class="btn q-btn-red" data-start="raid">${icon('sword')}${esc(rWon ? t('fightAgain') : t('fight'))}</button>`
                : `<span class="q-pill">${icon('lock')}${esc(t('locked'))}</span>`}
      </li>`;
    return hud() + `
    <section class="q-map" aria-labelledby="q-map-title">
      <div class="sec-head">
        <p class="eyebrow q-gold">${esc(t('mapEyebrow'))}</p>
        <h2 id="q-map-title">${esc(t('mapTitle'))}</h2>
        <p>${esc(t('mapLead'))}</p>
      </div>
      <ol class="q-trail">${zones}${raid}</ol>
      <div class="q-foot">
        <label class="switch q-explorer" title="${esc(t('explorerHint'))}"><input type="checkbox" data-explorer ${S.explorer ? 'checked' : ''}><span class="track"></span>${icon('compass')}<span>${esc(t('explorer'))}</span></label>
        <span class="q-foot-hint">${esc(t('explorerHint'))}</span>
        <button type="button" class="btn small q-reset ${ui.armed ? 'armed' : ''}" data-reset>${icon('trash')}${esc(ui.armed ? t('resetSure') : t('reset'))}</button>
      </div>
    </section>`;
  }

  function dots(zid) {
    return zoneQs(zid).map(q => {
      const r = S.answered[q.id];
      const cls = !r ? 'new' : r.box >= 3 ? 'master' : r.last === false || r.c === 0 ? 'miss' : 'ok';
      return `<i class="d-${cls}"></i>`;
    }).join('');
  }

  function viewZone() {
    const z = ZBY[ui.zid], i = ZIDX[z.id];
    const qs = zoneQs(z.id), learned = learnedIn(z.id);
    const rec = S.bosses[z.id] || { won: false, flawless: false, attempts: 0 };
    const side = z.side.map(s => {
      const done = !!S.side[s.id];
      return `<li class="${done ? 'done' : ''}">
        <label><input type="checkbox" data-side="${s.id}" ${done ? 'checked' : ''}><span class="q-check">${icon('check')}</span><span>${esc(L(s.t))}</span></label>
        ${s.href ? `<a class="btn small" href="${esc(s.href)}">${esc(t('open'))}${icon('out')}</a>` : ''}
      </li>`;
    }).join('');
    return `
    <div class="q-crumbs"><a class="btn small" href="#">${icon('back')}${esc(t('backMap'))}</a></div>
    <header class="q-zone-head glass">
      <span class="q-sigil big">${icon(z.icon)}</span>
      <div>
        <p class="eyebrow q-gold">${esc(t('zoneN', { n: i + 1 }))} · ${esc(L(z.topic))}</p>
        <h1 class="q-display">${esc(L(z.name))}</h1>
        <p class="q-lead">${esc(L(z.intro))}</p>
      </div>
    </header>
    <div class="q-zone-grid">
      <section class="q-panel glass">
        <div class="q-panel-head">${icon('book')}<h2>${esc(t('training'))}</h2><span class="q-count">${esc(t('learned', { a: learned, b: qs.length }))}</span></div>
        <p>${esc(t('trainLead'))}</p>
        <div class="q-dots" aria-hidden="true">${dots(z.id)}</div>
        <p class="q-legend" aria-hidden="true"><span><i class="d-new"></i>${esc(t('dotNew'))}</span><span><i class="d-miss"></i>${esc(t('dotMiss'))}</span><span><i class="d-ok"></i>${esc(t('dotOk'))}</span><span><i class="d-master"></i>${esc(t('dotMaster'))}</span></p>
        <button type="button" class="btn q-btn-gold" data-start="train" data-z="${z.id}">${icon('play')}${esc(t('startTraining'))}</button>
      </section>
      <section class="q-panel q-boss-panel glass ${rec.won ? 'won' : ''}">
        <div class="q-portrait">${icon(rec.won ? 'crown' : 'skull')}</div>
        <p class="eyebrow q-red">${esc(t('bossLabel'))}${rec.won ? ' · ' + esc(t('defeated')) : ''}</p>
        <h2 class="q-display">${esc(L(z.boss.name))}</h2>
        <p class="q-flavor">${esc(L(z.boss.flavor))}</p>
        <p class="q-small">${esc(t('bossRules', { hits: z.boss.hits, lives: z.boss.lives }))} ${esc(t('bossReward'))}</p>
        <div class="q-boss-row">
          <button type="button" class="btn q-btn-red" data-start="boss" data-z="${z.id}">${icon('sword')}${esc(rec.won ? t('fightAgain') : t('fight'))}</button>
          ${rec.attempts ? `<span class="q-small">${esc(t('attempts')(rec.attempts))}${rec.flawless ? ` · <span class="q-gold">${icon('star')}${esc(t('flawless'))}</span>` : ''}</span>` : ''}
        </div>
      </section>
      <section class="q-panel q-side glass">
        <div class="q-panel-head">${icon('scroll')}<h2>${esc(t('sideTitle'))}</h2><span class="q-count">${z.side.filter(s => S.side[s.id]).length} / ${z.side.length}</span></div>
        <p>${esc(t('sideLead'))}</p>
        <ul class="q-sidelist">${side}</ul>
      </section>
    </div>`;
  }

  function bossBar(qz) {
    const name = qz.mode === 'raid' ? L(RAID.name) : L(ZBY[qz.zid].boss.name);
    const hp = qz.maxHits - qz.hits;
    const segs = Array.from({ length: qz.maxHits }, (_, k) => `<i class="${k < hp ? '' : 'gone'}"></i>`).join('');
    const hearts = Array.from({ length: qz.maxLives }, (_, k) => `<span class="${k < qz.lives ? '' : 'lost'}">${icon('heart')}</span>`).join('');
    return `
      <div class="q-fight glass ${qz.anim ? 'anim-' + qz.anim : ''}">
        <div class="q-portrait small">${icon('skull')}</div>
        <div class="q-fight-main">
          <b class="q-display">${esc(name)}</b>
          <div class="q-hp" role="img" aria-label="${hp} / ${qz.maxHits}">${segs}</div>
        </div>
        <div class="q-hearts" role="img" aria-label="${qz.lives} / ${qz.maxLives}">${hearts}</div>
      </div>`;
  }

  function viewQuiz() {
    const qz = ui.quiz;
    if (qz.finished) return viewResult(qz);
    const q = QBY[qz.ids[qz.i]];
    const z = ZBY[q.z];
    const fight = qz.mode === 'boss' || qz.mode === 'raid';
    const opts = L(q.o);
    const answered = qz.picked !== null;
    const okPick = answered && qz.order[qz.picked] === 0;
    const last = qz.result || qz.i + 1 >= qz.ids.length;
    const options = qz.order.map((oi, k) => {
      let cls = '';
      if (answered) cls = oi === 0 ? 'right' : (k === qz.picked ? 'wrong' : 'dim');
      return `<button type="button" class="q-opt ${cls} ${q.mono ? 'mono' : ''}" data-pick="${k}" ${answered ? 'disabled' : ''}>
        <span class="q-key">${k + 1}</span><span class="q-opt-t">${fmt(opts[oi])}</span>${answered && oi === 0 ? icon('check', 'q-opt-i') : answered && k === qz.picked ? icon('x', 'q-opt-i') : ''}</button>`;
    }).join('');
    const progress = fight ? bossBar(qz) : `
      <div class="q-steps" aria-hidden="true">${qz.ids.map((_, k) => `<i class="${k < qz.i ? 'done' : k === qz.i ? 'now' : ''}"></i>`).join('')}</div>`;
    const title = qz.mode === 'train' ? `${t('mode').train} · ${L(z.name)}` : t('mode')[qz.mode];
    return `
    <div class="q-quiz ${answered ? (okPick ? 'was-right' : 'was-wrong') : ''}">
      <div class="q-quiz-top">
        <button type="button" class="btn small" data-leave>${icon('x')}${esc(t('leave'))}</button>
        <span class="q-quiz-title">${esc(title)}</span>
        <span class="q-counter">${esc(fight ? t('round', { i: qz.i + 1 }) : t('counter', { i: qz.i + 1, n: qz.ids.length }))}</span>
      </div>
      ${progress}
      <article class="q-card glass">
        <div class="q-meta"><span class="q-rar r-${q.r}">${esc(t('rarity')[q.r])}</span><span class="q-from">${icon(z.icon)}${esc(L(z.name))}</span></div>
        <h2 class="q-question">${fmt(L(q.q))}</h2>
        ${q.code ? `<pre class="q-code lines">${codeHtml(q.code)}</pre>` : ''}
        <div class="q-options">${options}</div>
        ${answered ? `
        <div class="q-feedback ${okPick ? 'ok' : 'bad'}" role="status">
          <p class="q-verdict">${icon(okPick ? 'check' : 'x')}<b>${esc(okPick ? (fight ? t('hit') : t('right')) : (fight ? t('hurt') : t('wrong')))}</b>${qz.lastXp ? `<span class="q-xp">+${qz.lastXp} XP</span>` : ''}${okPick ? '' : `<span class="q-small">${esc(t('answerWas'))}</span>`}</p>
          <p>${fmt(L(q.x))}</p>
        </div>
        <div class="q-next"><button type="button" class="btn q-btn-gold" id="q-next" data-next>${esc(last ? t('result') : t('next'))}${icon('back', 'flip')}</button></div>`
        : (finePointer ? `<p class="q-keys">${esc(t('keysHint'))}</p>` : '')}
      </article>
    </div>`;
  }

  function viewResult(qz) {
    const n = qz.ok + qz.bad;
    const z = qz.zid ? ZBY[qz.zid] : null;
    let kind = 'done', title, line = '', ic = 'scroll';
    if (qz.mode === 'boss') {
      const boss = L(z.boss.name);
      if (qz.result === 'won') {
        kind = 'win'; title = t('victory'); ic = 'crown';
        const nextZone = ZONES[ZIDX[z.id] + 1];
        line = qz.firstWin ? t('bossWinFirst', { boss }) + (nextZone ? ' ' + t('opens', { zone: L(nextZone.name) }) : '') : t('bossWinAgain', { boss });
      } else { kind = 'lose'; title = t('defeat'); ic = 'skull'; line = t('bossLose', { boss }); }
    } else if (qz.mode === 'raid') {
      if (qz.result === 'won') { kind = 'win'; title = t('victory'); ic = 'crown'; line = t('raidWin'); }
      else { kind = 'lose'; title = t('defeat'); ic = 'skull'; line = t('raidLose'); }
    } else if (qz.mode === 'review') { title = t('doneReview'); ic = 'review'; }
    else if (qz.mode === 'duel') { title = t('doneDuel'); ic = 'sword'; if (qz.ok === n) { kind = 'win'; line = t('duelPerfect'); } }
    else { title = t('doneTrain'); ic = 'book'; }
    const total = qz.xp + qz.bonus;
    const again = qz.mode === 'review' && !dueIds().length ? '' :
      `<button type="button" class="btn q-btn-gold" data-start="${qz.mode}" ${z ? `data-z="${z.id}"` : ''}>${icon(qz.mode === 'boss' || qz.mode === 'raid' ? 'sword' : 'play')}${esc(qz.mode === 'boss' || qz.mode === 'raid' ? t('fightAgain') : t('again'))}</button>`;
    const burst = kind === 'win' && !reduced ? `<div class="q-burst" aria-hidden="true">${Array.from({ length: 14 }, (_, k) => `<i style="--a:${k * 360 / 14}deg"></i>`).join('')}</div>` : '';
    return `
    <div class="q-quiz">
      <article class="q-result glass ${kind}">
        <div class="q-result-icon">${burst}${icon(ic)}</div>
        <h1 class="q-display">${esc(title)}</h1>
        ${line ? `<p class="q-lead">${esc(line)}</p>` : ''}
        <p class="q-score">${esc(t('score', { ok: qz.ok, n, xp: total }))}</p>
        <div class="q-actions center">
          ${again}
          ${z && qz.mode !== 'raid' ? `<a class="btn" href="#${z.id}">${icon('back')}${esc(t('backZone'))}</a>` : ''}
          <a class="btn" href="#">${icon('map')}${esc(t('toMap'))}</a>
        </div>
      </article>
    </div>`;
  }

  function viewAch() {
    const got = Object.keys(S.ach).length;
    const tiles = ACH.map(a => {
      const on = !!S.ach[a.id];
      return `<li class="q-ach glass ${on ? 'on' : ''}"><span class="q-ach-i">${icon(on ? 'star' : 'lock')}</span>
        <div><b>${esc(L(a.name))}</b><span>${esc(L(a.desc))}</span>${on ? `<small>${esc(S.ach[a.id])}</small>` : ''}</div></li>`;
    }).join('');
    return `
    <div class="q-crumbs"><a class="btn small" href="#">${icon('back')}${esc(t('backMap'))}</a></div>
    <section class="q-achs">
      <div class="sec-head">
        <p class="eyebrow q-gold">${esc(t('achCount', { a: got, b: ACH.length }))}</p>
        <h1 class="q-display">${esc(t('achTitle'))}</h1>
        <p>${esc(t('achLead'))}</p>
      </div>
      <ul class="q-ach-grid">${tiles}</ul>
    </section>`;
  }

  let lastView = '';
  function render(top) {
    const key = ui.view + (ui.zid || '') + (ui.quiz ? ui.quiz.i + ':' + ui.quiz.finished : '');
    app.innerHTML = ui.view === 'zone' ? viewZone() : ui.view === 'quiz' && ui.quiz ? viewQuiz() : ui.view === 'ach' ? viewAch() : viewMap();
    app.dataset.view = ui.view;
    if (top && key !== lastView) scrollTo({ top: 0, behavior: 'auto' });
    lastView = key;
    if (ui.quiz && ui.quiz.anim) {   // the hit / hurt animation plays once
      const qz = ui.quiz;
      setTimeout(() => { if (qz.anim) { qz.anim = null; const f = $('.q-fight'); if (f) f.classList.remove('anim-hit', 'anim-hurt'); } }, 700);
    }
  }

  /* ---------- Events ---------- */
  let resetTimer = null;
  app.addEventListener('click', e => {
    const el = e.target.closest('[data-start],[data-go],[data-pick],[data-next],[data-leave],[data-reset]');
    if (!el || el.disabled) return;
    if (el.dataset.start) startQuiz(el.dataset.start, el.dataset.z || null);
    else if (el.dataset.go) go(el.dataset.go);
    else if (el.dataset.pick !== undefined) pick(Number(el.dataset.pick));
    else if (el.hasAttribute('data-next')) nextQ();
    else if (el.hasAttribute('data-leave')) { const z = ui.quiz && ui.quiz.zid; ui.quiz = null; go(z || ''); }
    else if (el.hasAttribute('data-reset')) {
      if (!ui.armed) {
        ui.armed = true; render();
        clearTimeout(resetTimer); resetTimer = setTimeout(() => { ui.armed = false; if (ui.view === 'map') render(); }, 4000);
      } else {
        clearTimeout(resetTimer); ui.armed = false;
        S = fresh(); save(); render(true);
      }
    }
  });
  app.addEventListener('change', e => {
    const el = e.target;
    if (el.matches('[data-side]')) {
      const id = el.dataset.side;
      if (el.checked) { S.side[id] = today(); award(XP.side, t('sideDone')); }
      else { delete S.side[id]; S.xp = Math.max(0, S.xp - XP.side); save(); }
      render();
    } else if (el.matches('[data-explorer]')) {
      S.explorer = el.checked; save(); render();
    }
  });
  addEventListener('keydown', e => {
    if (ui.view !== 'quiz' || !ui.quiz || ui.quiz.finished || e.altKey || e.ctrlKey || e.metaKey) return;
    if (/^[1-4]$/.test(e.key) && ui.quiz.picked === null) { e.preventDefault(); pick(Number(e.key) - 1); }
    else if (e.key === 'Enter' && ui.quiz.picked !== null && !(e.target.closest && e.target.closest('button,a'))) { e.preventDefault(); nextQ(); }
  });
  const home = $('[data-home]');
  if (home) home.addEventListener('click', e => { e.preventDefault(); go(''); });

  /* ---------- Language (shared with the portfolio) ---------- */
  const titleEl = $('title'), titleEn = titleEl.textContent;
  function setLang(next, persist) {
    lang = next === 'es' ? 'es' : 'en';
    document.documentElement.lang = lang;
    if (persist) { try { localStorage.setItem('lang', lang); } catch (e) { /* no storage */ } }
    document.title = lang === 'es' ? (titleEl.dataset.es || titleEn) : titleEn;
    document.querySelectorAll('*').forEach(el => {
      for (const a of [...el.attributes]) {
        if (!a.name.startsWith('data-es-')) continue;
        const target = a.name.slice(8), saved = 'data-en-' + target;
        if (!el.hasAttribute(saved)) el.setAttribute(saved, el.getAttribute(target) || '');
        el.setAttribute(target, lang === 'es' ? a.value : el.getAttribute(saved));
      }
    });
    document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    render();
  }
  document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang, true)));
  // Another tab (the portfolio) changed the language or the progress
  addEventListener('storage', e => {
    if (e.key === 'lang' && e.newValue && e.newValue !== lang) setLang(e.newValue, false);
  });

  setLang(lang, false);
  route();
})();
