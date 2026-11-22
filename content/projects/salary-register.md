---
id: salary-register
place: main
order: 50
category: payroll
size: wide
icon: scale
kicker: Payroll · Compliance | Nómina · Cumplimiento legal
title: Salary register: a report driven by a mapping table | Registro retributivo: un informe dirigido por una tabla de mapeo
flow: Mapping table | Tabla de mapeo -> Engine | Motor -> INF · CLS · RUT · ICC · CRU -> One row per contract situation | Una fila por situación contractual -> ALV · CSV
tags:
  - Metadata-driven | Dirigido por metadatos
  - Dynamic calls | Llamadas dinámicas
  - RTTS
  - Payroll cluster | Clúster de nómina
---

# English

> Every column of the legal salary register is a row in a table: an infotype field, wage types from the payroll cluster or a routine called by name. I adopted the framework for a new client and added two data origins to its engine.

## Context

Spanish companies must keep a salary register by gender and job group, in the format of the official tool published by the Ministry of Labour. Our team already had a metadata-driven extraction framework, used for a pay-gap report at another client. I adopted it for a new client’s register and extended its engine where it fell short.

## How the framework works {half}

- **A mapping table defines each report.** One row per output column, keyed by country, report type and order, with validity dates. Several report types share the same engine.
- **Each column has an origin.** INF reads an infotype field; CLS adds up wage types from the payroll cluster, by wage type or processing class, with sign and optional annualisation; RUT calls a routine by name; SYS gives the start and end of each segment.
- **Routines are methods.** An employee class with about eighty methods that share one signature, so any of them can feed any column. A routine receives the values of the columns it depends on.
- **Split fields cut the period** (contract key, personnel area…): one output row per contractual situation.
- **Dynamic output:** the table is built at runtime from the mapping (RTTS) and shown in an ALV, with CSV export.

## What I did {half}

- Parametrised the client’s register: every input column of the official tool’s data sheet mapped to an origin, with hidden helper columns for the dependencies.
- Added four client-specific routines (working pattern, pay scale, salary level and job value) without touching the engine.
- Extended the engine with two origins. **ICC**: amounts from infotypes 0008 and 0014, broken down by wage type through the same annual salary calculator that PA30 uses. **CRU**: wage types from the payroll results, handed to a routine that does the maths.
- Business rules on IT0014: records that end before 31 December or start after 1 January projected over the months of payroll actually calculated, and consecutive records merged when only the amount changes.
- Periods cut by the personnel actions in IT0000.

## Result {result half}

The client runs one report for its annual register, and the framework grows by adding rows and routines, not by rewriting the engine.

## Next step {improve half}

The engine still lives in FORM routines around the class: move it into a class of its own, with a unit test per origin.

## Lesson {lesson}

What works in dialog does not necessarily work in mass. The annual salary calculator kept static state between employees: invisible in PA30, wrong from the second employee in a report. Before touching a class shared with PA30 and payroll, I checked its where-used list and compared the report with PA30 for several employees in a row.

# Español

> Cada columna del registro retributivo es una fila de una tabla: un campo de infotipo, conceptos del clúster de nómina o una rutina llamada por su nombre. Adapté el framework a un cliente nuevo y añadí dos orígenes de datos a su motor.

## Contexto

Las empresas españolas deben llevar un registro retributivo por sexo y grupo profesional, con el formato de la herramienta oficial del Ministerio de Trabajo. Nuestro equipo ya tenía un framework de extracción dirigido por metadatos, usado para un informe de brecha salarial en otro cliente. Lo adapté al registro de un cliente nuevo y amplié su motor donde se quedaba corto.

## Cómo funciona el framework {half}

- **Una tabla de mapeo define cada informe.** Una fila por columna de salida, con clave por país, tipo de informe y orden, y con fechas de validez. Varios tipos de informe comparten el mismo motor.
- **Cada columna tiene un origen.** INF lee un campo de infotipo; CLS suma conceptos del clúster de nómina, por concepto o por clase de tratamiento, con signo y anualización opcional; RUT llama a una rutina por su nombre; SYS da el inicio y el fin de cada tramo.
- **Las rutinas son métodos.** Una clase de empleado con unos ochenta métodos que comparten firma, así que cualquiera puede alimentar cualquier columna. Cada rutina recibe los valores de las columnas de las que depende.
- **Los campos de partición cortan el periodo** (clave de contrato, división de personal…): una fila de salida por situación contractual.
- **Salida dinámica:** la tabla se construye en tiempo de ejecución a partir del mapeo (RTTS) y se muestra en un ALV, con exportación a CSV.

## Qué hice {half}

- Parametricé el registro del cliente: cada columna de entrada de la hoja de datos de la herramienta oficial, asociada a un origen, con columnas auxiliares ocultas para las dependencias.
- Añadí cuatro rutinas propias del cliente (horario, escala, nivel retributivo y valoración del puesto) sin tocar el motor.
- Amplié el motor con dos orígenes. **ICC**: importes de los infotipos 0008 y 0014 desglosados por concepto, con la misma calculadora de salario anual que usa PA30. **CRU**: conceptos de los resultados de nómina, entregados a una rutina que hace el cálculo.
- Reglas de negocio del IT0014: los registros que terminan antes del 31 de diciembre o empiezan después del 1 de enero se proyectan sobre los meses de nómina realmente calculados, y los registros consecutivos se unen cuando solo cambia el importe.
- Periodos cortados por las medidas del IT0000.

## Resultado {result half}

El cliente ejecuta un solo informe para su registro anual, y el framework crece añadiendo filas y rutinas, no reescribiendo el motor.

## Siguiente paso {improve half}

El motor sigue viviendo en FORMs alrededor de la clase: pasarlo a una clase propia, con un test unitario por origen.

## Lección {lesson}

Lo que funciona en diálogo no tiene por qué funcionar en masivo. La calculadora de salario anual guardaba estado estático entre empleados: invisible en PA30, incorrecto a partir del segundo empleado en un informe. Antes de tocar una clase compartida con PA30 y con la nómina, revisé su lista de utilización y comparé el informe con PA30 para varios empleados seguidos.

# Code

EN: The mapping table is the report. The engine walks it column by column, and the routines are methods called by name. Below: a few rows of the table, the CRU origin I added to the engine, and one of the routines it calls.
ES: La tabla de mapeo es el informe. El motor la recorre columna a columna, y las rutinas son métodos llamados por su nombre. Abajo: unas filas de la tabla, el origen CRU que añadí al motor y una de las rutinas a las que llama.

## Mapping table | Tabla de mapeo

`ZHR_REGISTER_MAP (SM30) · report type RR`

| Order // Orden | Column // Columna | Origin // Origen | Source // Fuente | Wage type / class // Concepto / clase | Split // Parte | Depends on // Depende de | Routine // Rutina |
|---|---|---|---|---|---|---|---|
| 010 | Employee // Empleado | [[INF]] | P0000-PERNR |  |  |  |  |
| 019 | _gender (helper) // _sexo (auxiliar) | [[INF]] | P0002-GESCH |  |  |  |  |
| 020 | Gender // Sexo | [[RUT]] |  |  |  | 019 | GENDER_TEXT |
| 100 | Situation start // Inicio de la situación | [[SYS]] | segment start // inicio del tramo |  |  |  |  |
| 120 | % working time // % de jornada | [[RUT]] |  |  |  |  | WORKING_TIME_PCT |
| 150 | Contract key // Clave de contrato | [[INF]] | P0061-PESOC |  | ✓ |  |  |
| 219 | _pay scale group (helper) // _grupo de convenio (auxiliar) | [[INF]] | P0008-TRFGR |  |  |  |  |
| 220 | Job group // Grupo profesional | [[RUT]] |  |  |  | 219 | MAP_JOB_GROUP |
| 290 | Base salary // Salario base | [[CLS]] | RT-BETRG | base salary wage types // conceptos de salario base |  |  |  |
| 330 | Variable pay, adjusted // Variable, ajustado | [[CRU]] | RT-BETRG | class 30 = 1 // clase 30 = 1 |  | 120-130 | PCT_IT14_IT15 |

1. EN: Rows starting with _ are helper columns: hidden in the output, but other columns depend on them.
   ES: Las filas que empiezan por _ son columnas auxiliares: ocultas en la salida, pero otras columnas dependen de ellas.
2. EN: Split marks the fields that cut the period: one output row per contractual situation.
   ES: Parte marca los campos que cortan el periodo: una fila de salida por situación contractual.
3. EN: Each row has validity dates, so the report can follow a change in the law without a transport.
   ES: Cada fila tiene fechas de validez, así que el informe puede seguir un cambio legal sin transporte.

## Engine · CRU origin | Motor · origen CRU

`ZHR_SALARY_REGISTER → FILL_ITABLE (excerpt)`

```abap
" One output column per mapping row, in ORDER sequence. The engine does not
" know what a column means: the table says where its value comes from.
LOOP AT gt_mapping INTO DATA(ls_map).
  CLEAR lv_value.

  CASE ls_map-origin.
    WHEN c_origin_inf.                       " infotype field, e.g. P0002-GBDAT
      PERFORM read_infotype_field USING ls_map fini ffin CHANGING lv_value.

    WHEN c_origin_rut.                       " routine of the employee class, by name
      PERFORM read_dependencies USING ls_map-depends_on CHANGING lt_dep.
      TRY.
          CALL METHOD lo_employee->(ls_map-routine)  //1
            EXPORTING fini = fini ffin = ffin dep = lt_dep  //1
            IMPORTING value = lv_value.  //1
        CATCH cx_sy_dyn_call_error.  //2
          CLEAR lv_value.                    " one empty column, not a dump  //2
      ENDTRY.

    WHEN c_origin_cru.                       " cluster + routine: the origin I added  //3
      CLEAR lt_wagetypes.
      " gt_results: current results only (srtza = 'A'), so a recalculated month counts once
      LOOP AT gt_results ASSIGNING FIELD-SYMBOL(<ls_result>).
        LOOP AT <ls_result>-inter-rt INTO DATA(ls_rt).
          IF ls_map-lgart IS NOT INITIAL.
            CHECK ls_rt-lgart = ls_map-lgart.
          ELSE.                              " or by processing class value
            CALL FUNCTION 'HR_99S_GET_PROC_CLASS_VALUE'  //4
              EXPORTING p_molga       = ls_map-molga
                        p_lgart       = ls_rt-lgart
                        p_proc_class  = ls_map-prcls
                        p_keydate     = ffin
              IMPORTING p_value       = lv_class_value
                        p_return_code = lv_rc.
            CHECK lv_rc = 0 AND lv_class_value = ls_map-prclv.  //4
          ENDIF.
          ls_wagetype = VALUE #( lgart = ls_rt-lgart
                                 betrg = COND #( WHEN ls_map-sign = '-' THEN 0 - ls_rt-betrg
                                                 ELSE ls_rt-betrg ) ).
          COLLECT ls_wagetype INTO lt_wagetypes.
        ENDLOOP.
      ENDLOOP.

      PERFORM read_dependencies USING ls_map-depends_on CHANGING lt_dep.
      TRY.
          CALL METHOD lo_employee->(ls_map-routine)  //5
            EXPORTING fini      = fini       ffin   = ffin  //5
                      dep       = lt_dep  //5
                      wagetypes = lt_wagetypes  //5
                      months    = lt_months  " months with regular payroll  //5
            IMPORTING value     = lv_value.  //5
        CATCH cx_sy_dyn_call_error.
          CLEAR lv_value.
      ENDTRY.

    " ... CLS, ICC and SYS follow the same pattern
  ENDCASE.

  " The output row was created at runtime from this same table (RTTS):
  " one component per column, named C + its ORDER (C010, C020...)
  DATA(lv_column) = |C{ ls_map-orden }|.  //6
  ASSIGN COMPONENT lv_column OF STRUCTURE <ls_row> TO FIELD-SYMBOL(<lv_cell>).  //6
  IF sy-subrc = 0.
    TRY.
        <lv_cell> = lv_value.
      CATCH cx_sy_conversion_no_number cx_sy_conversion_overflow.
        CLEAR <lv_cell>.
    ENDTRY.
  ENDIF.
ENDLOOP.
```

1. EN: RUT: the routine is a method name stored in the table. About eighty methods share one signature, so any of them fits any column.
   ES: RUT: la rutina es un nombre de método guardado en la tabla. Unos ochenta métodos comparten firma, así que cualquiera encaja en cualquier columna.
2. EN: A wrong routine name empties one column instead of dumping the whole report.
   ES: Un nombre de rutina erróneo deja vacía una columna en lugar de hacer un dump de todo el informe.
3. EN: CRU, the new origin: wage types from the payroll results, maths in a routine.
   ES: CRU, el origen nuevo: conceptos de los resultados de nómina, cálculo en una rutina.
4. EN: Wage types chosen by number or by processing class value, so a new wage type with the right class is picked up without touching the table.
   ES: Conceptos elegidos por número o por valor de clase de tratamiento, así que un concepto nuevo con la clase correcta entra sin tocar la tabla.
5. EN: The routine receives the wage types, the months with payroll calculated and the values of the columns it depends on.
   ES: La rutina recibe los conceptos, los meses con nómina calculada y los valores de las columnas de las que depende.
6. EN: The output structure is built at runtime from the same table (RTTS), one component per column. Its name is C plus the order, because a component name cannot start with a digit.
   ES: La estructura de salida se construye en tiempo de ejecución a partir de la misma tabla (RTTS), un componente por columna. Se llama C más el orden, porque el nombre de un componente no puede empezar por un número.

## Routine · IT0014/15 % | Rutina · % IT0014/15

`ZCL_HR_REGISTER_EMPLOYEE → PCT_IT14_IT15`

```abap
METHOD pct_it14_it15.
  " Same signature as every other routine, plus the wage types and the months.
  " dep[ 1 ] = % applied to every wage type
  " dep[ 2 ] = extra % for the wage types the employee has in IT0014 / IT0015
  DATA lv_pct_all TYPE decfloat34.
  DATA lv_pct_itx TYPE decfloat34.
  IF lines( dep ) >= 2.  //1
    lv_pct_all = dep[ 1 ]-valor.  //1
    lv_pct_itx = dep[ 2 ]-valor.  //1
  ENDIF.  //1

  " Which of these wage types come from IT0014 / IT0015 in the period?
  SELECT lgart FROM pa0014  //2
    WHERE pernr = @mv_pernr AND begda <= @ffin AND endda >= @fini  //2
    INTO TABLE @DATA(lt_itx).  //2
  SELECT lgart FROM pa0015  //2
    WHERE pernr = @mv_pernr AND begda BETWEEN @fini AND @ffin  //2
    APPENDING TABLE @lt_itx.  //2

  DATA lv_sum_itx  TYPE decfloat34.
  DATA lv_sum_rest TYPE decfloat34.
  LOOP AT wagetypes INTO DATA(ls_wt).
    IF line_exists( lt_itx[ lgart = ls_wt-lgart ] ).
      lv_sum_itx = lv_sum_itx + ls_wt-betrg.
    ELSE.
      lv_sum_rest = lv_sum_rest + ls_wt-betrg.
    ENDIF.
  ENDLOOP.

  " Both sums get the first %, the IT0014/IT0015 amounts also the second
  value = lv_sum_rest * lv_pct_all / 100  //3
        + lv_sum_itx  * lv_pct_all / 100 * lv_pct_itx / 100.  //3
ENDMETHOD.
```

1. EN: Dependencies arrive in the order written in the table (“120-130”): the routine never reads the output row itself.
   ES: Las dependencias llegan en el orden escrito en la tabla («120-130»): la rutina nunca lee la fila de salida por su cuenta.
2. EN: Which of the cluster’s wage types are recurring or additional payments in IT0014 / IT0015?
   ES: ¿Cuáles de los conceptos del clúster son devengos periódicos o pagos adicionales del IT0014 / IT0015?
3. EN: The rule agreed with the functional team, in one place.
   ES: La regla acordada con el equipo funcional, en un solo sitio.
