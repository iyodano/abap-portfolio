---
id: custom-infotype-replication
place: main
order: 10
category: ecp
size: wide
icon: sync
kicker: ECP integration · Replication | Integración ECP · Replicación
title: A custom infotype fed by the EC → ECP replication | Un infotipo a medida alimentado por la replicación EC → ECP
flow: Employee Central -> Compound Employee API -> Common BAdI | BAdI común -> IF_HRPA_MASTERDATA_BL -> IT9001
tags:
  - PM01
  - Replication BAdI | BAdI de replicación
  - Infotype framework | Framework de infotipos
---

# English

> Seven organisational fields from SuccessFactors land in a custom infotype during the replication itself, in the same unit of work as the standard infotypes, with errors in the replication log.

## Context

The business needed seven organisational attributes that live in Employee Central (general management, division, department, area, sub-area, group and pay scale) inside ECP, to use them in payroll reporting. The specification was a short email.

## What I did

- Created infotype 9001 with PM01: structure, own data elements and screens. I proposed the time constraint and wrote down the open decisions (field lengths, empty values, how SuccessFactors writes) for the functional team.
- Put the logic in the common replication BAdI (`PROCESS_EMPLOYEE_COMMON_ADDIN`), split into one private method per infotype, so an early `RETURN` in one cannot cut the other.
- Wrote the infotype through the replication's own infotype framework (`IF_HRPA_MASTERDATA_BL`): no staging table, no extra job and no `COMMIT` of my own. Errors reach the employee's replication log through the BIB message handler.
- Made it idempotent: replicating the same employee twice creates nothing, and a future-dated change in EC delimits the current record.
- Applied the cut-off date (1 January) in code for this infotype only, because the BIB transfer start date is global and would also affect payroll infotypes.
- Read the pay grade generically from the compensation value list, so it keeps working if SAP adds it as its own component.
- Made the fields read-only in PA30: SuccessFactors is the master, SAP receives.

## Flow {flow}

Employee Central -> Compound Employee API -> Common replication BAdI -> IF_HRPA_MASTERDATA_BL -> Infotype 9001 -> Headcount report

## Result {result}

The data reaches ECP with every replication run, errors appear in the replication log like any standard error, and the headcount report reads the new fields through its mapping table without new code.

## Lesson {lesson}

Transport the whole class. Once, a method travelled without its declaration: in the target system the BAdI class had a syntax error, and a broken replication BAdI stops the replication for every employee, not just one infotype.

# Español

> Siete campos organizativos de SuccessFactors llegan a un infotipo a medida durante la propia replicación, en la misma unidad de trabajo que los infotipos estándar y con los errores en el log de replicación.

## Contexto

Negocio necesitaba en ECP siete atributos organizativos que viven en Employee Central (dirección general, dirección, departamento, área, subárea, grupo y escala) para explotarlos en informes de nómina. La especificación era un correo de pocas líneas.

## Qué hice

- Creé el infotipo 9001 con PM01: estructura, elementos de datos propios y pantallas. Propuse la restricción temporal y dejé por escrito las decisiones abiertas (longitudes, valores vacíos, cómo escribe SuccessFactors) para el equipo funcional.
- Puse la lógica en la BAdI común de la replicación (`PROCESS_EMPLOYEE_COMMON_ADDIN`), separada en un método privado por infotipo, para que un `RETURN` temprano en uno no corte el otro.
- Grabé el infotipo a través del propio framework de infotipos de la replicación (`IF_HRPA_MASTERDATA_BL`): sin tabla intermedia, sin job adicional y sin `COMMIT` propio. Los errores llegan al log de replicación del empleado mediante el message handler del BIB.
- Lo hice idempotente: replicar dos veces el mismo empleado no crea nada, y un cambio con fecha futura en EC delimita el registro vigente.
- Apliqué la fecha de corte (1 de enero) en código y solo para este infotipo, porque la fecha de inicio de transferencia del BIB es global y afectaría también a los infotipos de nómina.
- Leí el pay grade de forma genérica desde la lista de valores de compensación, para que siga funcionando si SAP lo añade como componente propio.
- Dejé los campos en solo lectura en PA30: SuccessFactors manda, SAP recibe.

## Recorrido {flow}

Employee Central -> Compound Employee API -> BAdI común de replicación -> IF_HRPA_MASTERDATA_BL -> Infotipo 9001 -> Informe de plantilla

## Resultado {result}

Los datos llegan a ECP en cada ejecución de la replicación, los errores aparecen en el log de replicación como cualquier error estándar y el informe de plantilla lee los campos nuevos desde su tabla de mapeo, sin código nuevo.

## Lección {lesson}

Transporta la clase entera. Una vez viajó un método sin su declaración: en el sistema destino la clase de la BAdI quedó con un error de sintaxis, y una BAdI de replicación rota para la replicación de todos los empleados, no solo de un infotipo.

# Code

EN: The method the common replication BAdI calls for infotype 9001. Everything that makes it safe to run on every replication is here: the cut-off for this infotype only, a generic pay grade, idempotency and no commit of its own. The insert itself is in Docs, under “Writing an infotype inside the replication”.
ES: El método al que llama la BAdI común de la replicación para el infotipo 9001. Aquí está todo lo que permite ejecutarlo en cada replicación sin miedo: la fecha de corte solo para este infotipo, el pay grade genérico, la idempotencia y ningún commit propio. La inserción en sí está en Documentación, en «Grabar un infotipo dentro de la replicación».

## Replication BAdI | BAdI de replicación

`ZCL_HR_EC_REPL_COMMON → PROCESS_IT9001`

```abap
METHOD process_it9001.
  " Called by the common replication BAdI once per employee.
  " One private method per infotype: an early RETURN here never skips IT0008.

  " EC job information already mapped to the seven IT9001 fields, oldest first
  DATA(lt_new) = map_job_info( it_job_info ).

  " Cut-off for this infotype only: the BIB transfer start date is global
  " and would also hold back the payroll infotypes
  DELETE lt_new WHERE endda < mv_cutoff.  //1
  LOOP AT lt_new ASSIGNING FIELD-SYMBOL(<ls_new>) WHERE begda < mv_cutoff.  //1
    <ls_new>-begda = mv_cutoff.  //1
  ENDLOOP.  //1

  " Pay grade read by name from the compensation value list
  READ TABLE it_comp_values INTO DATA(ls_grade) WITH KEY name = mc_pay_grade.  //2
  MODIFY lt_new FROM VALUE p9001( pay_grade = ls_grade-value )  //2
         TRANSPORTING pay_grade WHERE pernr = iv_pernr.  //2

  DATA(lt_current) = read_pa9001( iv_pernr ).

  LOOP AT lt_new INTO DATA(ls_new).
    " Replicating the same employee twice writes nothing
    IF is_unchanged( is_new = ls_new it_current = lt_current ).  //3
      CONTINUE.  //3
    ENDIF.  //3

    " Through the BIB's own infotype framework (IF_HRPA_MASTERDATA_BL):
    " time constraint 1 delimits the current record
    IF insert_9001( is_record = ls_new io_messages = io_message_handler ) = abap_false.  //4
      RETURN.          " the error is already in the employee's replication log  //4
    ENDIF.
  ENDLOOP.
  " No COMMIT WORK: the BIB commits per employee, standard and custom infotypes together  //5
ENDMETHOD.
```

1. EN: Cut-off in code, for IT9001 only. The BIB transfer start date would have applied it to every infotype, payroll ones included.
   ES: Fecha de corte en código y solo para el IT9001. La fecha de inicio de transferencia del BIB la habría aplicado a todos los infotipos, también a los de nómina.
2. EN: The pay grade is looked up by name, not by position: if a later SAP release ships it as its own field, the mapping does not break.
   ES: El pay grade se busca por nombre, no por posición: si una release posterior de SAP lo trae como campo propio, el mapeo no se rompe.
3. EN: Idempotent by design: the replication can run as often as it needs to.
   ES: Idempotente por diseño: la replicación puede ejecutarse tantas veces como haga falta.
4. EN: No staging table and no job: the record is written in the same unit of work as the standard infotypes, and a failure shows up in the employee’s replication log.
   ES: Sin tabla intermedia ni job: el registro se graba en la misma unidad de trabajo que los infotipos estándar y, si falla, el error aparece en el log de replicación del empleado.
5. EN: One commit per employee, and it belongs to the BIB. A COMMIT here would split the unit of work.
   ES: Un commit por empleado, y es del BIB. Un COMMIT aquí partiría la unidad de trabajo.
