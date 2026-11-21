---
id: garnishments
place: main
order: 60
category: payroll
size: normal
icon: bank
kicker: Payroll · Payroll cluster | Nómina · Clúster de nómina
title: Garnishments: what payroll really withheld, period by period | Embargos: lo que la nómina retuvo de verdad, periodo a periodo
tags:
  - IT0887
  - Payroll cluster | Clúster de nómina
  - SALV
---

# English

> For every court order: the debt, what payroll has withheld and what is pending, read from the payroll results, with the month-by-month detail one click away.

## Context

For every garnishment, payroll needs to know how much is left. The infotype holds the debt; what was really withheld lives in the payroll results, period by period. Starting from a garnishment report our team already had, I adapted it to a new client and built what it was missing.

## What I did

- **One line per garnishment:** employee, organisation, type, garnishment ID, issuing body, validity, total debt, withheld so far and pending.
- **Per-period detail** behind a checkbox: year, period, amount withheld, accumulated amount and pending after each period.
- Payroll results read from the start of the garnishment to its end or the cut-off date, archived periods included, counting each amount once.
- **Two drill-downs:** the garnishment ID opens its month-by-month detail in a popup, and the personnel number jumps to the record in PA30.
- Reviewed everything that belonged to the previous client: a hard-coded payroll area (now read from IT0001), a province derived from an organisational code convention, and subtype texts typed in the code.
- Wrote the technical design, so the client knew what the report does and how.

## Result {result}

Payroll answers “how much is left?” in seconds, and can show exactly when each amount was withheld.

## Lesson {lesson}

Reusing a report is not copying it: every hard-coded value is somebody else’s configuration.

# Español

> Para cada embargo: la deuda, lo que la nómina ha retenido y lo que queda pendiente, leído de los resultados de nómina, con el detalle mes a mes a un clic.

## Contexto

Para cada embargo, nómina necesita saber cuánto queda. El infotipo guarda la deuda; lo que se ha retenido de verdad vive en los resultados de nómina, periodo a periodo. Partiendo de un informe de embargos que ya tenía el equipo, lo adapté a un cliente nuevo y construí lo que le faltaba.

## Qué hice

- **Una línea por embargo:** empleado, organización, tipo, identificador del embargo, organismo emisor, vigencia, deuda total, retenido hasta la fecha y pendiente.
- **Detalle por periodo** detrás de una casilla: año, periodo, importe retenido, acumulado y pendiente tras cada periodo.
- Resultados de nómina leídos desde el inicio del embargo hasta su fin o la fecha de corte, periodos archivados incluidos, contando cada importe una sola vez.
- **Dos navegaciones:** el identificador del embargo abre su detalle mes a mes en una ventana, y el número de personal salta al registro en PA30.
- Revisé todo lo que venía del cliente anterior: un área de nómina fija en el código (ahora se lee del IT0001), una provincia deducida de una convención de códigos organizativos y textos de subtipo escritos en el código.
- Redacté el diseño técnico, para que el cliente supiera qué hace el informe y cómo.

## Resultado {result}

Nómina responde a «¿cuánto queda?» en segundos, y puede enseñar exactamente cuándo se retuvo cada importe.

## Lección {lesson}

Reutilizar un informe no es copiarlo: cada valor fijo en el código es la configuración de otro.

# Code

EN: Where the numbers come from: the garnishment lines of every payroll result, matched to the case and counted once per period. And the two drill-downs that make the report useful.
ES: De dónde salen los números: las líneas de embargo de cada resultado de nómina, emparejadas con el caso y contadas una vez por periodo. Y las dos navegaciones que hacen útil el informe.

## Payroll results | Resultados de nómina

`ZHR_GARNISHMENTS → BUILD_OUTPUT`

```abap
METHOD build_output.
  DATA lt_results  TYPE STANDARD TABLE OF payes_result WITH EMPTY KEY.
  DATA lv_withheld TYPE pc28p-gmamt.

  LOOP AT gt_p0887 INTO DATA(ls_case).
    " From the start of the garnishment to its end or the cut-off date
    DATA(lv_to) = COND d( WHEN ls_case-endda < p_cutoff THEN ls_case-endda ELSE p_cutoff ).  //1

    " Payroll periods from the employee's own payroll area (IT0001)
    DATA(lv_abkrs) = get_payroll_area( iv_pernr = ls_case-pernr iv_date = lv_to ).  //2
    DATA(ls_from)  = get_period( iv_date = ls_case-begda iv_abkrs = lv_abkrs ).  //2
    DATA(ls_until) = get_period( iv_date = lv_to         iv_abkrs = lv_abkrs ).  //2

    CLEAR: lt_results, lv_withheld.
    CALL FUNCTION 'HR_GET_PAYROLL_RESULTS'
      EXPORTING  pernr      = ls_case-pernr
                 pabrj      = ls_from-year
                 pabrp      = ls_from-period
                 pabrj_end  = ls_until-year
                 pabrp_end  = ls_until-period
                 actual     = 'A'
                 waers      = ls_case-waers
                 arch_too   = abap_true  //3
      TABLES     result_tab = lt_results
      EXCEPTIONS no_results = 1
                 OTHERS     = 2.

    LOOP AT lt_results INTO DATA(ls_result).
      LOOP AT ls_result-nat-garnt INTO DATA(ls_garn) WHERE gmcid = ls_case-gmcid.
        " Each amount once: only the line that belongs to this result's period.
        " Monthly payroll: the period is the line's start month (YYYYMM)
        CHECK ls_garn-begda(6) = ls_result-evp-inper.  //4
        lv_withheld = lv_withheld + ls_garn-gmamt.

        IF p_detail = abap_true.  //5
          APPEND VALUE #( pernr    = ls_case-pernr
                          gmcid    = ls_case-gmcid
                          year     = ls_result-evp-inper(4)
                          period   = ls_result-evp-inper+4(2)
                          withheld = ls_garn-gmamt
                          total    = lv_withheld
                          pending  = ls_case-gmdeb - lv_withheld ) TO gt_detail.
        ENDIF.
      ENDLOOP.
    ENDLOOP.

    APPEND VALUE #( BASE CORRESPONDING #( ls_case )
                    withheld = lv_withheld
                    pending  = ls_case-gmdeb - lv_withheld
                    locked   = xsdbool( ls_case-sprps = abap_true ) ) TO gt_out.
  ENDLOOP.
ENDMETHOD.
```

1. EN: Up to the end of the garnishment or the cut-off date, whichever comes first.
   ES: Hasta el fin del embargo o la fecha de corte, lo que llegue antes.
2. EN: The payroll area comes from IT0001. The report I started from had it hard-coded.
   ES: El área de nómina sale del IT0001. El informe del que partí la tenía fija en el código.
3. EN: Archived periods count too, so old garnishments still add up.
   ES: Los periodos archivados también cuentan, así que los embargos antiguos siguen cuadrando.
4. EN: Each amount counted once: only the garnishment line that belongs to the result’s own period. This relies on monthly payroll, where the period number is the month; with weekly or other periods, compare with the period’s dates instead.
   ES: Cada importe se cuenta una vez: solo la línea de embargo que pertenece al periodo del propio resultado. Esto se apoya en una nómina mensual, donde el número de periodo es el mes; con periodos semanales u otros, compara con las fechas del periodo.
5. EN: The per-period detail is built only when it is asked for, so the header stays fast.
   ES: El detalle por periodo solo se genera cuando se pide, así que la cabecera sigue siendo rápida.

## Drill-down | Navegación

`LCL_EVENTS → ON_LINK_CLICK`

```abap
METHOD on_link_click.                   " CL_SALV_EVENTS_TABLE, event LINK_CLICK
  DATA(ls_out) = gt_out[ row ].

  CASE column.
    WHEN 'GMCID'.                       " the garnishment, month by month  //1
      DATA(lt_detail) = FILTER #( gt_detail USING KEY by_case  //1
                                  WHERE pernr = ls_out-pernr AND gmcid = ls_out-gmcid ).  //1
      TRY.
          cl_salv_table=>factory( IMPORTING r_salv_table = DATA(lo_popup)
                                  CHANGING  t_table      = lt_detail ).
          lo_popup->set_screen_popup( start_column = 10 end_column = 110
                                      start_line   = 3  end_line   = 20 ).
          lo_popup->display( ).
        CATCH cx_salv_msg.
          MESSAGE 'The detail could not be displayed' TYPE 'S' DISPLAY LIKE 'E'.
      ENDTRY.

    WHEN 'PERNR'.                       " straight to the garnishment record  //2
      SET PARAMETER ID 'PER' FIELD ls_out-pernr.  //2
      SET PARAMETER ID 'ITP' FIELD '0887'.  //2
      SET PARAMETER ID 'SUB' FIELD ls_out-subty.  //2
      CALL TRANSACTION 'PA30' WITH AUTHORITY-CHECK AND SKIP FIRST SCREEN.  //2
  ENDCASE.
ENDMETHOD.
```

1. EN: The garnishment ID opens its own detail in a popup ALV. It is only a hotspot when the detail was requested.
   ES: El identificador del embargo abre su detalle en un ALV emergente. Solo es un hotspot cuando se ha pedido el detalle.
2. EN: The personnel number opens the garnishment infotype in PA30, with an authority check.
   ES: El número de personal abre el infotipo de embargos en PA30, con comprobación de autorizaciones.
