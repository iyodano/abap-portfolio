---
# ───────────────────────────────────────────────────────────────────────────────
#  PLANTILLA DE PROYECTO · copia de trabajo para un proyecto nuevo
#
#  1. Crea tu fichero:  node build.mjs new mi-proyecto     (o npm run new -- mi-proyecto)
#     Aparece en content/projects/mi-proyecto.md, ya como borrador.
#  2. Rellena los datos de este bloque y redacta los textos de abajo.
#     Todo lo que lleva " | " es  Inglés | Español.
#  3. Mira cómo queda:  node build.mjs --watch  con Live Server abierto: cada vez que
#     guardas, la web se regenera y se recarga sola.
#  4. Cuando esté listo, borra la línea "draft: yes" y guarda.
#
#  Las líneas que empiezan por # y lo que va detrás de "  #" son notas: no salen en la web.
# ───────────────────────────────────────────────────────────────────────────────
id: my-project            # nombre en la URL (danroca.com/#my-project): minúsculas, números y guiones
draft: yes                # mientras exista esta línea, el proyecto no se publica
place: main               # main = portada  ·  more = dentro de «Más proyectos»
order: 90                 # orden dentro de su sitio: los números bajos van primero (portada: 10…80 ya usados)
category: ecp             # solo portada: ecp · payroll · beyond  (decide el filtro)
size: normal              # solo portada: normal (una columna) · wide (tarjeta ancha)
icon: sync                # sync coin shield send scale bank receipt retro pulse layers code term box map route clock lock bulb wand user link mail check alert
kicker: ECP integration · Replication | Integración ECP · Replicación
title: A short, specific title | Un título corto y concreto
short:                    # solo «Más proyectos»: texto corto de la etiqueta en la franja, p. ej.  PCC: 403 to working | PCC: del 403 a funcionar
status:                   # opcional, p. ej.  In testing | En pruebas
flow:                     # opcional, solo portada: mini-esquema, p. ej.  Employee Central -> Replication BAdI | BAdI de replicación -> IT9001
tags:                     # etiquetas de la tarjeta, una por línea
  - BAdI
  - Payroll cluster | Clúster de nómina
---

<!--
  CÓMO SE CONVIERTE ESTO EN LA TARJETA
  · La línea que empieza por ">" es el texto que se ve en la tarjeta (en «Más proyectos», la línea bajo el título).
  · Cada "## Título" es un apartado de la tarjeta abierta. Puedes poner los que quieras, con el nombre que quieras.
  · Al final del título puedes añadir un modificador entre llaves:
      {result}   caja verde (resultado)
      {lesson}   caja azul (lección)
      {improve}  caja naranja (próxima mejora)
      {flow}     el texto "A -> B -> C" se pinta como un recorrido con etiquetas
      {half}     dos apartados seguidos con {half} van uno al lado del otro (se puede combinar: {result half})
  · El código se coloca solo justo antes de la primera caja ({result}, {lesson} o {improve}).
  · Formato del texto: **negrita**, `código` (para objetos SAP: `BAPI_ACC_DOCUMENT_POST`), *cursiva*,
    listas con "- " y enlaces [texto](https://…). Pon siempre entre `comillas invertidas` lo que lleve < o >.
-->

# English

> One or two sentences for the card: the problem and what you built.

## Context

What the business needed, in two or three sentences. No client names: "a client in the energy sector".

## What I did

- One line per decision or piece of the solution. Put the key idea in **bold**.
- SAP objects in code format: `HRPAD00INFTY`, `IT0008`.

## Flow {flow}

Employee Central -> Replication BAdI -> IT9001

## Result {result}

What changed for the business. A number if you have one.

## Lesson {lesson}

The one thing you would tell another developer.

# Español

> Una o dos frases para la tarjeta: el problema y qué construiste.

## Contexto

Qué necesitaba negocio, en dos o tres frases. Sin nombres de clientes: «un cliente del sector energético».

## Qué hice

- Una línea por decisión o pieza de la solución. La idea clave en **negrita**.
- Los objetos SAP en formato código: `HRPAD00INFTY`, `IT0008`.

## Recorrido {flow}

Employee Central -> BAdI de replicación -> IT9001

## Resultado {result}

Qué cambió para el negocio. Un número, si lo tienes.

## Lección {lesson}

Lo único que le contarías a otro desarrollador.

<!--
  EL CÓDIGO (opcional: si borras todo desde "# Code" hasta el final, la tarjeta sale sin apartado de código)
  · "EN:" y "ES:" son la introducción del apartado.
  · Cada "## Nombre | Nombre" es una pestaña (si solo hay una, no se ven pestañas).
  · La línea entre `comillas invertidas` es el objeto que se muestra encima del código.
  · Dentro del código, añade  //1  al final de una línea para unirla a la nota 1 (y así con las demás).
    Varias líneas pueden llevar el mismo número, aunque estén separadas.
  · Las notas van debajo, numeradas, con su línea EN: y su línea ES:.
  · En lugar de código, una pestaña puede llevar una tabla Markdown. En las celdas,  English // Español
    y [[INF]] pinta una etiqueta de color (INF, CLS, RUT, SYS, CRU).
-->

# Code

EN: One sentence on what this code shows and why it matters.
ES: Una frase sobre qué enseña este código y por qué importa.

## Main logic | Lógica principal

`ZCL_HR_MY_CLASS → MY_METHOD`

```abap
METHOD my_method.
  " Comments in English: the code is the same in both languages
  SELECT SINGLE * FROM zhr_my_table
    WHERE pernr = @iv_pernr
    INTO @DATA(ls_row).                                   //1
  IF sy-subrc <> 0.
    RETURN.                                               //2
  ENDIF.
ENDMETHOD.
```

1. EN: What line 1 does and why it is there.
   ES: Qué hace esa línea y por qué está ahí.
2. EN: Another detail worth pointing out.
   ES: Otro detalle que merece la pena señalar.
