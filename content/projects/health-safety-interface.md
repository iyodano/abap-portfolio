---
id: health-safety-interface
place: main
order: 30
category: ecp
size: normal
icon: shield
kicker: ECP integration · Web service | Integración ECP · Servicio web
title: ECP → health & safety system | ECP → sistema de prevención de riesgos
tags:
  - SOAP proxy | Proxy SOAP
  - Delta load | Carga delta
  - IT2001
  - CPI
---

# English

> Two web-service interfaces that keep the client’s occupational health system in sync: master data, sick leaves and work accidents, sending only what changed.

## Context

The health and safety department needed workers, companies, work centres, sick leaves and work accidents in its own system, without loading them by hand.

## Interface 1 · Master data in three steps {half}

- **Workers:** personal data, ID document and its type, address, email, social security data, contract type and occupation code. A change of document type is detected by comparing with the IT0002 history.
- **Companies and work centres:** tax ID, social security account and address; work centres from the personnel areas.
- **Periods:** history of company, position, category (IT0014 mapped through a custom table) and shift (work schedule from IT0007).

## Interface 2 · Temporary disability {half}

- **Work accidents** from IT2001, with a unique code built from the ID document and the start date.
- **Sick leaves** with the contingency type mapped through a custom table.
- **Relapses** linked to the original leave through the IT2001 link fields.
- **Leave ↔ accident:** a leave that starts within an accident of the same employee is linked to it.

## The technical core

- Delta load by infotype change date against the last run, with the initial load prepared separately. Each step keeps its own control date.
- The control date only moves forward after a successful call, so a failure is retried on the next run.
- SAP codes translated to the receiver’s codes with mapping tables. Open-ended dates (31.12.9999) are sent empty, as the receiver expects.

## Flow {flow}

Infotypes 0000–2001 -> Control table -> Delta selection and mapping -> SOAP proxy -> SAP Integration Suite -> Health & safety system

## Result {result half}

One initial load, then only changes, without losing or duplicating records.

## Next step {improve half}

Move the function modules into a class and read in bulk instead of inside loops. And catch deleted absences, which a change-date delta cannot see, with a change log written on save, like the one in the SFTP interfaces.

## Lesson {lesson}

Empty values are part of the contract. The WSDL said the contingency type was optional; in practice, an empty one made a whole block of records disappear in the receiver. Agree on empty values with the people on the other side, not with the WSDL.

# Español

> Dos interfaces por servicio web que mantienen sincronizado el sistema de prevención del cliente: datos maestros, bajas y accidentes de trabajo, enviando solo lo que cambia.

## Contexto

El departamento de prevención necesitaba tener en su sistema los trabajadores, empresas, centros de trabajo, bajas y accidentes, sin cargarlos a mano.

## Interfaz 1 · Datos maestros en tres pasos {half}

- **Trabajadores:** datos personales, documento de identidad y su tipo, dirección, email, datos de Seguridad Social, tipo de contrato y código de ocupación. Detecta el cambio de tipo de documento comparando con el historial del IT0002.
- **Empresas y centros:** CIF, código de cuenta de cotización y dirección; centros de trabajo a partir de las divisiones de personal.
- **Periodos:** historia de empresa, posición, categoría (IT0014 mapeada con una tabla a medida) y turno (plan de horario del IT0007).

## Interfaz 2 · Incapacidad temporal {half}

- **Accidentes de trabajo** desde el IT2001, con un código único formado por el documento de identidad y la fecha de inicio.
- **Bajas** con el tipo de contingencia mapeado con una tabla a medida.
- **Recaídas** enlazadas con la baja original a través de los campos de vínculo del IT2001.
- **Baja ↔ accidente:** una baja que empieza dentro de un accidente del mismo empleado se asocia a él.

## El núcleo técnico

- Carga delta por fecha de modificación del infotipo frente a la última ejecución, con la carga inicial preparada aparte. Cada paso tiene su propia fecha de control.
- La fecha de control solo avanza tras una llamada correcta, así que un fallo se reintenta en la siguiente ejecución.
- Códigos SAP traducidos a los del receptor con tablas de mapeo. Las fechas abiertas (31.12.9999) se envían vacías, como espera el receptor.

## Recorrido {flow}

Infotipos 0000–2001 -> Tabla de control -> Selección delta y mapeo -> Proxy SOAP -> SAP Integration Suite -> Sistema de prevención

## Resultado {result half}

Una carga inicial y después solo cambios, sin perder ni duplicar registros.

## Siguiente paso {improve half}

Pasar los módulos de funciones a una clase y leer en bloque en lugar de dentro de bucles. Y detectar los absentismos borrados, que un delta por fecha de modificación no puede ver, con un log de cambios escrito al grabar, como el de las interfaces SFTP.

## Lección {lesson}

Los valores vacíos son parte del contrato. El WSDL decía que el tipo de contingencia era opcional; en la práctica, uno vacío hacía desaparecer un bloque entero de registros en el receptor. Los vacíos se pactan con quien está al otro lado, no con el WSDL.

# Code

EN: The sick-leave step of the second interface: delta selection, code mapping, the leave ↔ accident link and a control date that only moves when the call succeeds.
ES: El paso de bajas de la segunda interfaz: selección delta, mapeo de códigos, el enlace baja ↔ accidente y una fecha de control que solo avanza si la llamada va bien.

## Sick leaves | Bajas

`Z_HR_OHS_SEND_WORK_LEAVES (function module)`

```abap
FUNCTION z_hr_ohs_send_work_leaves.
  CONSTANTS lc_work_accident TYPE subty VALUE '1300'.
  DATA ls_request TYPE zohs_work_leaves_request.

  " Delta: only absences changed since the last successful run
  SELECT SINGLE last_run FROM zhr_ohs_control
    WHERE process = 'WORK_LEAVES'
    INTO @DATA(lv_last_run).

  SELECT * FROM pa2001
    WHERE aedtm >= @lv_last_run  //1
    INTO TABLE @DATA(lt_pa2001).

  " lt_accidents comes from the accident step (code = ID document + start date),
  " declared SORTED ... WITH NON-UNIQUE KEY pernr  //5

  LOOP AT lt_pa2001 INTO DATA(ls_pa2001).
    SELECT SINGLE perid FROM pa0002
      WHERE pernr = @ls_pa2001-pernr AND begda <= @ls_pa2001-begda AND endda >= @ls_pa2001-begda
      INTO @DATA(lv_id).

    DATA(ls_leave) = VALUE zohs_work_leave(
      worker_id  = lv_id
      start_date = |{ ls_pa2001-begda DATE = ISO }|
      " Open-ended dates travel empty, as the receiver expects
      end_date   = COND #( WHEN ls_pa2001-endda <> '99991231'  //2
                           THEN |{ ls_pa2001-endda DATE = ISO }| ) ).  //2

    " Contingency type: subtypes the receiver knows travel as they are, the rest as OTHER
    IF ls_pa2001-subty = lc_work_accident.
      ls_leave-contingency_type = '-'.          " agreed placeholder, never empty  //4
    ELSE.
      SELECT SINGLE subty FROM zhr_ohs_cont_types  //3
        WHERE subty = @ls_pa2001-subty
        INTO @ls_leave-contingency_type.
      IF sy-subrc <> 0.
        ls_leave-contingency_type = 'OTHER'.  //3
      ENDIF.
    ENDIF.

    " A leave that starts inside an accident of the same employee belongs to it
    LOOP AT lt_accidents INTO DATA(ls_acc)  //5
         WHERE pernr = ls_pa2001-pernr  //5
           AND begda <= ls_pa2001-begda AND endda >= ls_pa2001-begda.  //5
      ls_leave-accident_code = ls_acc-code.
      EXIT.
    ENDLOOP.

    APPEND ls_leave TO ls_request-work_leaves.
  ENDLOOP.

  " Synchronous call: when it returns, the receiver has the data
  DATA ls_response TYPE zohs_work_leaves_response.
  TRY.
      NEW zco_ohs_work_leaves( logical_port_name = 'ZOHS_WORK_LEAVES' )->send(  //6
        EXPORTING output = ls_request  //6
        IMPORTING input  = ls_response ).  //6
      " The control date only moves after a successful call
      UPDATE zhr_ohs_control SET last_run = @sy-datum WHERE process = 'WORK_LEAVES'.  //7
    CATCH cx_ai_system_fault cx_ai_application_fault INTO DATA(lx_fault).
      ev_error = lx_fault->get_text( ).   " date untouched: the next run retries  //7
  ENDTRY.
ENDFUNCTION.
```

1. EN: Delta by the infotype’s change date against the last successful run, whatever the dates of the absence: a leave closed yesterday or one starting next month travels too. The initial load is the same code run from an old date.
   ES: Delta por la fecha de modificación del infotipo frente a la última ejecución correcta, sean cuales sean las fechas del absentismo: una baja cerrada ayer o una que empieza el mes que viene también viajan. La carga inicial es el mismo código lanzado desde una fecha antigua.
2. EN: Open-ended dates (31.12.9999) are sent empty, as the receiver expects.
   ES: Las fechas abiertas (31.12.9999) se envían vacías, como espera el receptor.
3. EN: Unknown absence types travel as OTHER, so a new type in SAP never breaks the message.
   ES: Los tipos de absentismo desconocidos viajan como OTHER, así que un tipo nuevo en SAP nunca rompe el mensaje.
4. EN: The empty value that wasn’t: with this field empty for accidents, not a single sick leave reached the receiver. A placeholder agreed with them fixed it.
   ES: El vacío que no lo era: con este campo vacío en los accidentes no llegaba ni una baja al receptor. Lo arregló un valor de relleno pactado con ellos.
5. EN: One employee can have several accidents, so the link table needs a non-unique key.
   ES: Un empleado puede tener varios accidentes, así que la tabla del enlace necesita una clave no única.
6. EN: A synchronous proxy: request and response in the same call, and business errors from the receiver arrive as cx_ai_application_fault.
   ES: Un proxy síncrono: petición y respuesta en la misma llamada, y los errores de negocio del receptor llegan como cx_ai_application_fault.
7. EN: If the call fails, the control date stays where it was and the next run sends the same changes again.
   ES: Si la llamada falla, la fecha de control no se mueve y la siguiente ejecución vuelve a enviar los mismos cambios.
