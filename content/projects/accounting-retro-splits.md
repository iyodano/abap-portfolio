---
id: accounting-retro-splits
place: main
order: 80
category: payroll
size: wide
icon: retro
kicker: Payroll · Payroll cluster | Nómina · Clúster de nómina
title: Payroll accounting report: retro and splits | Informe contable de nómina: retroactividad y particiones
flow: A / A → total ; A / P → A − P ; P / O → P − O ; Splits → sum | Particiones → suma
tags:
  - RGDIR
  - Retro | Retroactividad
  - Splits | Particiones
  - WPBP
---

# English

> A posting report that had to match the standard wage type reporter, including retroactive recalculations and split periods. The fix came from telling a split apart from a recalculation.

## Context

A custom accounting report had to match the standard wage type reporter (PC00_M99_CWTR). In in-period view, recalculated months showed the full amount instead of the difference: a January wage type was 1,737.36 in the original run and 1,737.74 in a later recalculation, so 0.38 should be posted, but the report showed 1,737.74.

## What I did

- Rebuilt the logic on the payroll directory (RGDIR): each result minus its predecessor. A/A gives the total, A/P gives A − P and P/O gives P − O.
- The twist: an employee with January split in two periods (days 1–30 and day 31) showed −1,297.20 instead of 1,341.93 + 44.73 = 1,386.66. The code was treating the second split as a recalculation.
- Diagnosed it as a split, not a recalculation, and moved the logic from single results to sets: every split of the month calculated in the selected period is added, every split of the previous calculation is subtracted, however many splits there are.
- Validated every case against the standard report, and explained why the ALV now had fewer lines: splits with the same cost centre collapse into one.

## Result {result half}

The report matches the standard for normal, retroactive and split periods.

## Lesson {lesson half}

Partition is not recalculation, and the standard is the only source of truth. The payroll result keeps no difference per wage type: only the difference in the amount paid out, in /551 and /552. The difference per wage type has to be calculated, so first find out which view each user expects.

# Español

> Un informe de contabilización que tenía que cuadrar con el reporter estándar de conceptos, incluidos los recálculos retroactivos y los periodos partidos. La solución llegó al distinguir una partición de un recálculo.

## Contexto

Un informe contable a medida tenía que cuadrar con el reporter estándar de conceptos (PC00_M99_CWTR). En la vista en-periodo, los meses recalculados salían con el importe completo en lugar de la diferencia: un concepto de enero valía 1.737,36 en el cálculo original y 1.737,74 en un recálculo posterior, así que había que contabilizar 0,38, pero el informe mostraba 1.737,74.

## Qué hice

- Rehice la lógica sobre el directorio de nómina (RGDIR): cada resultado menos su antecesor. A/A da el total, A/P da A − P y P/O da P − O.
- El giro: un empleado con enero partido en dos tramos (del día 1 al 30 y el día 31) salía a −1.297,20 en lugar de 1.341,93 + 44,73 = 1.386,66. El código trataba el segundo tramo como un recálculo.
- Lo diagnostiqué como una partición, no un recálculo, y pasé la lógica de resultados sueltos a conjuntos: se suman todos los tramos del mes calculados en el periodo seleccionado y se restan los del cálculo anterior, haya los tramos que haya.
- Validé cada caso contra el informe estándar y expliqué por qué el ALV tenía ahora menos líneas: los tramos con el mismo centro de coste se unen en una.

## Resultado {result half}

El informe cuadra con el estándar en periodos normales, retroactivos y partidos.

## Lección {lesson half}

Una partición no es un recálculo, y el estándar es la única fuente de verdad. El resultado de nómina no guarda la diferencia de cada concepto: solo la del importe a pagar, en /551 y /552. La diferencia por concepto hay que calcularla, así que primero averigua qué vista espera cada usuario.

# Code

EN: The fix, in code: work with sets of splits instead of single results, and let a sign do what special cases used to do.
ES: La solución, en código: trabajar con conjuntos de tramos en lugar de resultados sueltos, y dejar que un signo haga lo que antes hacían los casos especiales.

## Sets of splits | Conjuntos de tramos

`ZHR_PAYROLL_POSTING → LCL_RETRO`

```abap
METHOD process_for_period.
  " One for-period, seen from the selected in-period:
  "   current set  = every split of it calculated in this in-period    → added
  "   previous set = every split of it in the previous in-period       → subtracted
  DATA(lt_current) = build_set( iv_fpper = iv_fpper iv_inper = iv_inper ).

  " The previous in-period that calculated this for-period, if any
  DATA(lv_prev) = REDUCE iperi( INIT p = VALUE iperi( )  //1
                                FOR d IN gt_rgdir  //1
                                WHERE ( fpper = iv_fpper AND inper < iv_inper )  //1
                                NEXT p = COND #( WHEN d-inper > p THEN d-inper ELSE p ) ).  //1

  DATA(lt_previous) = COND tt_rgdir( WHEN lv_prev IS NOT INITIAL  //2
                                     THEN build_set( iv_fpper = iv_fpper iv_inper = lv_prev ) ).  //2

  " A/A → total · A/P → A − P · P/O → P − O · splits → sum
  add_set( it_set = lt_current  iv_sign = 1 ).  //3
  add_set( it_set = lt_previous iv_sign = -1 ).  //3
ENDMETHOD.

METHOD build_set.
  " One row per split (FPBEG/FPEND), however many there are
  LOOP AT gt_rgdir INTO DATA(ls_dir) WHERE fpper = iv_fpper AND inper = iv_inper.
    READ TABLE rt_set ASSIGNING FIELD-SYMBOL(<ls_split>)  //4
         WITH KEY fpbeg = ls_dir-fpbeg fpend = ls_dir-fpend.  //4
    IF sy-subrc <> 0.  //4
      APPEND ls_dir TO rt_set.  //4
    ELSEIF ls_dir-seqnr > <ls_split>-seqnr.  //5
      <ls_split> = ls_dir.              " recalculated twice: latest wins  //5
    ENDIF.
  ENDLOOP.
ENDMETHOD.

METHOD add_set.
  LOOP AT it_set INTO DATA(ls_dir).
    DATA(ls_result) = read_result( ls_dir-seqnr ).      " PYXX_READ_PAYROLL_RESULT
    LOOP AT ls_result-inter-rt INTO DATA(ls_rt) WHERE lgart IN gr_lgart.
      " Each split brings its own WPBP: a cost-centre change gives two lines
      DATA(ls_wpbp) = VALUE pc205( ls_result-inter-wpbp[ apznr = ls_rt-apznr ] OPTIONAL ).  //6
      DATA(ls_line) = VALUE ty_line( fpper = ls_dir-fpper
                                     kostl = ls_wpbp-kostl  //6
                                     lgart = ls_rt-lgart
                                     betrg = ls_rt-betrg * iv_sign ).
      COLLECT ls_line INTO gt_lines.      " same key → one line with the total
    ENDLOOP.
  ENDLOOP.
ENDMETHOD.
```

1. EN: The previous in-period is looked up, not assumed: a retro run can come months later.
   ES: El in-period anterior se busca, no se supone: un recálculo puede llegar meses después.
2. EN: Nothing to subtract the first time a month is calculated: A/A gives the full amount.
   ES: La primera vez que se calcula un mes no hay nada que restar: A/A da el importe completo.
3. EN: A sign instead of special cases: the same two lines cover A/A, A/P and P/O.
   ES: Un signo en lugar de casos especiales: las mismas dos líneas cubren A/A, A/P y P/O.
4. EN: The fix: every split of the month goes into the set and is added. 1,341.93 + 44.73 = 1,386.66 instead of −1,297.20.
   ES: La solución: cada tramo del mes entra en el conjunto y se suma. 1.341,93 + 44,73 = 1.386,66 en lugar de −1.297,20.
5. EN: A split recalculated twice in the same in-period: only the latest result counts.
   ES: Un tramo recalculado dos veces en el mismo in-period: solo cuenta el último resultado.
6. EN: Cost centre per split, from each split’s own WPBP, the same as the standard does.
   ES: Centro de coste por tramo, desde la WPBP de cada tramo, igual que el estándar.
