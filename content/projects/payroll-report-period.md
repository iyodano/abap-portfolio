---
id: payroll-report-period
place: more
order: 10
icon: retro
kicker: Payroll · Fix | Nómina · Corrección
title: Payroll report: master data from the right period | Informe de nómina: datos maestros del periodo correcto
short: Period, not pay date | Periodo, no fecha de pago
---

# English

> Rows with empty or mixed-up organisational data, traced back to one root cause.

## Context

Two incidents in payroll reports built on the wage type reporter. A new hire on the 30th, paid on the 29th, came out with company, agreement and social security account empty. And employees with retro runs or several splits showed, on their old rows, the organisational data of their latest record.

## What I did

- Before touching code, confirmed in PC_PAYRESULT that the payroll results were legitimate: the problem was the report, not the data.
- Found one root cause behind both: master data was read at the payment date instead of for the payroll period.
- Changed the reference date to the payroll period, sorted every infotype newest first and cleared the helper fields between rows, so nothing carries over from one row to the next.
- Tested with ordinary employees too before transporting, so the fix did not break what already worked.

## Result {result}

Every row shows the organisation, agreement and social security account of its own period: hires, leavers, retro and splits included.

# Español

> Filas con datos organizativos vacíos o mezclados, hasta llegar a una sola causa.

## Contexto

Dos incidencias en informes de nómina construidos sobre el reporter de conceptos. Un alta del día 30, pagada el 29, salía con la sociedad, el convenio y el código de cuenta de cotización vacíos. Y los empleados con recálculos o varios tramos mostraban, en sus filas antiguas, los datos organizativos de su último registro.

## Qué hice

- Antes de tocar código, confirmé en PC_PAYRESULT que los resultados de nómina eran legítimos: el problema era el informe, no los datos.
- Encontré una sola causa detrás de las dos: los datos maestros se leían a la fecha de pago y no para el periodo de nómina.
- Cambié la fecha de referencia al periodo de nómina, ordené todos los infotipos del más reciente al más antiguo y limpié los campos auxiliares entre filas, para que nada se arrastre de una fila a la siguiente.
- Probé también con empleados normales antes de transportar, para que la corrección no rompiera lo que ya funcionaba.

## Resultado {result}

Cada fila muestra la organización, el convenio y la cuenta de cotización de su propio periodo, incluidas altas, bajas, recálculos y tramos.

# Code

EN: The fix: the reference date comes from the payroll period, and each infotype is read newest first.
ES: La corrección: la fecha de referencia sale del periodo de nómina, y cada infotipo se lee del más reciente al más antiguo.

## The fix in code | La corrección en código

```abap
" Reference date = last day of the payroll period (FPPER), not the payment date
DATA(lv_first_day) = CONV d( |{ <lv_fpper> }01| ).
CALL FUNCTION 'LAST_DAY_OF_MONTHS'
  EXPORTING  day_in            = lv_first_day
  IMPORTING  last_day_of_month = lv_ref_date
  EXCEPTIONS day_in_no_date    = 1
             OTHERS            = 2.
IF sy-subrc <> 0.
  lv_ref_date = <lv_paydt>.                  " fallback: the previous behaviour
ENDIF.

" Newest first: the first record that starts on or before the reference date
" is the one valid in that period
SORT p0001 BY begda DESCENDING.
LOOP AT p0001 ASSIGNING FIELD-SYMBOL(<ls_p0001>).
  CHECK <ls_p0001>-begda <= lv_ref_date OR sy-tabix = lines( p0001 ).
  " ... company code, personnel area and subarea, payroll area
  EXIT.
ENDLOOP.
```
