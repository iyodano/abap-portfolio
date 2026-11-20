// Run with: node tests/abap-modernizer.test.js
// Small regression suite for the classic → modern ABAP converter.
const assert = require('assert');
require('../assets/js/abap-modernizer.js');
const { convert } = globalThis.AbapModernizer;

let passed = 0;
function test(name, src, expected, options) {
  const out = convert(src, Object.assign({ release: 750, inline: true }, options)).code.trim();
  try {
    assert.strictEqual(out, expected.trim());
    passed++;
    console.log('  ok   ' + name);
  } catch (e) {
    console.log('  FAIL ' + name + '\n--- expected\n' + expected.trim() + '\n--- got\n' + out);
    process.exitCode = 1;
  }
}

test('MOVE becomes an assignment', 'MOVE lv_a TO lv_b.', 'lv_b = lv_a.');

test('ADD up to 7.50', 'ADD 1 TO lv_count.', 'lv_count = lv_count + 1.');
test('ADD on 7.54+', 'ADD 1 TO lv_count.', 'lv_count += 1.', { release: 754 });

test('READ TABLE + IF sy-subrc = 0 → line_exists',
`READ TABLE lt_tab INTO ls_tab WITH KEY id = lv_id.
IF sy-subrc = 0.
  WRITE ls_tab-id.
ENDIF.`,
`IF line_exists( lt_tab[ id = lv_id ] ).
  ls_tab = lt_tab[ id = lv_id ].
  WRITE ls_tab-id.
ENDIF.`);

test('BINARY SEARCH is left unchanged',
'READ TABLE lt_tab INTO ls_tab WITH KEY id = lv_id BINARY SEARCH.',
'READ TABLE lt_tab INTO ls_tab WITH KEY id = lv_id BINARY SEARCH.');

test('Inline declaration in LOOP when the line type matches',
`DATA lt_t TYPE STANDARD TABLE OF t500l.
DATA ls_t TYPE t500l.
LOOP AT lt_t INTO ls_t.
ENDLOOP.`,
`DATA lt_t TYPE STANDARD TABLE OF t500l.
LOOP AT lt_t INTO DATA(ls_t).
ENDLOOP.`);

test('Strict Open SQL',
'SELECT SINGLE ename FROM pa0001 INTO lv_ename WHERE pernr = lv_pernr.',
'SELECT SINGLE ename FROM pa0001 WHERE pernr = @lv_pernr INTO @lv_ename.');

test('CONCATENATE SEPARATED BY space',
'CONCATENATE lv_a lv_b INTO lv_c SEPARATED BY space.',
'lv_c = |{ lv_a } { lv_b }|.');

test('IF / ELSE boolean → xsdbool',
`IF lv_count GT 0.
  rv_ok = abap_true.
ELSE.
  rv_ok = abap_false.
ENDIF.`,
'rv_ok = xsdbool( lv_count > 0 ).');

test('CLEAR + fields + APPEND → VALUE #( )',
`CLEAR ls_out.
ls_out-pernr = lv_pernr.
ls_out-msg = 'OK'.
APPEND ls_out TO lt_out.`,
"APPEND VALUE #( pernr = lv_pernr msg = 'OK' ) TO lt_out.");

test('CALL METHOD with RECEIVING → functional assignment',
"CALL METHOD cl_abap_typedescr=>describe_by_name EXPORTING p_name = 'PA0001' RECEIVING p_descr_ref = lo_descr.",
"lo_descr = cl_abap_typedescr=>describe_by_name( p_name = 'PA0001' ).");

console.log(`\n${passed} passed`);
