/* Portfolio interactions: language switch, ABAP highlighting, expanding cards, project filter,
   the ABAP converter UI and the date tool. No dependencies. */
(function () {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const escHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /* ---------- Language ----------
     Page texts live in the HTML twice (lang="en" / lang="es") and CSS shows one of them.
     Attributes use data-es-<attribute>. Texts built in JavaScript come from UI. */
  const UI = {
    en: {
      copied: 'Copied', copyFail: 'Could not copy', copy: 'Copy',
      statements: 'statements', changed: 'changed', warning: 'warning', warnings: 'warnings',
      resultHere: 'The result will appear here.',
      noChanges: 'No changes: the code is already modern or no rule applies.',
      goLine: 'Go to line {n} of the original',
      dateEmpty: 'Type or paste a date in any of the formats.',
      dateErr: 'Unknown format. Try /Date(1704067200000)/, 20240101, 20240101083000 or 2024-01-01T08:00:00Z.',
      readable: 'Readable',
    },
    es: {
      copied: 'Copiado', copyFail: 'No se pudo copiar', copy: 'Copiar',
      statements: 'sentencias', changed: 'modificadas', warning: 'aviso', warnings: 'avisos',
      resultHere: 'El resultado aparecerá aquí.',
      noChanges: 'Sin cambios: el código ya es moderno o no hay reglas que apliquen.',
      goLine: 'Ir a la línea {n} del original',
      dateEmpty: 'Escribe o pega una fecha en cualquiera de los formatos.',
      dateErr: 'No reconozco ese formato. Prueba con /Date(1704067200000)/, 20240101, 20240101083000 o 2024-01-01T08:00:00Z.',
      readable: 'Legible',
    },
  };
  let lang = document.documentElement.lang === 'es' ? 'es' : 'en';
  const t = key => UI[lang][key];
  const refreshers = []; // re-render functions of the tool open in the sheet

  function localizeAttrs(root) {
    const els = root.querySelectorAll ? root.querySelectorAll('*') : [];
    els.forEach(el => {
      for (const a of [...el.attributes]) {
        if (!a.name.startsWith('data-es-')) continue;
        const target = a.name.slice(8);
        const saved = 'data-en-' + target;
        if (!el.hasAttribute(saved)) el.setAttribute(saved, el.getAttribute(target) || '');
        el.setAttribute(target, lang === 'es' ? a.value : el.getAttribute(saved));
      }
    });
  }
  const titleEl = document.querySelector('title');
  const titleEn = titleEl.textContent;
  function setLang(next, persist) {
    lang = next === 'es' ? 'es' : 'en';
    document.documentElement.lang = lang;
    if (persist) { try { localStorage.setItem('lang', lang); } catch (e) { /* no storage */ } }
    document.title = lang === 'es' ? (titleEl.dataset.es || titleEn) : titleEn;
    localizeAttrs(document);
    document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    if (typeof current !== 'undefined' && current) document.querySelector('.sheet-head .kicker').textContent = kickerOf(current);
    refreshers.forEach(f => f());
    requestAnimationFrame(() => refreshEdges());   // texts change width
  }
  const kickerOf = card => (lang === 'es' && card.dataset.kickerEs) || card.dataset.kicker || '';
  document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang, true)));

  /* ---------- ABAP syntax highlighting ---------- */
  const KW = new Set(('DATA TYPES TYPE LIKE REF TO VALUE NEW COND SWITCH WHEN THEN ELSE ELSEIF IF ENDIF CASE ENDCASE LOOP AT ENDLOOP INTO ASSIGNING ' +
    'FIELD-SYMBOL FIELD-SYMBOLS READ TABLE WITH KEY INDEX SELECT SINGLE FROM WHERE AND OR NOT IN IS INITIAL BOUND ASSIGNED UP ROWS FOR ALL ENTRIES ' +
    'ORDER BY GROUP HAVING APPEND INSERT MODIFY DELETE CLEAR REFRESH FREE CHECK RETURN EXIT CONTINUE METHOD ENDMETHOD METHODS CLASS ENDCLASS ' +
    'DEFINITION IMPLEMENTATION PUBLIC PRIVATE PROTECTED SECTION CREATE OBJECT CALL FUNCTION EXPORTING IMPORTING CHANGING RECEIVING EXCEPTIONS OTHERS ' +
    'TABLES RAISE RAISING TRY CATCH ENDTRY CONCATENATE SEPARATED SPACE MOVE MOVE-CORRESPONDING CORRESPONDING BASE EXACT CONV CAST REDUCE INIT NEXT ' +
    'FILTER ADD SUBTRACT MULTIPLY DIVIDE DESCRIBE LINES TRANSLATE UPPER LOWER CONDENSE NO-GAPS SHIFT LEFT DELETING LEADING ASSIGN OPTIONAL DEFAULT ' +
    'SORT DESCENDING ASCENDING FORM ENDFORM PERFORM USING WHILE ENDWHILE DO ENDDO TIMES STANDARD SORTED HASHED EMPTY UNIQUE NON-UNIQUE OF OCCURS ' +
    'HEADER LINE BEGIN END CONSTANTS STATICS PARAMETERS SELECT-OPTIONS START-OF-SELECTION REPORT WRITE MESSAGE TRANSPORTING NO FIELDS BINARY SEARCH ' +
    'GET REFERENCE ME DISTINCT AS INNER JOIN ON OUTER APPENDING ENDSELECT EQ NE GT LT GE LE BETWEEN LIKE').split(' '));
  const FN = new Set('line_exists line_index lines xsdbool condense to_upper to_lower concat_lines_of shift_left strlen boolc replace substring'.split(' '));

  function hlSeg(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
      const ch = src[i];
      const prev = i ? src[i - 1] : ' ';
      if (ch === '"') { out += `<span class="c">${escHtml(src.slice(i))}</span>`; break; }
      if (ch === "'" || ch === '`') {
        let j = i + 1;
        while (j < n) { if (src[j] === ch) { if (src[j + 1] === ch) { j += 2; continue; } j++; break; } j++; }
        out += `<span class="s">${escHtml(src.slice(i, j))}</span>`; i = j; continue;
      }
      if (ch === '|') { // string template: text parts as string, embedded expressions as code
        let j = i + 1;
        let buf = '<span class="s">|';
        while (j < n && src[j] !== '|') {
          if (src[j] === '\\' && j + 1 < n) { buf += escHtml(src.slice(j, j + 2)); j += 2; continue; }
          if (src[j] === '{') {
            const k = src.indexOf('}', j);
            const e = k < 0 ? n : k;
            buf += '{</span>' + hlSeg(src.slice(j + 1, e)) + '<span class="s">' + (k < 0 ? '' : '}');
            j = e + 1; continue;
          }
          buf += escHtml(src[j]); j++;
        }
        out += buf + (j < n ? '|' : '') + '</span>'; i = Math.min(n, j + 1); continue;
      }
      if (ch === '<' && /[A-Za-z_]/.test(src[i + 1] || '') && !/[\w)]/.test(prev)) {
        const m = /^<[\w\/]+>/.exec(src.slice(i));
        if (m) { out += `<span class="fs">${escHtml(m[0])}</span>`; i += m[0].length; continue; }
      }
      if (ch === '@') { out += '<span class="h">@</span>'; i++; continue; }
      if (/[A-Za-z_\/]/.test(ch) && !/[\w\-~>]/.test(prev)) {
        const w = /^[A-Za-z_\/][\w\/]*(?:-[A-Za-z_\/][\w\/]*)*/.exec(src.slice(i))[0];
        if (KW.has(w.toUpperCase())) out += `<span class="k">${escHtml(w)}</span>`;
        else if (FN.has(w.toLowerCase()) && src[i + w.length] === '(') out += `<span class="f">${escHtml(w)}</span>`;
        else out += escHtml(w);
        i += w.length; continue;
      }
      if (/\d/.test(ch) && !/[\w\-]/.test(prev)) {
        const m = /^\d+/.exec(src.slice(i));
        out += `<span class="n">${m[0]}</span>`; i += m[0].length; continue;
      }
      if (ch === '#') { out += '<span class="k">#</span>'; i++; continue; }
      out += escHtml(ch); i++;
    }
    return out;
  }
  const hlLine = line => (/^\*/.test(line) ? `<span class="c">${escHtml(line)}</span>` : hlSeg(line));
  const hl = code => code.split('\n').map(hlLine).join('\n');
  $$('pre[data-hl]').forEach(p => { p.innerHTML = hl(p.textContent); });

  /* ---------- Copy to clipboard ---------- */
  async function copyText(text, btn) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
      } catch (e2) { ok = false; }
    }
    if (btn) {
      const label = btn.querySelector('.btn-label') || btn.querySelector('span');
      if (!label) return;
      const old = label.innerHTML;
      label.textContent = ok ? t('copied') : t('copyFail');
      setTimeout(() => { label.innerHTML = old; }, 1600);
    }
  }
  $$('[data-copy-text]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); copyText(b.dataset.copyText, b); }));

  /* ---------- Edge fades for things that scroll sideways (code, tables) ----------
     The class fade-l / fade-r is set on the side that still has content to show. */
  const edgeUpdaters = [];
  function trackEdges(el) {
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.classList.toggle('fade-l', max > 2 && el.scrollLeft > 2);
      el.classList.toggle('fade-r', max > 2 && max - el.scrollLeft > 2);
    };
    el.addEventListener('scroll', update, { passive: true });
    edgeUpdaters.push(update);
    requestAnimationFrame(update);
  }
  const refreshEdges = () => edgeUpdaters.forEach(f => f());
  addEventListener('resize', refreshEdges, { passive: true });

  /* ---------- Code panels in project sheets ----------
     <figure class="code-file" data-tab-en data-tab-es> holds one file (a <pre data-code> or a table).
     <ol class="code-notes" data-for="i"> annotates file i; <li data-line="12-14"> marks those lines. */
  function mountCodePanel(panel) {
    const files = $$('.code-file', panel);
    const notesFor = i => $(`.code-notes[data-for="${i}"]`, panel);
    const tabs = $('.code-tabs', panel);
    // data-line="12", "12-14" or "3,8-10" → the line numbers it covers
    const lineNums = spec => spec.split(',').flatMap(r => {
      const [a, b] = r.split('-').map(Number);
      return Array.from({ length: (b || a) - a + 1 }, (_, k) => a + k);
    });
    const lineEls = (pre, spec) => { const all = $$('.ln', pre); return lineNums(spec).map(n => all[n - 1]).filter(Boolean); };
    files.forEach((fig, i) => {
      const pre = $('pre[data-code]', fig);
      if (pre) {
        const raw = pre.textContent.replace(/\s+$/, '');
        fig.dataset.raw = raw;
        const badge = {};
        const marked = new Set();
        const notes = notesFor(i);
        if (notes) $$('li[data-line]', notes).forEach((li, k) => {
          const nums = lineNums(li.dataset.line);
          badge[nums[0]] = badge[nums[0]] || k + 1;
          nums.forEach(n => marked.add(n));
        });
        pre.innerHTML = raw.split('\n').map((line, idx) => {
          const n = idx + 1;
          const g = badge[n] ? `<span class="g b" data-b="${badge[n]}">${n}</span>` : `<span class="g">${n}</span>`;
          const body = pre.dataset.lang && pre.dataset.lang !== 'abap' ? escHtml(line) : hlLine(line);
          return `<span class="ln${marked.has(n) ? ' mark' : ''}">${g}${body}</span>`;
        }).join('');
        if (notes) $$('li[data-line]', notes).forEach(li => {
          li.tabIndex = 0;
          const lines = () => lineEls(pre, li.dataset.line);
          li.addEventListener('mouseenter', () => lines().forEach(l => l.classList.add('hot')));
          li.addEventListener('mouseleave', () => lines().forEach(l => l.classList.remove('hot')));
          const go = () => {
            const ls = lines();
            if (!ls.length) return;
            ls[0].scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
            ls.forEach(l => { l.classList.remove('flash'); void l.offsetWidth; l.classList.add('flash'); });
          };
          li.addEventListener('click', go);
          li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        });
      }
    });
    // a table "file" is copied as tab-separated text, in the language on screen
    const tableText = fig => $$('tr', fig).map(tr => $$('th, td', tr).map(c => [...c.childNodes]
      .filter(n => !(n.nodeType === 1 && n.lang && n.lang !== lang)).map(n => n.textContent).join('').trim()).join('\t')).join('\n');
    let active = 0;
    const select = i => {
      active = i;
      files.forEach((f, k) => { f.hidden = k !== i; const n = notesFor(k); if (n) n.hidden = k !== i; });
      $$('.code-tab', tabs).forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
      requestAnimationFrame(refreshEdges);
    };
    if (files.length > 1) {
      tabs.innerHTML = files.map((f, i) => `<button type="button" class="code-tab" role="tab" data-i="${i}"><span lang="en">${escHtml(f.dataset.tabEn)}</span><span lang="es">${escHtml(f.dataset.tabEs)}</span></button>`).join('');
      $$('.code-tab', tabs).forEach(b => b.addEventListener('click', () => select(+b.dataset.i)));
    }
    select(0);
    $('.code-copy', panel).addEventListener('click', e => {
      e.stopPropagation();
      const f = files[active];
      copyText(f.dataset.raw !== undefined ? f.dataset.raw : tableText(f), e.currentTarget);
    });
  }

  /* ---------- Smooth scrolling for the navigation ---------- */
  $$('[data-scroll]').forEach(a => a.addEventListener('click', e => {
    const target = document.getElementById(a.dataset.scroll);
    if (!target) return;
    e.preventDefault();
    const y = target.getBoundingClientRect().top + scrollY - 84;
    scrollTo({ top: a.dataset.scroll === 'home' ? 0 : y, behavior: reduced ? 'auto' : 'smooth' });
  }));

  /* ---------- Card sheen that follows the pointer ---------- */
  $$('.card').forEach(c => c.addEventListener('pointermove', e => {
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }));

  /* ---------- Project filter ---------- */
  const filterBtns = $$('[data-filter]');
  const projectCards = $$('#project-grid .card[data-cat]');
  filterBtns.forEach(b => {
    const f = b.dataset.filter;
    const count = b.querySelector('.count');
    if (count) count.textContent = f === 'all' ? projectCards.length : projectCards.filter(c => c.dataset.cat === f).length;
    b.addEventListener('click', () => {
      filterBtns.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      projectCards.forEach(c => {
        const show = f === 'all' || c.dataset.cat === f;
        if (show && c.hidden && !reduced) c.animate([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.9,.15,1)' });
        c.hidden = !show;
      });
    });
  });

  /* ---------- Expanding sheet ----------
     Each card holds its detail in <template class="detail">. On open, the sheet is placed
     in its final position and animated from the card's rectangle (translate + clip-path). */
  const sheet = $('.sheet');
  const scrim = $('.scrim');
  const sBody = $('.sheet-body', sheet);
  const sScroll = $('.sheet-scroll', sheet);
  const sTitle = $('#sheet-title');
  const sKicker = $('.sheet-head .kicker', sheet);
  const sTile = $('.sheet-head .tile', sheet);
  const closeBtn = $('.close', sheet);
  const jumpBtn = $('.jump-code', sheet);
  sBody.addEventListener('toggle', () => requestAnimationFrame(refreshEdges), true);
  jumpBtn.addEventListener('click', () => {
    const panel = $('.code-panel', sBody);
    if (panel) panel.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  });
  let current = null;
  let anim = null;
  let pendingDone = null;

  function geometry(card) {
    const from = card.getBoundingClientRect();
    const to = sheet.getBoundingClientRect();
    return {
      dx: from.left - to.left, dy: from.top - to.top,
      r: Math.max(0, to.width - from.width), b: Math.max(0, to.height - from.height),
    };
  }
  function setHash(id) { try { history.replaceState(null, '', id ? '#' + id : location.pathname + location.search); } catch (e) { /* no history API */ } }

  function openCard(card) {
    if (current === card) return;
    if (current) closeSheet(false);
    if (pendingDone) pendingDone();
    [sheet, sScroll, scrim].forEach(el => el.getAnimations().forEach(a => a.cancel()));
    current = card;
    sTitle.innerHTML = card.querySelector('h3').innerHTML;
    sKicker.textContent = kickerOf(card);
    sTile.innerHTML = card.querySelector('.tile').innerHTML;
    sBody.replaceChildren(card.querySelector('template.detail').content.cloneNode(true));
    $$('pre[data-hl]', sBody).forEach(p => { p.innerHTML = hl(p.textContent); });
    edgeUpdaters.length = 0;
    $$('.code-panel', sBody).forEach(mountCodePanel);
    const panel = $(':scope > .code-panel', sBody);
    $$('.code-block, .map-wrap, .table-wrap', sBody).forEach(trackEdges);
    jumpBtn.hidden = !panel;
    sheet.dataset.size = card.dataset.size || (panel ? 'code' : '');
    sheet.style.transform = '';
    sheet.hidden = false;
    scrim.hidden = false;
    document.documentElement.classList.add('locked');
    sScroll.scrollTop = 0;
    refreshers.length = 0;
    localizeAttrs(sBody);
    $$('[data-mount]', sBody).forEach(el => MOUNTS[el.dataset.mount] && MOUNTS[el.dataset.mount](el));
    card.classList.add('is-source');
    if (!reduced) {
      const g = geometry(card);
      anim = sheet.animate([
        { transform: `translate(${g.dx}px, ${g.dy}px)`, clipPath: `inset(0px ${g.r}px ${g.b}px 0px round 26px)` },
        { transform: 'translate(0px, 0px)', clipPath: 'inset(0px 0px 0px 0px round 30px)' },
      ], { duration: 560, easing: 'cubic-bezier(.2,.9,.15,1)' });
      sScroll.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 140, easing: 'ease-out', fill: 'backwards' });
      scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320 });
    }
    closeBtn.focus({ preventScroll: true });
    setHash(card.dataset.id);
  }

  function closeSheet(animate = true) {
    if (!current) return;
    const card = current;
    current = null;
    setHash('');
    const done = () => {
      pendingDone = null;
      sheet.hidden = true; scrim.hidden = true; sheet.style.transform = '';
      sBody.replaceChildren();
      refreshers.length = 0;
      card.classList.remove('is-source');
      document.documentElement.classList.remove('locked');
      [sScroll, scrim].forEach(el => el.getAnimations().forEach(a => a.cancel()));
    };
    pendingDone = done;
    if (!animate || reduced) { done(); card.focus({ preventScroll: true }); return; }
    const g = geometry(card);
    const start = sheet.style.transform || 'translate(0px, 0px)';
    if (anim) anim.cancel();
    anim = sheet.animate([
      { transform: start, clipPath: 'inset(0px 0px 0px 0px round 30px)' },
      { transform: `translate(${g.dx}px, ${g.dy}px)`, clipPath: `inset(0px ${g.r}px ${g.b}px 0px round 26px)` },
    ], { duration: 420, easing: 'cubic-bezier(.3,.8,.2,1)' });
    sScroll.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
    scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, fill: 'forwards' });
    anim.onfinish = () => { if (pendingDone === done) done(); };
    card.focus({ preventScroll: true });
  }

  $$('.card[data-id]').forEach(card => {
    card.addEventListener('click', () => openCard(card));
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCard(card); } });
  });
  closeBtn.addEventListener('click', () => closeSheet());
  scrim.addEventListener('click', () => closeSheet());
  document.addEventListener('keydown', e => {
    if (!current) return;
    if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
    if (e.key === 'Tab') { // keep focus inside the sheet
      const f = $$('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])', sheet).filter(x => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Swipe down on the grabber to close (phones)
  (function () {
    const grab = $('.grabber', sheet);
    let y0 = null, dy = 0;
    grab.addEventListener('pointerdown', e => { y0 = e.clientY; dy = 0; grab.setPointerCapture(e.pointerId); });
    grab.addEventListener('pointermove', e => {
      if (y0 == null) return;
      dy = Math.max(0, e.clientY - y0);
      sheet.style.transform = `translate(0px, ${dy}px)`;
    });
    const end = () => {
      if (y0 == null) return;
      y0 = null;
      if (dy > 110) closeSheet();
      else {
        const from = sheet.style.transform;
        sheet.style.transform = '';
        if (!reduced && from) sheet.animate([{ transform: from }, { transform: 'translate(0px, 0px)' }], { duration: 300, easing: 'cubic-bezier(.2,.9,.15,1)' });
      }
    };
    grab.addEventListener('pointerup', end);
    grab.addEventListener('pointercancel', end);
  })();

  // Deep links: index.html#converter opens that card
  function fromHash() {
    const id = location.hash.slice(1);
    const card = id && document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    if (card) {
      if (card.hidden) $('[data-filter="all"]').click();
      card.scrollIntoView({ block: 'center' });
      requestAnimationFrame(() => openCard(card));
    } else if (!id && current) closeSheet();
  }
  addEventListener('hashchange', fromHash);

  /* ---------- Converter ---------- */
  const EXAMPLES = [
`REPORT zhr_active_employees.

DATA: lt_p0001 TYPE STANDARD TABLE OF pa0001,
      ls_p0001 TYPE pa0001,
      lv_lines TYPE i,
      lv_text  TYPE string,
      lv_pernr TYPE pernr_d.

SELECT-OPTIONS s_pernr FOR lv_pernr.

START-OF-SELECTION.
  SELECT * FROM pa0001 INTO TABLE lt_p0001
    WHERE pernr IN s_pernr
      AND endda >= sy-datum.

  DESCRIBE TABLE lt_p0001 LINES lv_lines.

  LOOP AT lt_p0001 INTO ls_p0001.
    CONCATENATE ls_p0001-pernr ls_p0001-ename
           INTO lv_text SEPARATED BY space.
    WRITE / lv_text.
  ENDLOOP.

  READ TABLE lt_p0001 INTO ls_p0001 WITH KEY pernr = lv_pernr.
  IF sy-subrc EQ 0.
    WRITE / ls_p0001-ename.
  ENDIF.`,
`METHOD replicate_employees.
  DATA: lo_log       TYPE REF TO zcl_hr_repl_log,
        lo_error     TYPE REF TO zcx_hr_repl,
        lt_employees TYPE STANDARD TABLE OF zhr_s_ec_employee,
        lt_status    TYPE STANDARD TABLE OF zhr_s_repl_status,
        ls_status    TYPE zhr_s_repl_status,
        lv_errors    TYPE i.
  FIELD-SYMBOLS <ls_employee> TYPE zhr_s_ec_employee.

  CREATE OBJECT lo_log
    EXPORTING
      iv_object    = 'ZHR_ECP'
      iv_subobject = 'PTP'.

  lt_employees = read_compound_employees( iv_since = iv_last_run ).

  LOOP AT lt_employees ASSIGNING <ls_employee>.
    TRY.
        CALL METHOD me->map_to_infotypes
          EXPORTING
            is_employee = <ls_employee>.
        CLEAR ls_status.
        ls_status-pernr  = <ls_employee>-pernr.
        ls_status-status = 'S'.
        APPEND ls_status TO lt_status.
      CATCH zcx_hr_repl INTO lo_error.
        ADD 1 TO lv_errors.
        CALL METHOD lo_log->add_exception
          EXPORTING
            ix_error = lo_error
            iv_pernr = <ls_employee>-pernr.
    ENDTRY.
  ENDLOOP.

  IF lv_errors GT 0.
    rv_status = 'W'.
  ELSE.
    rv_status = 'S'.
  ENDIF.

  CALL METHOD lo_log->save.
ENDMETHOD.`,
`FORM read_last_result USING pv_pernr TYPE pernr_d.
  DATA: lt_rgdir  TYPE TABLE OF pc261,
        ls_rgdir  TYPE pc261,
        lv_molga  TYPE molga,
        lv_relid  TYPE t500l-relid,
        lv_text   TYPE string,
        ls_result TYPE pay99_result.

  CALL FUNCTION 'CU_READ_RGDIR'
    EXPORTING
      persnr          = pv_pernr
    IMPORTING
      molga           = lv_molga
    TABLES
      in_rgdir        = lt_rgdir
    EXCEPTIONS
      no_record_found = 1
      OTHERS          = 2.
  CHECK sy-subrc EQ 0.

  SELECT SINGLE relid FROM t500l INTO lv_relid
    WHERE molga = lv_molga.

  SORT lt_rgdir BY fpend DESCENDING.
  READ TABLE lt_rgdir INTO ls_rgdir WITH KEY srtza = 'A'.
  IF sy-subrc = 0.
    CALL FUNCTION 'PYXX_READ_PAYROLL_RESULT'
      EXPORTING
        clusterid      = lv_relid
        employeenumber = pv_pernr
        sequencenumber = ls_rgdir-seqnr
      CHANGING
        payroll_result = ls_result
      EXCEPTIONS
        OTHERS         = 1.
    CONCATENATE 'Period' ls_rgdir-fpper 'read for' pv_pernr
           INTO lv_text SEPARATED BY space.
    MESSAGE lv_text TYPE 'S'.
  ENDIF.
ENDFORM.`,
  ];
  const conv = { src: EXAMPLES[0], ex: 0, release: 750, inline: true };
  try {
    const saved = JSON.parse(localStorage.getItem('abap-conv') || 'null');
    if (saved && typeof saved.src === 'string') Object.assign(conv, saved);
  } catch (e) { /* storage not available */ }
  const save = () => { try { localStorage.setItem('abap-conv', JSON.stringify(conv)); } catch (e) { /* ignore */ } };

  function mountConverter(root) {
    const ta = $('#conv-in', root);
    const gut = $('.gutter .g', root);
    const out = $('.out-code', root);
    const sum = $('.summary', root);
    const notesEl = $('.notes', root);
    const inl = $('#conv-inline', root);
    let last = { code: '' };
    ta.value = conv.src;
    inl.checked = conv.inline;
    const syncRel = () => $$('[data-rel]', root).forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.rel) === conv.release)));
    const syncEx = () => $$('[data-ex]', root).forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.ex) === conv.ex && ta.value === EXAMPLES[conv.ex])));
    const gutter = () => {
      const n = ta.value.split('\n').length;
      let s = '';
      for (let k = 1; k <= n; k++) s += k + '\n';
      gut.textContent = s;
      gut.style.transform = `translateY(${-ta.scrollTop}px)`;
    };
    function run() {
      const r = window.AbapModernizer.convert(ta.value, { release: conv.release, inline: conv.inline, lang });
      last = r;
      const chg = new Set(r.changedLines);
      out.innerHTML = r.code
        ? r.code.split('\n').map((l, k) => `<span class="ln${chg.has(k + 1) ? ' chg' : ''}"><span class="num">${k + 1}</span>${hlLine(l)}</span>`).join('')
        : `<span class="ln"><span class="num"></span><span class="empty">${t('resultHere')}</span></span>`;
      const warns = r.notes.filter(n => n.level === 'warn').length;
      sum.innerHTML = `<span class="stat"><b>${r.stats.statements}</b> ${t('statements')}</span><span class="stat"><b>${r.stats.changed}</b> ${t('changed')}</span>` +
        (warns ? `<span class="stat warn"><b>${warns}</b> ${warns === 1 ? t('warning') : t('warnings')}</span>` : '');
      notesEl.innerHTML = r.notes.length ? r.notes.map(n => `<li class="note${n.level === 'warn' ? ' warn' : ''}"><b>${escHtml(n.title)}</b>` +
        (n.detail ? `<p>${escHtml(n.detail)}</p>` : '') +
        `<div class="lines">${n.lines.map(L => `<button type="button" data-line="${L}" aria-label="${escHtml(t('goLine').replace('{n}', L))}">L${L}</button>`).join('')}</div></li>`).join('')
        : `<li class="empty">${t('noChanges')}</li>`;
      gutter();
      syncEx();
    }
    let timer = null;
    ta.addEventListener('input', () => { conv.src = ta.value; gutter(); clearTimeout(timer); timer = setTimeout(() => { run(); save(); }, 160); });
    ta.addEventListener('scroll', gutter);
    ta.addEventListener('keydown', e => { // Tab inserts two spaces
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
        ta.dispatchEvent(new Event('input'));
      }
    });
    $$('[data-rel]', root).forEach(b => b.addEventListener('click', () => { conv.release = Number(b.dataset.rel); syncRel(); run(); save(); }));
    inl.addEventListener('change', () => { conv.inline = inl.checked; run(); save(); });
    $$('[data-ex]', root).forEach(b => b.addEventListener('click', () => { conv.ex = Number(b.dataset.ex); ta.value = conv.src = EXAMPLES[conv.ex]; ta.scrollTop = 0; run(); save(); }));
    $('[data-clear]', root).addEventListener('click', () => { ta.value = conv.src = ''; run(); save(); ta.focus(); });
    $('[data-copy]', root).addEventListener('click', e => copyText(last.code, e.currentTarget));
    notesEl.addEventListener('click', e => { // jump to the original line
      const b = e.target.closest('[data-line]');
      if (!b) return;
      const L = Number(b.dataset.line);
      const lines = ta.value.split('\n');
      let s = 0;
      for (let k = 0; k < L - 1 && k < lines.length; k++) s += lines[k].length + 1;
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(s, s + (lines[L - 1] || '').length);
      const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
      ta.scrollTop = Math.max(0, (L - 4) * lh);
      ta.closest('.pane').scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    });
    syncRel();
    run();
    refreshers.push(run);
  }

  /* ---------- Date tool ---------- */
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  function parseDate(raw) { // returns Date, null (empty) or undefined (unknown format)
    const s = raw.trim();
    if (!s) return null;
    let m;
    if ((m = /^\/?Date\((-?\d+)([+-]\d{4})?\)\/?$/i.exec(s))) return new Date(Number(m[1]));
    if ((m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s))) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (/^\d{13}$/.test(s)) return new Date(Number(s));
    if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000);
    if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z'); return isNaN(d) ? undefined : d; }
    if ((m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s))) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return undefined;
  }
  function mountDates(root) {
    const inp = $('#date-input', root);
    const outEl = $('.date-out', root);
    function render() {
      const d = parseDate(inp.value);
      if (d === null) { outEl.innerHTML = `<p class="empty">${t('dateEmpty')}</p>`; return; }
      if (!d || isNaN(d)) { outEl.innerHTML = `<p class="date-err">${escHtml(t('dateErr'))}</p>`; return; }
      const Y = d.getUTCFullYear(), M = pad(d.getUTCMonth() + 1), D = pad(d.getUTCDate());
      const h = pad(d.getUTCHours()), mi = pad(d.getUTCMinutes()), se = pad(d.getUTCSeconds());
      const rows = [
        ['OData v2 (SuccessFactors)', `/Date(${d.getTime()})/`],
        ['ISO 8601 (UTC)', d.toISOString().replace('.000Z', 'Z')],
        ['ABAP DATS', `${pad(Y, 4)}${M}${D}`],
        ['ABAP TIMESTAMP (UTC)', `${pad(Y, 4)}${M}${D}${h}${mi}${se}`],
        ['Epoch (ms)', String(d.getTime())],
        [t('readable'), `${pad(Y, 4)}-${M}-${D} ${h}:${mi}:${se} UTC`],
      ];
      outEl.innerHTML = rows.map(([k, v]) => `<div class="date-row"><small>${k}</small><code>${escHtml(v)}</code><button type="button" class="btn small" data-v="${escHtml(v)}"><svg class="i"><use href="#i-copy"/></svg><span class="btn-label">${t('copy')}</span></button></div>`).join('');
    }
    inp.value = '/Date(1704067200000)/';
    inp.addEventListener('input', render);
    $('[data-now]', root).addEventListener('click', () => { inp.value = `/Date(${Date.now()})/`; render(); });
    $('[data-eot]', root).addEventListener('click', () => { inp.value = '99991231'; render(); });
    outEl.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) copyText(b.dataset.v, b); });
    render();
    refreshers.push(render);
  }

  const MOUNTS = { converter: mountConverter, dates: mountDates };
  setLang(lang, false);
  if (location.hash) fromHash();
})();
