/* AbapModernizer: rule-based converter from classic ABAP to modern ABAP (7.40+).
   No dependencies. Exposes global.AbapModernizer.convert(src, { release, inline }).

   How it works
   1. lex()      splits the source into statements, keeping comments and layout.
   2. analyze()  finds procedures (METHOD, FORM...) and DATA / FIELD-SYMBOLS declarations.
   3. RULES      run in order on every statement; the first rule that returns true wins.
   4. render()   rebuilds the source, replacing only the statements that changed.
   Every rule is conservative: when the semantics could change, the statement is left
   as it is and a note explains why. */
(function (global) {
  'use strict';

  /* ---------- Literals and mask ----------
     The mask has the same length as the code, with literal contents replaced by 'x',
     so regular expressions never match inside a literal. */
  function maskQuoted(s, i) {
    const q = s[i];
    let j = i + 1;
    while (j < s.length) {
      if (s[j] === q) {
        if (s[j + 1] === q) { j += 2; continue; }
        return [q + 'x'.repeat(j - i - 1) + q, j + 1];
      }
      if (s[j] === '\n') break;
      j++;
    }
    return [q + 'x'.repeat(j - i - 1), j];
  }

  function scanTemplate(s, i) { // i: right after the opening |
    let m = '';
    const n = s.length;
    while (i < n) {
      const c = s[i];
      if (c === '\\' && i + 1 < n) { m += 'xx'; i += 2; continue; }
      if (c === '|') return [m + '|', i + 1];
      if (c === '\n') return [m, i];
      if (c === '{') {
        m += '{'; i++;
        while (i < n) {
          const d = s[i];
          if (d === "'" || d === '`') { const [mm, j] = maskQuoted(s, i); m += mm; i = j; continue; }
          if (d === '|') { const [mm, j] = scanTemplate(s, i + 1); m += '|' + mm; i = j; continue; }
          if (d === '}') { m += '}'; i++; break; }
          m += d; i++;
        }
        continue;
      }
      m += 'x'; i++;
    }
    return [m, i];
  }

  function maskOf(s) {
    let m = '';
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === "'" || c === '`') { const [mm, j] = maskQuoted(s, i); m += mm; i = j; }
      else if (c === '|') { const [mm, j] = scanTemplate(s, i + 1); m += '|' + mm; i = j; }
      else { m += c; i++; }
    }
    return m;
  }

  function collapse(s) {
    const m = maskOf(s);
    let out = '';
    let sp = false;
    for (let i = 0; i < s.length; i++) {
      if (/\s/.test(m[i])) { sp = true; continue; }
      if (sp && out) out += ' ';
      sp = false;
      out += s[i];
    }
    return out;
  }

  // Top-level tokens: keeps literals, ( ), [ ] and { } groups together.
  function tokens(s) {
    const m = maskOf(s);
    const out = [];
    let depth = 0;
    let start = -1;
    for (let i = 0; i < s.length; i++) {
      const c = m[i];
      if (/\s/.test(c) && depth === 0) {
        if (start >= 0) { out.push(s.slice(start, i)); start = -1; }
        continue;
      }
      if (start < 0) start = i;
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    }
    if (start >= 0) out.push(s.slice(start));
    return out;
  }

  function splitTopCommas(s) {
    const m = maskOf(s);
    const out = [];
    let depth = 0;
    let last = 0;
    for (let i = 0; i < s.length; i++) {
      const c = m[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
      else if (c === ',' && depth === 0) { out.push(s.slice(last, i)); last = i + 1; }
    }
    out.push(s.slice(last));
    return out;
  }

  function replaceMasked(code, re, fn) {
    const mask = maskOf(code);
    const flags = re.flags.replace('g', '').replace('d', '') + 'gd';
    const g = new RegExp(re.source, flags);
    let out = '';
    let last = 0;
    let m;
    while ((m = g.exec(mask))) {
      const s = m.index;
      const e = s + m[0].length;
      const groups = m.indices.map(p => (p ? code.slice(p[0], p[1]) : undefined));
      out += code.slice(last, s) + fn(groups);
      last = e;
      if (m[0].length === 0) g.lastIndex++;
    }
    return out + code.slice(last);
  }

  const esc = s => s.replace(/[.*+?^${}()|[\]\\\/<>-]/g, '\\$&');
  const U = x => (x || '').toUpperCase();
  const same = (a, b) => U(a) === U(b);

  function refRegex(name) {
    const tail = name.startsWith('<') ? '' : '(?![\\w/])';
    return new RegExp('(^|[^\\w/\\-~>])' + esc(name) + tail, 'i');
  }

  /* ---------- Lexer: statements ---------- */
  function lex(src) {
    const items = [];
    const n = src.length;
    let i = 0;
    let pre = '';
    let line = 1;
    const col0 = k => k === 0 || src[k - 1] === '\n';
    const eol = k => { const e = src.indexOf('\n', k); return e === -1 ? n : e; };
    while (i < n) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n') { if (c === '\n') line++; pre += c; i++; continue; }
      if ((c === '*' && col0(i)) || c === '"') { const e = eol(i); pre += src.slice(i, e); i = e; continue; }
      const start = i;
      const indent = i - (src.lastIndexOf('\n', i - 1) + 1);
      const startLine = line;
      let buf = '';
      const comments = [];
      let done = false;
      while (i < n) {
        const d = src[i];
        if ((d === '*' && col0(i)) || d === '"') {
          const e = eol(i);
          comments.push(src.slice(i, e).trim());
          buf += ' ';
          i = e;
          continue;
        }
        if (d === "'" || d === '`') { const [, j] = maskQuoted(src, i); buf += src.slice(i, j); i = j; continue; }
        if (d === '|') { const [, j] = scanTemplate(src, i + 1); buf += src.slice(i, j); i = j; continue; }
        if (d === '\n') line++;
        if (d === '.') { i++; done = true; break; }
        buf += d;
        i++;
      }
      const raw = src.slice(start, i);
      const code = collapse(buf);
      items.push({ pre, raw, code, mask: maskOf(code), indent, line: startLine, comments, incomplete: !done || !code });
      pre = '';
    }
    return { items, tail: pre };
  }

  /* ---------- Analysis: procedures and declarations ---------- */
  function analyze(items) {
    let proc = 0;
    let counter = 0;
    let inDef = false;
    for (const it of items) {
      const u = U(it.code);
      if (/^(METHOD|FORM|FUNCTION|MODULE)\b/.test(u)) proc = ++counter;
      it.proc = proc;
      if (/^END(METHOD|FORM|FUNCTION|MODULE)\b/.test(u)) proc = 0;
      if ((/^CLASS \S+ DEFINITION\b/.test(u) || /^INTERFACE \S+$/.test(u)) && !/\b(DEFERRED|LOAD)\b/.test(u)) inDef = true;
      it.inDef = inDef;
      if (/^END(CLASS|INTERFACE)\b/.test(u)) inDef = false;
    }
  }

  function parseDecls(items) {
    const decls = new Map();
    items.forEach((it, idx) => {
      if (it.incomplete || it.inDef) return;
      const m = /^(DATA|FIELD-SYMBOLS)(:?)\s*(.*)$/i.exec(it.code);
      if (!m) return;
      if (/\bBEGIN OF\b/i.test(maskOf(m[3]))) return;
      const kind = U(m[1]) === 'DATA' ? 'data' : 'fs';
      const parts = splitTopCommas(m[3]).map(p => p.trim()).filter(Boolean);
      it.decl = { kind, kw: m[1], chained: m[2] === ':', parts: [] };
      for (const p of parts) {
        const pm = /^(<[\w\/]+>|[A-Za-z_\/][\w\/]*)\s+(TYPE|LIKE)\s+(.+)$/i.exec(p);
        const part = { text: p };
        it.decl.parts.push(part);
        if (!pm) continue;
        const spec = pm[3].toLowerCase();
        const name = pm[1].toLowerCase();
        const key = it.proc + ':' + name;
        const d = {
          name, key, kind, kw: U(pm[2]), spec, item: idx, part, proc: it.proc,
          noInline: /\b(value|read-only|occurs)\b|with header line/.test(maskOf(spec)),
        };
        if (decls.has(key)) decls.get(key).dup = true; else decls.set(key, d);
      }
    });
    return decls;
  }

  function computeUses(items, decls) {
    for (const d of decls.values()) {
      const re = refRegex(d.name);
      d.uses = [];
      items.forEach((it, idx) => {
        if (idx < d.item) return;
        if (idx === d.item) {
          const others = it.decl.parts.filter(p => p !== d.part).map(p => maskOf(p.text)).join(' ');
          if (re.test(others)) d.uses.push(idx);
          return;
        }
        if (re.test(it.mask)) d.uses.push(idx);
      });
      d.firstUse = d.uses.length ? d.uses[0] : null;
      const first = d.firstUse != null ? items[d.firstUse] : null;
      d.inlinable = !d.noInline && !d.dup && first != null && d.firstUse > d.item &&
        !/^(DATA|FIELD-SYMBOLS|TYPES|CONSTANTS|STATICS|CLASS-DATA)\b/i.test(first.code) &&
        d.uses.every(u => items[u].proc === d.proc);
    }
  }

  /* ---------- Notes shown to the user ---------- */
  const NOTES = {
    'inline': ['info', 'Inline declarations', 'DATA( ) and FIELD-SYMBOL( ) at first use. Only applied when the resulting type is identical to the declared one; the old declaration is removed.'],
    'read-exists': ['info', 'READ TABLE + sy-subrc → line_exists( )', 'The check becomes line_exists( ) and the read a table expression. line_exists( ) does not set sy-tabix.'],
    'read-optional': ['warn', 'READ TABLE → VALUE #( itab[ … ] OPTIONAL )', 'If the line is not found, the target becomes initial (READ TABLE left it unchanged) and sy-subrc is not set. Check the code that follows.'],
    'read-assign': ['info', 'READ TABLE … ASSIGNING → ASSIGN itab[ … ]', 'ASSIGN with a table expression sets sy-subrc as before and raises no exception when the line is missing.'],
    'read-binary': ['warn', 'BINARY SEARCH left unchanged', 'A table expression on a standard table searches linearly. To keep the performance, declare a SORTED secondary key and use itab[ KEY key COMPONENTS … ].'],
    'read-tabix': ['info', 'READ TABLE left unchanged: sy-tabix is used', 'The code that follows reads sy-tabix, which table expressions do not set. Alternative: line_index( itab[ … ] ).'],
    'read-subrc': ['info', 'READ TABLE left unchanged: sy-subrc', 'This sy-subrc pattern has no direct equivalent. Consider line_exists( ) or ASSIGN itab[ … ] TO FIELD-SYMBOL( ).'],
    'select': ['info', 'Strict Open SQL', 'Comma-separated fields, host variables escaped with @ and INTO at the end (7.40 SP08+). If you compare two columns without an alias, remove the @ that was added.'],
    'select-fae': ['warn', 'FOR ALL ENTRIES without an empty-table check', 'If the FOR ALL ENTRIES table is empty, the WHERE clause is ignored and every row is read. Add IF itab IS NOT INITIAL before the SELECT.'],
    'select-loop': ['info', 'SELECT … ENDSELECT', 'One database round trip per row. INTO TABLE followed by a LOOP usually performs better.'],
    'concat': ['info', 'CONCATENATE → string template | … | or &&', 'Equivalent to CONCATENATE without RESPECTING BLANKS: trailing blanks of type c fields are ignored, as before.'],
    'concat-lines': ['info', 'CONCATENATE LINES OF → concat_lines_of( )', 'The separator becomes a string literal so its blanks are kept.'],
    'concat-skip': ['info', 'CONCATENATE left unchanged', 'With RESPECTING BLANKS, IN BYTE MODE or a variable separator the result could change.'],
    'method': ['info', 'CALL METHOD → functional call', 'obj->method( … ). A single RECEIVING parameter becomes an assignment.'],
    'functional-exporting': ['info', 'Redundant EXPORTING', 'In a functional call that only passes importing parameters, EXPORTING can be omitted.'],
    'new': ['info', 'CREATE OBJECT → NEW', 'Instance operator NEW #( ) or NEW class( ).'],
    'move': ['info', 'MOVE → assignment', 'MOVE is obsolete; ?TO becomes ?= and EXACT becomes EXACT #( ).'],
    'move-corr': ['info', 'MOVE-CORRESPONDING → CORRESPONDING #( )', 'BASE keeps the target fields that have no match, as MOVE-CORRESPONDING did.'],
    'move-corr-tab': ['warn', 'MOVE-CORRESPONDING treated as a table', 'Inferred from the name prefix (lt_, gt_…). If it is a structure, use CORRESPONDING #( BASE ( target ) source ).'],
    'arith': ['info', 'ADD / SUBTRACT / MULTIPLY / DIVIDE', 'Obsolete statements replaced by arithmetic expressions.'],
    'arith754': ['info', 'ADD / SUBTRACT / MULTIPLY / DIVIDE → += -= *= /=', 'Calculation assignment operators, available from 7.54.'],
    'compound': ['info', 'x = x + y → x += y', 'Calculation assignment operators, available from 7.54.'],
    'lines': ['info', 'DESCRIBE TABLE … LINES → lines( )', ''],
    'case-fn': ['info', 'TRANSLATE → to_upper( ) / to_lower( )', ''],
    'condense': ['info', 'CONDENSE → condense( )', ''],
    'shift': ['info', 'SHIFT … DELETING LEADING → shift_left( )', ''],
    'refresh': ['info', 'REFRESH → CLEAR', 'REFRESH is obsolete; for tables without a header line, CLEAR does the same.'],
    'ref': ['info', 'GET REFERENCE OF → REF #( )', ''],
    'cond': ['info', 'IF / ELSE assignment → COND #( )', ''],
    'xsdbool': ['info', 'Boolean IF / ELSE → xsdbool( )', 'xsdbool( ) returns abap_true or abap_false (7.40 SP08+).'],
    'switch': ['info', 'CASE assignment → SWITCH #( )', ''],
    'value': ['info', 'CLEAR + fields + APPEND → VALUE #( )', 'The line is built inside the statement itself and the helper structure is no longer needed.'],
    'value-ext': ['warn', 'Helper structure not declared here', 'Its declaration is not in the snippet: check that it is not used outside the code you pasted.'],
    'relops': ['info', 'Relational operators', 'EQ, NE, GT, LT, GE, LE become =, <>, >, <, >=, <= and NOT x IS … becomes x IS NOT …'],
    'unused': ['info', 'Helper variable removed', 'It is no longer used after the conversion.'],
    'header': ['warn', 'Table with header line', 'OCCURS, WITH HEADER LINE, RANGES and LOOP AT without INTO are obsolete and are not converted automatically: declare a separate work area.'],
    'form': ['info', 'FORM / PERFORM', 'Subroutines are obsolete. In new code, use methods of a local class.'],
    'onchange': ['warn', 'ON CHANGE OF', 'Obsolete. Use AT NEW / AT END OF inside the LOOP or compare with the previous value.'],
  };

  // Spanish texts, used with convert(src, { lang: 'es' })
  const NOTES_ES = {
    'inline': ['info', 'Declaraciones inline', 'DATA( ) y FIELD-SYMBOL( ) en el primer uso. Solo se aplica cuando el tipo resultante es idéntico al declarado; la declaración previa se elimina.'],
    'read-exists': ['info', 'READ TABLE + sy-subrc → line_exists( )', 'La comprobación pasa a line_exists( ) y la lectura a una expresión de tabla. line_exists( ) no informa sy-tabix.'],
    'read-optional': ['warn', 'READ TABLE → VALUE #( itab[ … ] OPTIONAL )', 'Si la línea no existe, el destino queda inicial (READ TABLE lo dejaba como estaba) y no se informa sy-subrc. Revisa el código que venga después.'],
    'read-assign': ['info', 'READ TABLE … ASSIGNING → ASSIGN itab[ … ]', 'ASSIGN con expresión de tabla informa sy-subrc igual que antes y no lanza excepción si no encuentra la línea.'],
    'read-binary': ['warn', 'BINARY SEARCH: se deja como está', 'Una expresión de tabla sobre una tabla estándar busca de forma lineal. Para no perder rendimiento, declara una clave secundaria SORTED y usa itab[ KEY clave COMPONENTS … ].'],
    'read-tabix': ['info', 'READ TABLE sin convertir: se usa sy-tabix', 'El código posterior lee sy-tabix y las expresiones de tabla no lo informan. Alternativa: line_index( itab[ … ] ).'],
    'read-subrc': ['info', 'READ TABLE sin convertir: sy-subrc', 'Este patrón de sy-subrc no tiene un equivalente directo. Valora line_exists( ) o ASSIGN itab[ … ] TO FIELD-SYMBOL( ).'],
    'select': ['info', 'Open SQL estricto', 'Campos separados por comas, variables host con @ e INTO al final (7.40 SP08+). Si comparas dos columnas sin alias, quita la @ que se haya añadido.'],
    'select-fae': ['warn', 'FOR ALL ENTRIES sin comprobar la tabla', 'Si la tabla de FOR ALL ENTRIES está vacía se ignora el WHERE y se leen todas las filas. Añade IF itab IS NOT INITIAL antes del SELECT.'],
    'select-loop': ['info', 'SELECT … ENDSELECT', 'Hace un viaje a base de datos por fila. Suele rendir mejor INTO TABLE y un LOOP después.'],
    'concat': ['info', 'CONCATENATE → plantilla | … | o &&', 'Equivale a CONCATENATE sin RESPECTING BLANKS: los blancos finales de campos tipo c se ignoran igual que antes.'],
    'concat-lines': ['info', 'CONCATENATE LINES OF → concat_lines_of( )', 'El separador pasa a literal de tipo string para conservar los blancos.'],
    'concat-skip': ['info', 'CONCATENATE sin convertir', 'Con RESPECTING BLANKS, IN BYTE MODE o un separador variable el resultado podría cambiar.'],
    'method': ['info', 'CALL METHOD → llamada funcional', 'obj->metodo( … ). Si solo hay un RECEIVING, pasa a asignación.'],
    'functional-exporting': ['info', 'EXPORTING sobrante', 'En una llamada funcional que solo pasa parámetros de entrada, EXPORTING se puede omitir.'],
    'new': ['info', 'CREATE OBJECT → NEW', 'Operador de instanciación NEW #( ) o NEW clase( ).'],
    'move': ['info', 'MOVE → asignación', 'MOVE es obsoleto; ?TO pasa a ?= y EXACT a EXACT #( ).'],
    'move-corr': ['info', 'MOVE-CORRESPONDING → CORRESPONDING #( )', 'Con BASE se conservan los campos del destino que no coinciden, como hacía MOVE-CORRESPONDING.'],
    'move-corr-tab': ['warn', 'MOVE-CORRESPONDING tratado como tabla', 'Se ha deducido por el prefijo del nombre (lt_, gt_…). Si es una estructura, usa CORRESPONDING #( BASE ( destino ) origen ).'],
    'arith': ['info', 'ADD / SUBTRACT / MULTIPLY / DIVIDE', 'Sentencias obsoletas sustituidas por expresiones aritméticas.'],
    'arith754': ['info', 'ADD / SUBTRACT / MULTIPLY / DIVIDE → += -= *= /=', 'Operadores de asignación de cálculo, disponibles desde 7.54.'],
    'compound': ['info', 'x = x + y → x += y', 'Operadores de asignación de cálculo, disponibles desde 7.54.'],
    'lines': ['info', 'DESCRIBE TABLE … LINES → lines( )', ''],
    'case-fn': ['info', 'TRANSLATE → to_upper( ) / to_lower( )', ''],
    'condense': ['info', 'CONDENSE → condense( )', ''],
    'shift': ['info', 'SHIFT … DELETING LEADING → shift_left( )', ''],
    'refresh': ['info', 'REFRESH → CLEAR', 'REFRESH es obsoleto; en tablas sin cabecera CLEAR hace lo mismo.'],
    'ref': ['info', 'GET REFERENCE OF → REF #( )', ''],
    'cond': ['info', 'IF / ELSE de asignación → COND #( )', ''],
    'xsdbool': ['info', 'IF / ELSE booleano → xsdbool( )', 'xsdbool( ) devuelve abap_true o abap_false (7.40 SP08+).'],
    'switch': ['info', 'CASE de asignación → SWITCH #( )', ''],
    'value': ['info', 'CLEAR + campos + APPEND → VALUE #( )', 'La línea se construye dentro de la propia sentencia y la estructura auxiliar deja de hacer falta.'],
    'value-ext': ['warn', 'Estructura auxiliar no declarada aquí', 'No se ve su declaración en el fragmento: comprueba que no se use fuera de lo que has pegado.'],
    'relops': ['info', 'Operadores relacionales', 'EQ, NE, GT, LT, GE, LE pasan a =, <>, >, <, >=, <= y NOT x IS … pasa a x IS NOT …'],
    'unused': ['info', 'Variable auxiliar eliminada', 'Tras la conversión ya no se usa.'],
    'header': ['warn', 'Tabla con cabecera', 'OCCURS, WITH HEADER LINE, RANGES y LOOP AT sin INTO son obsoletos y no se convierten solos: declara un área de trabajo aparte.'],
    'form': ['info', 'FORM / PERFORM', 'Las subrutinas están obsoletas. En código nuevo, usa métodos de una clase local.'],
    'onchange': ['warn', 'ON CHANGE OF', 'Obsoleto. Usa AT NEW / AT END OF dentro del LOOP o compara con el valor anterior.'],
  };

  /* ---------- Rule helpers ---------- */
  const SUBRC_OK_IF = /^IF sy-subrc (=|EQ) 0$|^IF sy-subrc IS INITIAL$/i;
  const SUBRC_KO_IF = /^IF sy-subrc (<>|NE) 0$|^IF sy-subrc IS NOT INITIAL$|^IF NOT sy-subrc IS INITIAL$/i;
  const SUBRC_OK_CHECK = /^CHECK sy-subrc (=|EQ) 0$|^CHECK sy-subrc IS INITIAL$/i;
  const TABIX = /(^|[^\w-])sy-tabix\b/i;
  const SUBRC = /(^|[^\w-])sy-subrc\b/i;

  function free(x) {
    return !!x && !x.deleted && !x.out && !x.incomplete;
  }

  function blockEnd(items, j) {
    let depth = 0;
    for (let k = j; k < items.length; k++) {
      const u = U(items[k].code);
      if (/^IF\b/.test(u)) depth++;
      else if (/^ENDIF\b/.test(u)) { depth--; if (depth === 0) return k; }
    }
    return items.length - 1;
  }

  function pairsOf(body) {
    const t = tokens(body);
    if (!t.length || t.length % 3) return null;
    const out = [];
    for (let k = 0; k < t.length; k += 3) {
      if (t[k + 1] !== '=') return null;
      out.push([t[k], t[k + 2]]);
    }
    return out;
  }

  function fmtCall(prefix, name, sections, indent, max) {
    if (!sections.length) return [`${prefix}${name}( ).`];
    const onlyExp = sections.length === 1 && U(sections[0].kw) === 'EXPORTING';
    const flat = sections.map(s => (onlyExp ? '' : U(s.kw) + ' ') + s.body).join(' ');
    const one = `${prefix}${name}( ${flat} ).`;
    if (indent + one.length <= (max || 90) || sections.some(s => !s.pairs)) return [one];
    const open = `${prefix}${name}( `;
    const pad = ' '.repeat(open.length);
    const lines = [];
    sections.forEach((s, si) => {
      const kwp = onlyExp ? '' : U(s.kw) + ' ';
      s.pairs.forEach((pv, pi) => {
        const txt = `${pv[0]} = ${pv[1]}`;
        if (si === 0 && pi === 0) lines.push(open + kwp + txt);
        else if (pi === 0) lines.push(pad + kwp + txt);
        else lines.push(pad + ' '.repeat(kwp.length) + txt);
      });
    });
    lines[lines.length - 1] += ' ).';
    return lines;
  }

  function fmtCtor(head, parts, tail, indent) {
    const one = head + parts.join(' ') + tail;
    if (indent + one.length <= 90) return [one];
    const pad = ' '.repeat(head.length);
    const lines = parts.map((p, k) => (k ? pad : head) + p);
    lines[lines.length - 1] += tail;
    return lines;
  }

  function normCond(c) {
    let out = replaceMasked(c, /(\s)(EQ|NE|GT|LT|GE|LE)(?=\s)/i, g => g[1] + ({ EQ: '=', NE: '<>', GT: '>', LT: '<', GE: '>=', LE: '<=' })[U(g[2])]);
    out = replaceMasked(out, /(^|[\s(])(NOT) ([^\s()]+) (IS) (?!NOT\b)/i, g => `${g[1]}${g[3]} ${g[4]} ${g[2]} `);
    return out;
  }

  function itabLine(ctx, proc, itab) {
    const k = itab.toLowerCase();
    const d = ctx.decls.get(proc + ':' + k) || ctx.decls.get('0:' + k);
    if (!d || d.kind !== 'data' || d.kw !== 'TYPE') return null;
    let m = /^(?:(?:standard|sorted|hashed) )?table of ([\w\/]+)/.exec(d.spec);
    if (m) return { line: m[1] };
    m = /^([\w\/]+)$/.exec(d.spec);
    return m ? { tt: m[1] } : null;
  }

  function matchesLine(ctx, proc, itab, v) {
    if (v.kw === 'LIKE') return v.spec === 'line of ' + itab.toLowerCase();
    const L = itabLine(ctx, proc, itab);
    if (!L) return false;
    return L.line ? v.spec === L.line : v.spec === 'line of ' + L.tt;
  }

  function hostify(tok) {
    if (!tok || tok[0] === '@' || tok.includes('~') || /^NULL$/i.test(tok)) return tok;
    if (/^(<[\w\/]+>|[A-Za-z_\/][\w\/]*)((?:-|->|=>)[\w\/]+)*$/.test(tok)) return '@' + tok;
    return tok;
  }

  const CMP = new Set(['=', 'EQ', '<>', 'NE', '<', 'LT', '>', 'GT', '<=', 'LE', '>=', 'GE', 'LIKE', 'IN']);
  const isGroup = x => x.startsWith('(') && x.endsWith(')');
  function escapeCond(toks) {
    const out = [];
    for (let k = 0; k < toks.length; k++) {
      const x = toks[k];
      const u = U(x);
      if (isGroup(x)) { out.push('( ' + escapeCond(tokens(x.slice(1, -1).trim())) + ' )'); continue; }
      out.push(x);
      if (CMP.has(u) && k + 1 < toks.length) {
        const nx = toks[k + 1];
        if (u === 'IN' && isGroup(nx)) out.push('( ' + splitTopCommas(nx.slice(1, -1)).map(p => hostify(p.trim())).join(', ') + ' )');
        else out.push(hostify(nx));
        k++;
      } else if (u === 'BETWEEN' && k + 3 < toks.length) {
        out.push(hostify(toks[k + 1]), toks[k + 2], hostify(toks[k + 3]));
        k += 3;
      }
    }
    return out.join(' ');
  }

  function commaList(toks, attach) {
    const out = [];
    for (let q = 0; q < toks.length; q++) {
      const u = U(toks[q]);
      if (u === 'AS' && out.length && q + 1 < toks.length) { out[out.length - 1] += ` AS ${toks[q + 1]}`; q++; continue; }
      if (attach && (u === 'ASCENDING' || u === 'DESCENDING') && out.length) { out[out.length - 1] += ' ' + u; continue; }
      out.push(toks[q]);
    }
    return out.join(', ');
  }

  function literalText(tok) { // content of a '…' or `…` literal; null if it is not a literal
    if (/^'.*'$/s.test(tok) && tok.length >= 2) return { kind: 'c', text: tok.slice(1, -1).replace(/''/g, "'") };
    if (/^`.*`$/s.test(tok) && tok.length >= 2) return { kind: 's', text: tok.slice(1, -1).replace(/``/g, '`') };
    return null;
  }
  const tplEsc = s => s.replace(/[\\|{}]/g, '\\$&');
  const strLit = s => '`' + s.replace(/`/g, '``') + '`';

  /* ---------- Multi-statement rules ---------- */
  function parseRead(code) {
    const t = tokens(code);
    if (U(t[0]) !== 'READ' || U(t[1]) !== 'TABLE' || !t[2]) return null;
    const r = { itab: t[2].replace(/\[\]$/, ''), mode: null, target: null, key: null, index: null, binary: false };
    const KW = /^(INTO|ASSIGNING|REFERENCE|TRANSPORTING|WITH|INDEX|BINARY|USING|COMPARING|FROM|CASTING)$/i;
    let k = 3;
    while (k < t.length) {
      const u = U(t[k]);
      if (u === 'INTO') { r.mode = 'into'; r.target = t[k + 1]; k += 2; }
      else if (u === 'ASSIGNING') { r.mode = 'assign'; r.target = t[k + 1]; k += 2; }
      else if (u === 'TRANSPORTING' && U(t[k + 1]) === 'NO' && U(t[k + 2]) === 'FIELDS') { r.mode = 'none'; k += 3; }
      else if (u === 'WITH' && U(t[k + 1]) === 'KEY') {
        k += 2;
        const kt = [];
        while (k < t.length && !KW.test(t[k])) kt.push(t[k++]);
        if (!kt.length || kt.length % 3) return null;
        const pairs = [];
        for (let q = 0; q < kt.length; q += 3) {
          if (!/^(=|EQ)$/i.test(kt[q + 1]) || kt[q][0] === '(') return null;
          pairs.push(`${kt[q]} = ${kt[q + 2]}`);
        }
        r.key = pairs.join(' ');
      }
      else if (u === 'INDEX') { r.index = t[k + 1]; k += 2; }
      else if (u === 'BINARY' && U(t[k + 1]) === 'SEARCH') { r.binary = true; k += 2; }
      else return null;
    }
    if (!r.mode || (!r.key && r.index == null) || (r.key && r.index != null)) return null;
    if (r.mode !== 'none' && !r.target) return null;
    if (r.target && r.target.includes('(')) {
      if (!/^(DATA|FIELD-SYMBOL)\((<?[\w\/]+>?)\)$/i.test(r.target)) return null;
      r.preInline = true;
    }
    return r;
  }

  function ruleRead(it, i, ctx) {
    if (!/^READ TABLE /i.test(it.code)) return false;
    const p = parseRead(it.code);
    if (!p) return false;
    if (p.binary) { ctx.note('read-binary', it.line); return true; }
    const { items } = ctx;
    const expr = p.index != null ? `${p.itab}[ ${p.index} ]` : `${p.itab}[ ${p.key} ]`;
    const nx = items[i + 1];
    const nxFree = free(nx);
    const okIf = nxFree && SUBRC_OK_IF.test(nx.code);
    const koIf = nxFree && SUBRC_KO_IF.test(nx.code);
    const okCheck = nxFree && SUBRC_OK_CHECK.test(nx.code);
    const end = okIf || koIf ? blockEnd(items, i + 1) : Math.min(items.length - 1, i + 5);
    for (let k = i + 1; k <= end; k++) {
      if (TABIX.test(items[k].mask)) { ctx.note('read-tabix', it.line); return true; }
    }
    const lineCheck = d => matchesLine(ctx, it.proc, p.itab, d);

    if (p.mode === 'none') {
      if (okIf || koIf) {
        ctx.set(i, [`IF ${koIf ? 'NOT ' : ''}line_exists( ${expr} ).`]);
        ctx.del(i + 1, i);
        ctx.note('read-exists', it.line);
        return true;
      }
      if (okCheck) {
        ctx.set(i, [`CHECK line_exists( ${expr} ).`]);
        ctx.del(i + 1, i);
        ctx.note('read-exists', it.line);
        return true;
      }
      return true;
    }

    if (p.mode === 'assign') {
      let tgt = p.target;
      if (!p.preInline) tgt = ctx.tryInline(p.target, i, d => d.kind === 'fs' && lineCheck(d)) || p.target;
      ctx.set(i, [`ASSIGN ${expr} TO ${tgt}.`]);
      ctx.note('read-assign', it.line);
      return true;
    }

    // INTO
    let tgt = p.target;
    if (okIf || okCheck) {
      if (!p.preInline) tgt = ctx.tryInline(p.target, i, d => d.kind === 'data' && lineCheck(d)) || p.target;
      if (okIf) ctx.set(i, [`IF line_exists( ${expr} ).`, `  ${tgt} = ${expr}.`]);
      else ctx.set(i, [`CHECK line_exists( ${expr} ).`, `${tgt} = ${expr}.`]);
      ctx.del(i + 1, i);
      ctx.note('read-exists', it.line);
      return true;
    }
    if (koIf || p.preInline) { ctx.note('read-subrc', it.line); return true; }
    for (let k = i + 1; k <= Math.min(items.length - 1, i + 3); k++) {
      if (SUBRC.test(items[k].mask)) { ctx.note('read-subrc', it.line); return true; }
    }
    ctx.set(i, [`${p.target} = VALUE #( ${expr} OPTIONAL ).`]);
    ctx.note('read-optional', it.line);
    return true;
  }

  function asgOf(x) {
    if (!free(x)) return null;
    const t = tokens(x.code);
    if (t.length < 3 || t[1] !== '=' || /^(DATA|FINAL|FIELD-SYMBOL)\(/i.test(t[0])) return null;
    if (/^(IF|ELSEIF|CHECK|WHILE|WHEN|CASE)$/i.test(t[0])) return null;
    return { tgt: t[0], val: t.slice(2).join(' ') };
  }

  function ruleIfCond(it, i, ctx) {
    const m = /^IF (.+)$/i.exec(it.code);
    if (!m) return false;
    const { items } = ctx;
    let k = i;
    let cond = m[1];
    let target = null;
    let elseVal = null;
    const br = [];
    for (;;) {
      const a = asgOf(items[k + 1]);
      if (!a || (target && !same(a.tgt, target))) return false;
      target = target || a.tgt;
      br.push({ cond, val: a.val });
      const nx = items[k + 2];
      if (!free(nx)) return false;
      const mm = /^ELSEIF (.+)$/i.exec(nx.code);
      if (mm) { cond = mm[1]; k += 2; continue; }
      if (!/^ELSE$/i.test(nx.code)) return false;
      const e = asgOf(items[k + 3]);
      const end = items[k + 4];
      if (!e || !same(e.tgt, target) || !free(end) || !/^ENDIF$/i.test(end.code)) return false;
      elseVal = e.val;
      k += 4;
      break;
    }
    const T = /^(abap_true|'X')$/i;
    const F = /^(abap_false|space|' '|''|``)$/i;
    let lines;
    if (br.length === 1 && T.test(br[0].val) && F.test(elseVal)) {
      lines = [`${target} = xsdbool( ${normCond(br[0].cond)} ).`];
      ctx.note('xsdbool', it.line);
    } else if (br.length === 1 && F.test(br[0].val) && T.test(elseVal)) {
      lines = [`${target} = xsdbool( NOT ( ${normCond(br[0].cond)} ) ).`];
      ctx.note('xsdbool', it.line);
    } else {
      const parts = br.map(b => `WHEN ${normCond(b.cond)} THEN ${b.val}`).concat(`ELSE ${elseVal}`);
      lines = fmtCtor(`${target} = COND #( `, parts, ' ).', it.indent);
      ctx.note('cond', it.line);
    }
    ctx.set(i, lines);
    for (let q = i + 1; q <= k; q++) ctx.del(q, i);
    return true;
  }

  function ruleCaseSwitch(it, i, ctx) {
    const m = /^CASE (.+)$/i.exec(it.code);
    if (!m) return false;
    const { items } = ctx;
    let k = i + 1;
    let target = null;
    let other = null;
    const br = [];
    for (;;) {
      const w = items[k];
      if (!free(w)) return false;
      const wt = tokens(w.code);
      if (U(wt[0]) !== 'WHEN' || wt.length !== 2) return false;
      const a = asgOf(items[k + 1]);
      if (!a || (target && !same(a.tgt, target))) return false;
      target = target || a.tgt;
      if (U(wt[1]) === 'OTHERS') { other = a.val; k += 2; break; }
      br.push({ when: wt[1], val: a.val });
      k += 2;
    }
    const end = items[k];
    if (!br.length || other == null || !free(end) || !/^ENDCASE$/i.test(end.code)) return false;
    const parts = br.map(b => `WHEN ${b.when} THEN ${b.val}`).concat(`ELSE ${other}`);
    ctx.set(i, fmtCtor(`${target} = SWITCH #( ${m[1]} `, parts, ' ).', it.indent));
    for (let q = i + 1; q <= k; q++) ctx.del(q, i);
    ctx.note('switch', it.line);
    return true;
  }

  function findValueBlock(items, i, wa) {
    const x0 = items[i];
    if (!x0 || x0.deleted || x0.out || !new RegExp('^CLEAR ' + esc(wa) + '$', 'i').test(x0.code)) return null;
    const re = refRegex(wa.toLowerCase());
    const compRe = new RegExp('^' + esc(wa) + '-([\\w\\/]+) = (.+)$', 'i');
    const comps = [];
    let k = i + 1;
    for (; k < items.length; k++) {
      const x = items[k];
      if (!free(x)) return null;
      let mm = compRe.exec(x.code);
      if (!mm) {
        const t = tokens(x.code);
        const tm = t.length === 4 && U(t[0]) === 'MOVE' && U(t[2]) === 'TO' && new RegExp('^' + esc(wa) + '-([\\w\\/]+)$', 'i').exec(t[3]);
        if (tm) mm = [null, tm[1], t[1]];
      }
      if (!mm) break;
      if (re.test(maskOf(mm[2]))) return null;
      comps.push([mm[1], mm[2]]);
    }
    if (!comps.length) return null;
    const fin = items[k];
    if (!free(fin)) return null;
    const a = new RegExp('^APPEND ' + esc(wa) + ' TO (\\S+)$', 'i').exec(fin.code);
    const ins = new RegExp('^INSERT ' + esc(wa) + ' INTO TABLE (\\S+)$', 'i').exec(fin.code);
    if (!a && !ins) return null;
    return { start: i, end: k, comps, kw: a ? 'APPEND' : 'INSERT', tail: a ? ` ) TO ${a[1]}.` : ` ) INTO TABLE ${ins[1]}.` };
  }

  function ruleValueAppend(it, i, ctx) {
    const m = /^CLEAR ([A-Za-z_\/][\w\/]*)$/i.exec(it.code);
    if (!m) return false;
    const wa = m[1];
    const blk = findValueBlock(ctx.items, i, wa);
    if (!blk) return false;
    const key = it.proc + ':' + wa.toLowerCase();
    if (!ctx.waOk.has(key)) {
      // the work area may only be used as a helper inside convertible blocks
      const re = refRegex(wa.toLowerCase());
      let ok = true;
      for (let k = 0; k < ctx.items.length && ok; k++) {
        const x = ctx.items[k];
        if (x.proc !== it.proc || !re.test(x.mask)) continue;
        if (x.decl) continue;
        const b = findValueBlock(ctx.items, k, wa);
        if (b) { k = b.end; continue; }
        ok = false;
      }
      ctx.waOk.set(key, ok);
      if (ok && !ctx.decls.has(key) && !ctx.decls.has('0:' + wa.toLowerCase())) ctx.note('value-ext', it.line);
    }
    if (!ctx.waOk.get(key)) return false;
    const parts = blk.comps.map(([c, v]) => `${c} = ${v}`);
    ctx.set(i, fmtCtor(`${blk.kw} VALUE #( `, parts, blk.tail, it.indent));
    for (let q = i + 1; q <= blk.end; q++) ctx.del(q, i);
    ctx.note('value', it.line);
    return true;
  }

  /* ---------- Single-statement rules ---------- */
  function ruleSelect(it, i, ctx) {
    if (!/^SELECT\b/i.test(it.code)) return false;
    if (/@/.test(it.mask)) return false;
    const t = tokens(it.code);
    if (U(t[1]) === 'FROM') return false;
    if (t.slice(1).some(x => /\bSELECT\b/i.test(maskOf(x)))) return false;
    if (t.some(x => /^(CLIENT|CONNECTION|PACKAGE|UNION|BYPASSING|USING|%_HINTS)$/i.test(x))) return false;
    let k = 1;
    const head = [];
    if (U(t[k]) === 'SINGLE') {
      head.push('SINGLE'); k++;
      if (U(t[k]) === 'FOR' && U(t[k + 1]) === 'UPDATE') { head.push('FOR UPDATE'); k += 2; }
    }
    if (U(t[k]) === 'DISTINCT') { head.push('DISTINCT'); k++; }
    const cl = { fields: [] };
    let cur = 'fields';
    while (k < t.length) {
      const u = U(t[k]);
      let nc = null;
      let skip = 1;
      if (u === 'FROM') nc = 'from';
      else if (u === 'INTO' || u === 'APPENDING') { nc = 'into'; cl.intoKw = u; }
      else if (u === 'WHERE') nc = 'where';
      else if (u === 'GROUP' && U(t[k + 1]) === 'BY') { nc = 'group'; skip = 2; }
      else if (u === 'HAVING') nc = 'having';
      else if (u === 'ORDER' && U(t[k + 1]) === 'BY') { nc = 'order'; skip = 2; }
      else if (u === 'UP' && U(t[k + 1]) === 'TO') { nc = 'upto'; skip = 2; }
      else if (u === 'FOR' && U(t[k + 1]) === 'ALL' && U(t[k + 2]) === 'ENTRIES' && U(t[k + 3]) === 'IN') { nc = 'fae'; skip = 4; }
      if (nc) {
        if (cl[nc]) return false;
        cl[nc] = [];
        cur = nc;
        k += skip;
        continue;
      }
      cl[cur].push(t[k]);
      k++;
    }
    if (!cl.fields.length || !cl.from || !cl.from.length || !cl.into || !cl.into.length) return false;
    if (cl.upto && (cl.upto.length !== 2 || U(cl.upto[1]) !== 'ROWS')) return false;
    if (cl.fae && cl.fae.length !== 1) return false;
    if (cl.fields.some(f => f.endsWith(','))) return false;

    const fields = cl.fields.length === 1 && cl.fields[0] === '*' ? '*' : commaList(cl.fields, false);
    const tgt = cl.into[cl.into.length - 1];
    const pre = cl.into.slice(0, -1);
    if (pre.some(x => !/^(CORRESPONDING|FIELDS|OF|TABLE)$/i.test(x))) return false;
    let tgtOut;
    if (isGroup(tgt)) {
      const inner = tgt.slice(1, -1);
      const parts = (inner.includes(',') ? splitTopCommas(inner) : tokens(inner)).map(p => p.trim()).filter(Boolean);
      tgtOut = '( ' + parts.map(p => (p[0] === '@' ? p : '@' + p)).join(', ') + ' )';
    } else {
      let inl = null;
      if (head[0] === 'SINGLE' && fields === '*' && cl.from.length === 1 && !pre.length) {
        const tab = cl.from[0].toLowerCase();
        inl = ctx.tryInline(tgt, i, d => d.kind === 'data' && d.kw === 'TYPE' && d.spec === tab);
      }
      tgtOut = '@' + (inl || tgt);
    }

    const l1 = ['SELECT', ...head, fields].join(' ');
    const cls = [`FROM ${escapeCond(cl.from)}`];
    if (cl.fae) cls.push(`FOR ALL ENTRIES IN ${hostify(cl.fae[0])}`);
    let whereStr = null;
    if (cl.where) { whereStr = escapeCond(cl.where); cls.push(`WHERE ${whereStr}`); }
    if (cl.group) cls.push(`GROUP BY ${commaList(cl.group, false)}`);
    if (cl.having) cls.push(`HAVING ${escapeCond(cl.having)}`);
    if (cl.order) cls.push(`ORDER BY ${/^PRIMARY KEY$/i.test(cl.order.join(' ')) ? 'PRIMARY KEY' : commaList(cl.order, true)}`);
    cls.push(`${cl.intoKw} ${[...pre.map(U), tgtOut].join(' ')}`);
    if (cl.upto) cls.push(`UP TO ${/^\d+$/.test(cl.upto[0]) ? cl.upto[0] : hostify(cl.upto[0])} ROWS`);

    const one = [l1, ...cls].join(' ') + '.';
    let lines;
    if (it.indent + one.length <= 80) lines = [one];
    else {
      lines = [l1];
      for (const c of cls) {
        if (c.startsWith('WHERE ') && c.length > 60) {
          const wt = tokens(whereStr);
          let curL = '  WHERE';
          for (const w of wt) {
            if (/^(AND|OR)$/i.test(w)) { lines.push(curL); curL = '    ' + U(w); }
            else curL += ' ' + w;
          }
          lines.push(curL);
        } else lines.push('  ' + c);
      }
      lines[lines.length - 1] += '.';
    }
    ctx.set(i, lines);
    ctx.note('select', it.line);
    if (cl.fae) {
      const itab = esc(cl.fae[0]);
      const guard = new RegExp(`${itab} IS NOT INITIAL|NOT ${itab} IS INITIAL|lines\\( ${itab} \\)`, 'i');
      let found = false;
      for (let q = i - 1; q >= Math.max(0, i - 8); q--) {
        if (guard.test(ctx.items[q].code) || (ctx.items[q].out && guard.test(ctx.items[q].out.code))) { found = true; break; }
      }
      if (!found) ctx.note('select-fae', it.line);
    }
    if (!head.includes('SINGLE') && !pre.some(x => U(x) === 'TABLE')) ctx.note('select-loop', it.line);
    return true;
  }

  function ruleLoop(it, i, ctx) {
    if (!/^LOOP AT /i.test(it.code)) return false;
    const t = tokens(it.code);
    if (t.length === 3 && !/^SCREEN$/i.test(t[2])) { ctx.note('header', it.line); return true; }
    if (t.some(x => U(x) === 'GROUP')) return false;
    const ki = t.findIndex((x, k) => k > 2 && /^(INTO|ASSIGNING)$/i.test(x) && U(t[k - 1]) !== 'REFERENCE');
    if (ki < 0) return false;
    const tgt = t[ki + 1];
    if (!tgt || tgt.includes('(') || U(t[ki + 2]) === 'CASTING') return false;
    const wantFs = U(t[ki]) === 'ASSIGNING';
    const inl = ctx.tryInline(tgt, i, d => (wantFs ? d.kind === 'fs' : d.kind === 'data') && matchesLine(ctx, it.proc, t[2], d));
    if (!inl) return false;
    const nt = t.slice();
    nt[ki + 1] = inl;
    ctx.set(i, [nt.join(' ') + '.']);
    return true;
  }

  function ruleCatch(it, i, ctx) {
    const m = /^CATCH (\S+) INTO (\S+)$/i.exec(it.code);
    if (!m || /^BEFORE$/i.test(m[1])) return false;
    const inl = ctx.tryInline(m[2], i, d => d.kind === 'data' && d.spec === 'ref to ' + m[1].toLowerCase());
    if (!inl) return false;
    ctx.set(i, [`CATCH ${m[1]} INTO ${inl}.`]);
    return true;
  }

  function ruleCondStmt(it, i, ctx) {
    const m = /^(IF|ELSEIF|CHECK|WHILE) (.+)$/i.exec(it.code);
    if (!m) return false;
    const n = normCond(m[2]);
    if (n === m[2]) return false;
    ctx.set(i, [`${m[1]} ${n}.`]);
    ctx.note('relops', it.line);
    return true;
  }

  function ruleMove(it, i, ctx) {
    const t = tokens(it.code);
    if (U(t[0]) !== 'MOVE') return false;
    if (t.length === 4 && U(t[2]) === 'TO') ctx.set(i, [`${t[3]} = ${t[1]}.`]);
    else if (t.length === 4 && U(t[2]) === '?TO') ctx.set(i, [`${t[3]} ?= ${t[1]}.`]);
    else if (t.length === 5 && U(t[1]) === 'EXACT' && U(t[3]) === 'TO') ctx.set(i, [`${t[4]} = EXACT #( ${t[2]} ).`]);
    else return false;
    ctx.note('move', it.line);
    return true;
  }

  function ruleMoveCorr(it, i, ctx) {
    const t = tokens(it.code);
    if (U(t[0]) !== 'MOVE-CORRESPONDING' || U(t[2]) !== 'TO') return false;
    const rest = t.slice(4).map(U).join(' ');
    if (rest && rest !== 'KEEPING TARGET LINES') return false;
    const src = t[1];
    const dst = t[3];
    const looksTable = /^(lt|gt|it|et|ct|rt|mt)_/i.test(dst) || /_(tab|tt)$/i.test(dst);
    if (looksTable && !rest) {
      ctx.set(i, [`${dst} = CORRESPONDING #( ${src} ).`]);
      ctx.note('move-corr-tab', it.line);
    } else {
      ctx.set(i, [`${dst} = CORRESPONDING #( BASE ( ${dst} ) ${src} ).`]);
    }
    ctx.note('move-corr', it.line);
    return true;
  }

  function ruleArith(it, i, ctx) {
    const t = tokens(it.code);
    if (t.length !== 4) return false;
    const u = U(t[0]);
    let x, y, op;
    if (u === 'ADD' && U(t[2]) === 'TO') { x = t[3]; y = t[1]; op = '+'; }
    else if (u === 'SUBTRACT' && U(t[2]) === 'FROM') { x = t[3]; y = t[1]; op = '-'; }
    else if (u === 'MULTIPLY' && U(t[2]) === 'BY') { x = t[1]; y = t[3]; op = '*'; }
    else if (u === 'DIVIDE' && U(t[2]) === 'BY') { x = t[1]; y = t[3]; op = '/'; }
    else return false;
    if (ctx.opts.release >= 754) { ctx.set(i, [`${x} ${op}= ${y}.`]); ctx.note('arith754', it.line); }
    else { ctx.set(i, [`${x} = ${x} ${op} ${y}.`]); ctx.note('arith', it.line); }
    return true;
  }

  function ruleCompound(it, i, ctx) {
    if (ctx.opts.release < 754) return false;
    const t = tokens(it.code);
    if (t.length !== 5 || t[1] !== '=' || !same(t[0], t[2]) || !['+', '-', '*', '/'].includes(t[3])) return false;
    ctx.set(i, [`${t[0]} ${t[3]}= ${t[4]}.`]);
    ctx.note('compound', it.line);
    return true;
  }

  function ruleCreateObject(it, i, ctx) {
    const t = tokens(it.code);
    if (U(t[0]) !== 'CREATE' || U(t[1]) !== 'OBJECT' || !t[2]) return false;
    const target = t[2];
    let k = 3;
    let cls = null;
    if (U(t[k]) === 'TYPE') { cls = t[k + 1]; k += 2; if (!cls || cls[0] === '(') return false; }
    let body = '';
    if (k < t.length) {
      if (U(t[k]) !== 'EXPORTING') return false;
      body = t.slice(k + 1).join(' ');
      if (/\bEXCEPTIONS\b/i.test(maskOf(body))) return false;
    }
    let tgt = target;
    let name = `NEW ${cls || '#'}`;
    const inl = ctx.tryInline(target, i, d => {
      if (d.kind !== 'data') return false;
      const mm = /^ref to ([\w\/]+)$/.exec(d.spec);
      if (!mm || /(^|\/)[zy]?if_/.test(mm[1])) return false;
      return !cls || mm[1] === cls.toLowerCase();
    });
    if (inl) {
      tgt = inl;
      const d = ctx.decls.get(it.proc + ':' + target.toLowerCase());
      name = `NEW ${cls || /ref to\s+(\S+)$/i.exec(d.part.text)[1]}`;
    }
    const sections = body ? [{ kw: 'EXPORTING', body, pairs: pairsOf(body) }] : [];
    ctx.set(i, fmtCall(`${tgt} = `, name, sections, it.indent));
    ctx.note('new', it.line);
    return true;
  }

  const SECT = /^(EXPORTING|IMPORTING|CHANGING|RECEIVING|EXCEPTIONS)$/i;
  function ruleCallMethod(it, i, ctx) {
    if (!/^CALL METHOD /i.test(it.code)) return false;
    const t = tokens(it.code);
    const name = t[2];
    if (!name || name[0] === '(' || /(->|=>)\(/.test(name)) return false;
    if (name.includes('(')) {
      if (t.length !== 3) return false;
      ctx.set(i, [`${name}.`]);
      ctx.note('method', it.line);
      return true;
    }
    const sections = [];
    for (let k = 3; k < t.length; k++) {
      if (SECT.test(t[k])) sections.push({ kw: U(t[k]), toks: [] });
      else if (!sections.length) return false;
      else sections[sections.length - 1].toks.push(t[k]);
    }
    for (const s of sections) { s.body = s.toks.join(' '); s.pairs = pairsOf(s.body); }
    const rec = sections.find(s => s.kw === 'RECEIVING');
    const others = sections.filter(s => s.kw !== 'RECEIVING');
    if (rec && rec.pairs && rec.pairs.length === 1 && others.every(s => s.kw === 'EXPORTING')) {
      ctx.set(i, fmtCall(`${rec.pairs[0][1]} = `, name, others, it.indent));
    } else {
      ctx.set(i, fmtCall('', name, sections, it.indent));
    }
    ctx.note('method', it.line);
    return true;
  }

  function ruleFunctionalExporting(it, i, ctx) {
    const m = /^([\w\/~<>-]+(?:(?:->|=>)[\w\/~]+)*)\( EXPORTING (.+) \)$/i.exec(it.code);
    if (!m) return false;
    if (tokens(m[2]).some(x => SECT.test(x))) return false;
    ctx.set(i, [`${m[1]}( ${m[2]} ).`]);
    ctx.note('functional-exporting', it.line);
    return true;
  }

  function ruleConcat(it, i, ctx) {
    const t = tokens(it.code);
    if (U(t[0]) !== 'CONCATENATE') return false;
    if (t.some(x => /^(RESPECTING|IN)$/i.test(x))) { ctx.note('concat-skip', it.line); return true; }
    const strCheck = d => d.kind === 'data' && d.kw === 'TYPE' && d.spec === 'string';
    if (U(t[1]) === 'LINES' && U(t[2]) === 'OF') {
      if (U(t[4]) !== 'INTO') return false;
      let sep = null;
      if (t.length === 9 && U(t[6]) === 'SEPARATED' && U(t[7]) === 'BY') sep = t[8];
      else if (t.length !== 6) return false;
      let sepArg = '';
      if (sep) {
        const L = literalText(sep);
        if (/^space$/i.test(sep)) sepArg = ' sep = ` `';
        else if (L) sepArg = ` sep = ${strLit(L.text)}`;
        else { ctx.note('concat-skip', it.line); return true; }
      }
      const tg = ctx.tryInline(t[5], i, strCheck) || t[5];
      ctx.set(i, [`${tg} = concat_lines_of( table = ${t[3]}${sepArg} ).`]);
      ctx.note('concat-lines', it.line);
      return true;
    }
    const ki = t.findIndex((x, k) => k > 0 && U(x) === 'INTO');
    if (ki < 2) return false;
    const ops = t.slice(1, ki);
    const target = t[ki + 1];
    const rest = t.slice(ki + 2);
    let sepTxt = '';
    if (rest.length) {
      if (rest.length !== 3 || U(rest[0]) !== 'SEPARATED' || U(rest[1]) !== 'BY') return false;
      const L = literalText(rest[2]);
      if (/^space$/i.test(rest[2])) sepTxt = ' ';
      else if (L) sepTxt = tplEsc(L.text);
      else { ctx.note('concat-skip', it.line); return true; }
    }
    const hasLit = ops.some(o => literalText(o) || /^space$/i.test(o));
    let rhs;
    if (!rest.length && !hasLit) {
      rhs = ops.join(' && ');
    } else {
      const parts = ops.map(o => {
        if (/^space$/i.test(o)) return '';
        const L = literalText(o);
        if (L) return tplEsc(L.kind === 'c' ? L.text.replace(/ +$/, '') : L.text);
        return `{ ${o} }`;
      });
      rhs = '|' + parts.join(sepTxt) + '|';
    }
    const tg = ctx.tryInline(target, i, strCheck) || target;
    ctx.set(i, [`${tg} = ${rhs}.`]);
    ctx.note('concat', it.line);
    return true;
  }

  function ruleSimple(it, i, ctx) {
    const t = tokens(it.code);
    const u0 = U(t[0]);
    const set = (lines, note) => { ctx.set(i, lines); ctx.note(note, it.line); return true; };
    if (u0 === 'DESCRIBE' && t.length === 5 && U(t[1]) === 'TABLE' && U(t[3]) === 'LINES') {
      const tg = ctx.tryInline(t[4], i, d => d.kind === 'data' && d.kw === 'TYPE' && /^(i|int4|sy-tfill|sy-tabix|syst-tfill)$/.test(d.spec)) || t[4];
      return set([`${tg} = lines( ${t[2]} ).`], 'lines');
    }
    if (u0 === 'TRANSLATE' && t.length === 5 && U(t[2]) === 'TO' && U(t[4]) === 'CASE' && /^(UPPER|LOWER)$/i.test(t[3])) {
      return set([`${t[1]} = to_${t[3].toLowerCase()}( ${t[1]} ).`], 'case-fn');
    }
    if (u0 === 'CONDENSE' && t.length === 2) return set([`${t[1]} = condense( ${t[1]} ).`], 'condense');
    if (u0 === 'CONDENSE' && t.length === 3 && U(t[2]) === 'NO-GAPS') return set([`${t[1]} = condense( val = ${t[1]} from = \` \` to = \`\` ).`], 'condense');
    if (u0 === 'SHIFT' && t.length === 6 && U(t[2]) === 'LEFT' && U(t[3]) === 'DELETING' && U(t[4]) === 'LEADING') {
      const L = literalText(t[5]);
      if (L && L.text.length === 1) return set([`${t[1]} = shift_left( val = ${t[1]} sub = ${t[5]} ).`], 'shift');
      return false;
    }
    if (u0 === 'REFRESH' || u0 === 'REFRESH:') {
      if (/\bFROM\b/i.test(it.mask)) return false;
      const m = /^REFRESH(:?)\s*(.+)$/i.exec(it.code);
      return set([`CLEAR${m[1]} ${m[2]}.`], 'refresh');
    }
    if (u0 === 'GET' && t.length === 6 && U(t[1]) === 'REFERENCE' && U(t[2]) === 'OF' && U(t[4]) === 'INTO') {
      return set([`${t[5]} = REF #( ${t[3]} ).`], 'ref');
    }
    return false;
  }

  function ruleWarnings(it, i, ctx) {
    const u = U(it.mask);
    if (/^(DATA|TYPES)\b/.test(u) && (/\bOCCURS\b/.test(u) || /WITH HEADER LINE/.test(u))) ctx.note('header', it.line);
    if (/^RANGES\b/.test(u)) ctx.note('header', it.line);
    if (/^(FORM|PERFORM)\b/.test(u)) ctx.note('form', it.line);
    if (/^ON CHANGE OF\b/.test(u)) ctx.note('onchange', it.line);
    return false;
  }

  const RULES = [
    ruleWarnings, ruleRead, ruleIfCond, ruleCaseSwitch, ruleValueAppend,
    ruleSelect, ruleLoop, ruleCatch, ruleCondStmt, ruleMove, ruleMoveCorr, ruleArith,
    ruleCompound, ruleCreateObject, ruleCallMethod, ruleFunctionalExporting, ruleConcat, ruleSimple,
  ];

  /* ---------- Keyword case (keeps lower-case code lower-case) ---------- */
  const KW_RE = /\b(DATA|VALUE|NEW|COND|SWITCH|WHEN|THEN|ELSE|IF|NOT|CORRESPONDING|BASE|EXACT|SELECT|SINGLE|FROM|WHERE|AND|OR|INTO|TABLE|UP|TO|ROWS|FOR|ALL|ENTRIES|IN|ORDER|BY|GROUP|HAVING|APPEND|INSERT|ASSIGN|FIELD-SYMBOL|LOOP|AT|ASSIGNING|CHECK|CLEAR|OPTIONAL|EXPORTING|IMPORTING|CHANGING|RECEIVING|EXCEPTIONS|OTHERS|IS|INITIAL|DISTINCT|AS|FIELDS|OF|ASCENDING|DESCENDING|BETWEEN|LIKE|REF|CATCH|ELSEIF|WHILE|INNER|JOIN|LEFT|OUTER|ON|PRIMARY|KEY|UPDATE|APPENDING)\b/g;
  function detectLower(src) {
    const m = maskOf(src.replace(/^\*.*$/gm, ''));
    const words = 'data|if|endif|loop|endloop|select|read|table|into|where|from|method|endmethod|call|concatenate|clear|append|types';
    const lower = (m.match(new RegExp(`\\b(${words})\\b`, 'g')) || []).length;
    const upper = (m.match(new RegExp(`\\b(${words.toUpperCase()})\\b`, 'g')) || []).length;
    return lower > upper;
  }
  function lowerKw(line) {
    return replaceMasked(line, KW_RE, g => g[0].toLowerCase());
  }

  /* ---------- Conversion ---------- */
  function convert(src, options) {
    const opts = Object.assign({ release: 750, inline: true, lang: 'en' }, options || {});
    opts.release = Number(opts.release) || 750;
    src = String(src || '').replace(/\r\n?/g, '\n').replace(/\t/g, '  ');
    const { items, tail } = lex(src);
    analyze(items);
    const decls = parseDecls(items);
    computeUses(items, decls);
    const notes = new Map();
    const ctx = {
      items, decls, opts, waOk: new Map(), lower: detectLower(src),
      note(id, line) {
        if (!notes.has(id)) {
          const def = (opts.lang === 'es' && NOTES_ES[id]) || NOTES[id];
          notes.set(id, { id, level: def[0], title: def[1], detail: def[2], lines: new Set() });
        }
        notes.get(id).lines.add(line);
      },
      set(i, lines, raw) {
        const out = raw || !ctx.lower ? lines : lines.map(lowerKw);
        items[i].out = { lines: out, code: collapse(out.join(' ')) };
      },
      del(i, into) {
        items[i].deleted = true;
        if (into != null && items[i].comments.length) (items[into].extra = items[into].extra || []).push(...items[i].comments);
      },
      tryInline(tok, i, check) {
        if (!opts.inline || !tok) return null;
        const d = decls.get(items[i].proc + ':' + tok.toLowerCase());
        if (!d || !d.inlinable || d.inlined || d.firstUse !== i) return null;
        if (check && !check(d)) return null;
        d.inlined = true;
        d.part.removed = true;
        ctx.note('inline', items[i].line);
        return d.kind === 'fs' ? `FIELD-SYMBOL(${tok})` : `DATA(${tok})`;
      },
    };

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.deleted || it.out || it.incomplete) continue;
      for (const rule of RULES) if (rule(it, i, ctx)) break;
    }

    // Helper variables that are no longer used
    for (const d of decls.values()) {
      if (d.inlined || d.dup || !d.uses.length) continue;
      if (!d.uses.every(u => items[u].deleted || items[u].out)) continue;
      const re = refRegex(d.name);
      const still = items.some((x, idx) => !x.deleted && idx !== d.item && re.test(x.out ? maskOf(x.out.code) : x.mask));
      if (!still) { d.part.removed = true; ctx.note('unused', items[d.item].line); }
    }
    // Rewrite declarations
    items.forEach((x, idx) => {
      if (!x.decl || x.deleted) return;
      const keep = x.decl.parts.filter(p => !p.removed);
      if (keep.length === x.decl.parts.length) return;
      if (!keep.length) { ctx.del(idx); return; }
      if (x.decl.chained) {
        const head = x.decl.kw + ': ';
        const pad = ' '.repeat(head.length);
        ctx.set(idx, keep.map((p, k) => (k ? pad : head) + p.text + (k < keep.length - 1 ? ',' : '.')), true);
      } else {
        ctx.set(idx, [`${x.decl.kw} ${keep[0].text}.`], true);
      }
    });

    // Render
    let out = '';
    let lineNo = 1;
    const changed = [];
    const add = s => { out += s; for (const ch of s) if (ch === '\n') lineNo++; };
    let changedCount = 0;
    for (const it of items) {
      if (it.deleted) { add(it.pre.replace(/\n[ \t]*$/, '').replace(/[ \t]+$/, '')); changedCount++; continue; }
      if (!it.out) { add(it.pre + it.raw); continue; }
      changedCount++;
      const ind = ' '.repeat(it.indent);
      add(it.pre);
      for (const c of [...it.comments, ...(it.extra || [])]) add((c[0] === '*' ? '"' + c.slice(1) : c) + '\n' + ind);
      const from = lineNo;
      add(it.out.lines.map((l, k) => (k ? ind : '') + l).join('\n'));
      for (let L = from; L <= lineNo; L++) changed.push(L);
    }
    add(tail);
    if (out.startsWith('\n') && !src.startsWith('\n')) {
      out = out.slice(1);
      for (let k = 0; k < changed.length; k++) changed[k]--;
    }
    const order = Object.keys(NOTES);
    const noteList = [...notes.values()]
      .map(n => Object.assign(n, { lines: [...n.lines].sort((a, b) => a - b) }))
      .sort((a, b) => (a.level === b.level ? order.indexOf(a.id) - order.indexOf(b.id) : a.level === 'warn' ? -1 : 1));
    return {
      code: out,
      notes: noteList,
      changedLines: changed,
      stats: { statements: items.filter(x => !x.incomplete).length, changed: changedCount },
    };
  }

  global.AbapModernizer = { convert, _internals: { lex, tokens, maskOf, normCond, escapeCond } };
})(typeof window !== 'undefined' ? window : globalThis);
