---
id: concur-employee-files
place: more
order: 40
icon: receipt
kicker: Beyond payroll · HCM → Concur | Más allá de la nómina · HCM → Concur
title: Employee files for SAP Concur: approvers and travel profile | Ficheros de empleados para SAP Concur: aprobadores y perfil de viaje
short: Concur employee files | Ficheros de Concur
---

# English

> Two evolutives on the report that feeds Concur with employees.

## Context

A custom report builds the employee file that SAP Concur imports, either on the PC or on the application server. The business needed two new things in it.

## What I did

- **Record 305 · second approver:** read from a custom table maintained by the business. A `CLEAR` in the right place stops an employee from inheriting the approver of the previous one in the loop.
- **Record 350 · travel profile:** travel class derived from the job level, and the org unit mapped through a customizing table instead of the code, resolved by personnel subarea, then personnel area, then company code.

## Lesson {lesson}

In a loop, clear everything that belongs to the employee. A leftover value does not fail: it just says something false.

# Español

> Dos evolutivos sobre el informe que alimenta Concur con los empleados.

## Contexto

Un informe a medida genera el fichero de empleados que importa SAP Concur, en el PC o en el servidor de aplicación. Negocio necesitaba dos cosas nuevas en él.

## Qué hice

- **Registro 305 · segundo aprobador:** leído de una tabla a medida que mantiene negocio. Un `CLEAR` en el sitio justo evita que un empleado herede el aprobador del anterior en el bucle.
- **Registro 350 · perfil de viaje:** clase de viaje según el nivel del puesto, y la unidad organizativa mapeada en una tabla de customizing en lugar de en el código, resuelta por subdivisión, después por división y después por sociedad.

## Lección {lesson}

En un bucle, limpia todo lo que pertenece al empleado. Un valor que se queda de la vuelta anterior no falla: simplemente dice algo falso.
