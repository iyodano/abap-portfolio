---
id: salary-it0008
place: main
order: 20
category: ecp
size: normal
icon: coin
kicker: ECP integration · Compensation | Integración ECP · Compensación
title: Salary from EC to infotype 0008, under control | Del salario en EC al infotipo 0008, bajo control
tags:
  - IT0008
  - BAdI
  - HR_INFOTYPE_OPERATION
  - ALV
---

# English

> Pay components from Employee Central staged by the replication, compared with IT0008 and saved only after review, employee by employee.

## Context

The client manages salaries in Employee Central. Infotype 0008 is what actually pays people, so data coming from EC should not land there blindly.

## What I did

- In the replication BAdI, took the latest job and compensation information and prepared the data in a staging table: twelve pay components, 12 or 14 payments depending on the employment type, monthly salary and working time from the FTE.
- Segmented the validity dates so records never overlap or leave gaps, including when a new salary starts in the middle of an existing record or before all of them.
- Built a report that derives the collective agreement data (feature TARIF), compares with the current IT0008 and proposes what to create or change, in an ALV with traffic lights and a test mode.
- On save, each employee is locked, updated and committed or rolled back as a whole.
- Kept the logic in its own method of the common BAdI class: the IT0008-specific BAdI never ran, because that infotype is not in the BIB field mapping.

## Flow {flow}

EC compensation -> Replication BAdI -> Staging table -> Comparison report -> IT0008

## Result {result half}

Salary changes from Employee Central reach payroll validated, reviewed and traceable.

## Next step {improve half}

Read the current IT0008 records for all selected employees in one go, instead of one employee at a time inside the loop.

## Lesson {lesson}

In payroll, control is as important as automation.

# Español

> Componentes salariales de Employee Central preparados por la replicación, comparados con el IT0008 y grabados solo después de revisarlos, empleado a empleado.

## Contexto

El cliente gestiona los salarios en Employee Central. El infotipo 0008 es el que paga a la gente, así que lo que viene de EC no debería entrar ahí a ciegas.

## Qué hice

- En la BAdI de replicación tomé la última información de puesto y de compensación y preparé los datos en una tabla intermedia: doce componentes salariales, 12 o 14 pagas según el tipo de empleo, salario mensual y jornada a partir del FTE.
- Segmenté las fechas de validez para que los registros nunca se solapen ni dejen huecos, también cuando un salario nuevo empieza a mitad de un registro existente o antes que todos.
- Creé un informe que deriva los datos de convenio (característica TARIF), compara con el IT0008 vigente y propone qué crear o modificar, en un ALV con semáforos y modo test.
- Al grabar, cada empleado se bloquea, se actualiza y se confirma o se deshace entero.
- Dejé la lógica en su propio método de la clase de la BAdI común: la BAdI específica del IT0008 nunca se ejecutaba, porque ese infotipo no está en el mapeo de campos del BIB.

## Recorrido {flow}

Compensación en EC -> BAdI de replicación -> Tabla intermedia -> Informe de comparación -> IT0008

## Resultado {result half}

Los cambios de salario de Employee Central llegan a nómina validados, revisados y con trazabilidad.

## Siguiente paso {improve half}

Leer los IT0008 vigentes de todos los empleados seleccionados de una vez, en lugar de empleado a empleado dentro del bucle.

## Lección {lesson}

En nómina, el control importa tanto como la automatización.

# Code

EN: Two halves of the same control: the replication only stages the salary, and a report decides what reaches infotype 0008, one employee at a time. The third tab is how I would cover the date cut with ABAP Unit.
ES: Dos mitades del mismo control: la replicación solo prepara el salario, y un informe decide qué llega al infotipo 0008, empleado a empleado. La tercera pestaña es cómo cubriría el corte de fechas con ABAP Unit.

## Replication · staging | Replicación · preparación

`ZCL_HR_EC_REPL_COMMON → STAGE_IT0008`

```abap
METHOD stage_it0008.
  " Latest EC compensation → one staging row per start date
  DATA(ls_stage) = VALUE zhr_it0008_stage(
    pernr = iv_pernr
    begda = is_comp-start_date
    endda = '99991231'
    " 12 or 14 payments depending on the employment type, working time from the FTE
    npay  = SWITCH #( is_job-employment_type WHEN '02' THEN 14 ELSE 12 )  //1
    bsgrd = is_job-fte * 100 ).  //1

  " Twelve EC pay components, each to its own slot
  LOOP AT it_pay_components INTO DATA(ls_pc).
    CASE condense( to_upper( ls_pc-pay_component ) ).  //2
      WHEN 'BASE_SALARY'.    ls_stage-amt01 = ls_pc-amount.
      WHEN 'SENIORITY'.      ls_stage-amt02 = ls_pc-amount.
      WHEN 'AGREEMENT_PLUS'. ls_stage-amt03 = ls_pc-amount.
      " … twelve components in total
    ENDCASE.
  ENDLOOP.
  ls_stage-monthly = is_comp-annual_salary / ls_stage-npay.

  " Validity cut: records never overlap and never leave a gap.
  " The new record ends the day before the next one starts, if there is one
  SELECT MIN( begda ) FROM zhr_it0008_stage
    WHERE pernr = @iv_pernr AND begda > @ls_stage-begda
    INTO @DATA(lv_next_start).
  IF lv_next_start IS NOT INITIAL.  //3
    ls_stage-endda = lv_next_start - 1.  //3
  ENDIF.  //3

  " The record it starts inside, if any, ends the day before
  DATA(lv_day_before) = CONV endda( ls_stage-begda - 1 ).
  UPDATE zhr_it0008_stage SET endda = @lv_day_before  //4
    WHERE pernr = @iv_pernr AND begda < @ls_stage-begda AND endda >= @ls_stage-begda.  //4

  MODIFY zhr_it0008_stage FROM @ls_stage.          " same start date: newer data wins  //5
  " Staging only: nothing reaches IT0008 until the report saves it  //6
ENDMETHOD.
```

1. EN: Payments and working time come from the job information, not from the compensation.
   ES: Las pagas y la jornada salen de la información del puesto, no de la de compensación.
2. EN: Pay components arrive as text from EC: normalised before mapping, so stray spaces or lower case still match.
   ES: Los componentes salariales llegan de EC como texto: se normalizan antes de mapear, así que un espacio de más o una minúscula siguen encajando.
3. EN: A record never runs past the next one: it ends the day before the next start date. A salary dated before all the others ends where the first one begins.
   ES: Un registro nunca invade el siguiente: termina el día antes de su fecha de inicio. Un salario con fecha anterior a todos termina donde empieza el primero.
4. EN: A salary that starts mid-record closes the open record the day before: no overlaps, no gaps.
   ES: Un salario que empieza a mitad de un registro cierra el registro abierto el día anterior: sin solapes ni huecos.
5. EN: Same start date: the latest replication wins, and no duplicate row is created.
   ES: Misma fecha de inicio: gana la última replicación y no se crea una fila duplicada.
6. EN: No COMMIT here either: the staging rows are saved with the rest of the replication.
   ES: Aquí tampoco hay COMMIT: las filas intermedias se graban con el resto de la replicación.

## Report · save | Informe · grabación

`ZHR_IT0008_FROM_EC → SAVE_EMPLOYEE`

```abap
METHOD save_employee.
  DATA ls_return    TYPE bapireturn1.
  DATA lv_operation TYPE pspar-actio.

  " Lock first: nobody edits this employee while the report writes
  CALL FUNCTION 'BAPI_EMPLOYEE_ENQUEUE'  //1
    EXPORTING number = is_emp-pernr  //1
    IMPORTING return = ls_return.  //1
  IF ls_return-type = 'E'.
    rs_result = VALUE #( pernr = is_emp-pernr light = icon_red_light text = ls_return-message ).
    RETURN.
  ENDIF.

  LOOP AT is_emp-proposals INTO DATA(ls_prop).
    " A new salary on top of the current one: COP copies and delimits it
    lv_operation = COND #( WHEN ls_prop-action = 'NEW' THEN 'INS' ELSE 'COP' ).  //2
    CALL FUNCTION 'HR_INFOTYPE_OPERATION'
      EXPORTING infty         = '0008'
                number        = ls_prop-p0008-pernr
                subtype       = ls_prop-p0008-subty
                validitybegin = ls_prop-p0008-begda
                validityend   = ls_prop-p0008-endda
                record        = ls_prop-p0008
                operation     = lv_operation  //2
                nocommit      = abap_true  //3
      IMPORTING return        = ls_return.
    IF ls_return-type CA 'EA'.
      EXIT.
    ENDIF.
  ENDLOOP.

  " The employee is saved whole, or not at all
  IF ls_return-type CA 'EA'.  //3
    ROLLBACK WORK.  //3
    CALL FUNCTION 'HR_PSBUFFER_INITIALIZE'.  //4
  ELSE.  //3
    COMMIT WORK AND WAIT.  //3
  ENDIF.  //3

  CALL FUNCTION 'BAPI_EMPLOYEE_DEQUEUE' EXPORTING number = is_emp-pernr.
  rs_result = VALUE #( pernr = is_emp-pernr
                       light = COND #( WHEN ls_return-type CA 'EA' THEN icon_red_light ELSE icon_green_light )
                       text  = ls_return-message ).
ENDMETHOD.
```

1. EN: Lock first, the same way PA30 does.
   ES: Primero el bloqueo, igual que hace PA30.
2. EN: COP copies the current record and delimits it, exactly like creating a new salary in PA30.
   ES: COP copia el registro vigente y lo delimita, igual que crear un salario nuevo en PA30.
3. EN: NOCOMMIT plus one decision at the end: every record of the employee is saved, or none is.
   ES: NOCOMMIT y una sola decisión al final: se graban todos los registros del empleado o ninguno.
4. EN: After a rollback, the infotype buffer is reset, so the next employee never sees records that were never saved.
   ES: Tras un rollback se vacía el buffer de infotipos, para que el siguiente empleado nunca vea registros que no llegaron a grabarse.

## ABAP Unit · how I'd test it | ABAP Unit · cómo lo probaría

`ZCL_HR_EC_REPL_COMMON → test class LTC_VALIDITY_CUT`

```abap
CLASS ltc_validity_cut DEFINITION DEFERRED.
CLASS zcl_hr_ec_repl_common DEFINITION LOCAL FRIENDS ltc_validity_cut.

CLASS ltc_validity_cut DEFINITION FINAL FOR TESTING
  DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    TYPES: BEGIN OF ty_period,
             begda TYPE begda,
             endda TYPE endda,
           END OF ty_period,
           tt_periods TYPE STANDARD TABLE OF ty_period WITH EMPTY KEY.
    CONSTANTS mc_pernr TYPE pernr_d VALUE '00001234'.
    CLASS-DATA go_env TYPE REF TO if_osql_test_environment.

    CLASS-METHODS class_setup.
    CLASS-METHODS class_teardown.
    METHODS setup.
    METHODS same_start_newer_wins  FOR TESTING.
    METHODS mid_record_closes_open FOR TESTING.
    METHODS before_all_no_overlap  FOR TESTING.
    METHODS given  IMPORTING it_periods TYPE tt_periods.
    METHODS stage  IMPORTING iv_begda   TYPE begda.
    METHODS expect IMPORTING it_periods TYPE tt_periods.
ENDCLASS.

CLASS ltc_validity_cut IMPLEMENTATION.
  METHOD class_setup.
    " The staging table is replaced by a test double: no real data is touched
    go_env = cl_osql_test_environment=>create(  //1
               i_dependency_list = VALUE #( ( 'ZHR_IT0008_STAGE' ) ) ).  //1
  ENDMETHOD.

  METHOD class_teardown.
    go_env->destroy( ).
  ENDMETHOD.

  METHOD setup.
    go_env->clear_doubles( ).  //1
  ENDMETHOD.

  METHOD same_start_newer_wins.
    given( VALUE #( ( begda = '20250101' endda = '20251231' )
                    ( begda = '20260101' endda = '99991231' ) ) ).
    stage( '20250101' ).
    expect( VALUE #( ( begda = '20250101' endda = '20251231' )  //2
                     ( begda = '20260101' endda = '99991231' ) ) ).  //2
  ENDMETHOD.

  METHOD mid_record_closes_open.
    given( VALUE #( ( begda = '20250101' endda = '99991231' ) ) ).
    stage( '20250701' ).
    expect( VALUE #( ( begda = '20250101' endda = '20250630' )
                     ( begda = '20250701' endda = '99991231' ) ) ).
  ENDMETHOD.

  METHOD before_all_no_overlap.
    given( VALUE #( ( begda = '20250701' endda = '99991231' ) ) ).
    stage( '20250101' ).
    expect( VALUE #( ( begda = '20250101' endda = '20250630' )  //3
                     ( begda = '20250701' endda = '99991231' ) ) ).  //3
  ENDMETHOD.

  METHOD given.
    DATA lt_rows TYPE STANDARD TABLE OF zhr_it0008_stage WITH EMPTY KEY.
    lt_rows = VALUE #( FOR p IN it_periods
                       ( pernr = mc_pernr begda = p-begda endda = p-endda ) ).
    go_env->insert_test_data( lt_rows ).
  ENDMETHOD.

  METHOD stage.
    " Only the start date matters for the cut
    NEW zcl_hr_ec_repl_common( )->stage_it0008(
      iv_pernr          = mc_pernr
      is_comp           = VALUE #( start_date = iv_begda annual_salary = 28000 )
      is_job            = VALUE #( employment_type = '01' fte = 1 )
      it_pay_components = VALUE #( ) ).
  ENDMETHOD.

  METHOD expect.
    DATA lt_actual TYPE tt_periods.
    SELECT begda, endda FROM zhr_it0008_stage
      WHERE pernr = @mc_pernr
      ORDER BY begda
      INTO TABLE @lt_actual.
    cl_abap_unit_assert=>assert_equals( act = lt_actual exp = it_periods ).
  ENDMETHOD.
ENDCLASS.
```

1. EN: The OSQL test environment swaps the staging table for a double, so the test runs on any system without touching real data.
   ES: El entorno de test de Open SQL cambia la tabla intermedia por un doble, así que el test se ejecuta en cualquier sistema sin tocar datos reales.
2. EN: Same start date with a later record: the replaced record keeps ending the day before the next one.
   ES: Misma fecha de inicio con un registro posterior: el registro sustituido sigue terminando el día antes del siguiente.
3. EN: The edge case: a salary dated before all the others ends where the first one begins, instead of running to 31.12.9999 on top of it.
   ES: El caso límite: un salario con fecha anterior a todos termina donde empieza el primero, en lugar de llegar hasta el 31.12.9999 por encima de él.
