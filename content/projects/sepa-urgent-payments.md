---
id: sepa-urgent-payments
place: more
order: 30
icon: bank
kicker: Payroll · Bank transfers | Nómina · Transferencias
title: SEPA payroll transfers: urgent payments and categories | Transferencias SEPA de nómina: pagos urgentes y categorías
short: SEPA urgent payments | SEPA urgentes
status: In testing | En pruebas
---

# English

> The transfer file sets urgency and payment category from a table that payroll maintains.

## Context

Payroll needed to flag some transfers as urgent (severance pay, advances) and set the payment category in the SEPA XML, without changing the payment method in IT0009.

## What I did

- A custom table, maintained by payroll per employee and payment date, with an urgent flag and an internal category (salary, advance, settlement, severance) that maps to the ISO 20022 code the bank expects, such as SALA.
- A DMEE exit for the payment tree that fills `InstrPrty` (HIGH), `SvcLvl` (URGP or SEPA), `CtgyPurp` and the remittance text.
- No entry in the table means standard behaviour: the code only writes when there is something to change.
- Buffered reads, records marked as processed once used, and processed entries locked against edits.

## Lessons {lesson}

Write to the parameter where the value arrives: some DMEE nodes carry it in `C_VALUE` and others in `O_VALUE`.

The category is set per payment block, not per transaction, so urgent and normal payments should not be mixed in one run. And SEPA does not accept accented characters.

# Español

> El fichero de transferencias marca la urgencia y la categoría del pago desde una tabla que mantiene nómina.

## Contexto

Nómina necesitaba marcar algunas transferencias como urgentes (finiquitos, anticipos) e informar la categoría del pago en el XML SEPA, sin cambiar la vía de pago del IT0009.

## Qué hice

- Una tabla a medida, mantenida por nómina por empleado y fecha de pago, con una marca de urgencia y una categoría interna (nómina, anticipo, finiquito, indemnización) que se traduce al código ISO 20022 que espera el banco, como SALA.
- Un exit de DMEE para el árbol de pagos que informa `InstrPrty` (HIGH), `SvcLvl` (URGP o SEPA), `CtgyPurp` y el texto del concepto.
- Sin entrada en la tabla, comportamiento estándar: el código solo escribe cuando hay algo que cambiar.
- Lecturas con buffer, registros marcados como procesados una vez usados y entradas procesadas bloqueadas para que no se editen.

## Lecciones {lesson}

Escribe en el parámetro por el que llega el valor: unos nodos de DMEE lo traen en `C_VALUE` y otros en `O_VALUE`.

La categoría se informa por bloque de pago, no por transacción, así que los pagos urgentes y los normales no deberían ir mezclados en la misma ejecución. Y SEPA no admite tildes.
