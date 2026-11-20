---
id: concur-one-time-vendors
place: main
order: 70
category: beyond
size: normal
icon: receipt
kicker: Beyond payroll · FI | Más allá de la nómina · FI
title: Concur expenses to FI with one-time vendors | Gastos de Concur a FI con acreedores CPD
tags:
  - FI
  - BAPI
  - SAP Concur
---

# English

> Expense reports with occasional vendors from several countries, posted one document per vendor and all checked before any is posted.

## Why it was hard

- Expenses with vendors that do not exist in master data (hotels, restaurants) from different countries are posted to a one-time vendor account.
- The same vendor number for all of them, depending on the company code; the real vendor data (name, tax ID, country) travels in the one-time data block.
- Concur and SAP data had to be crossed and built in a specific order of line items and steps.
- The blocker: `BAPI_ACC_DOCUMENT_POST` accepts only one one-time vendor per document, and one expense report could have several.

## How I solved it

- Split the report: one FI document per one-time vendor, each with two lines, the employee’s vendor account and the one-time vendor with its withholding tax.
- A unique reference per document (base plus counter) so it never hits the duplicate check.
- Two passes: `BAPI_ACC_DOCUMENT_CHECK` for every document first and, only if all pass, post and commit. If one fails, it is logged and the report goes back flagged as an error.
- Tax ID validated per country (Spain, EU and the rest) with `TAX_NUMBER_CHECK`, and the EU VAT number passed through `EXTENSION1`.
- Every document linked to its Concur report, so the standard never posts it twice.

## How I tell it {lesson half}

“I’m a payroll developer, but I got the FI side of Concur. The key was to split each report into one document per vendor and check them all before posting any: either the whole report goes in, or nothing does.”

## What I would improve {improve half}

One commit at the end instead of one per document; match vendors by tax ID instead of by position; and move the duplicated check and post blocks into one method.

# Español

> Informes de gastos con proveedores ocasionales de varios países, contabilizados con un documento por proveedor y todos comprobados antes de contabilizar ninguno.

## Por qué era difícil

- Los gastos con proveedores que no existen en el maestro (hoteles, restaurantes) de distintos países se contabilizan contra un acreedor CPD (One Time Vendor).
- El mismo número de acreedor para todos, dependiente de la sociedad; los datos reales del proveedor (nombre, NIF, país) viajan en el bloque de datos CPD.
- Había que cruzar datos de Concur y de SAP y montarlo todo en un orden concreto de posiciones y de pasos.
- El bloqueo: `BAPI_ACC_DOCUMENT_POST` solo admite un acreedor CPD por documento, y un informe de gastos podía traer varios.

## Cómo lo resolví

- Partir el informe: un documento FI por acreedor CPD, cada uno con dos posiciones, el acreedor del empleado y el acreedor CPD con sus retenciones.
- Una referencia única por documento (base más contador) para no chocar con el control de duplicados.
- Dos pasadas: primero `BAPI_ACC_DOCUMENT_CHECK` para todos los documentos y, solo si pasan todos, contabilizar y hacer commit. Si uno falla, queda en el log y el informe vuelve marcado como error.
- NIF validado por país (España, UE y resto) con `TAX_NUMBER_CHECK`, y el NIF comunitario pasado por `EXTENSION1`.
- Cada documento enlazado con su informe de Concur, para que el estándar nunca lo contabilice dos veces.

## Cómo lo cuento {lesson half}

«Soy desarrollador de nómina, pero me tocó la parte FI de Concur. La clave fue partir cada informe en un documento por proveedor y comprobarlos todos antes de contabilizar ninguno: o entra el informe entero, o no entra nada.»

## Qué mejoraría {improve half}

Un solo commit al final en lugar de uno por documento; emparejar los proveedores por NIF y no por posición; y llevar los bloques duplicados de comprobación y contabilización a un único método.

# Code

EN: The split and the two passes, inside the enhancement that receives the expense documents before the standard posts them. And the per-country check that decides which field the tax ID goes in.
ES: La partición y las dos pasadas, dentro de la ampliación que recibe los documentos de gastos antes de que el estándar los contabilice. Y la comprobación por país que decide en qué campo va el NIF.

## Split + two passes | Partición + dos pasadas

`Concur → FI enhancement · POST_ONE_TIME_VENDORS`

```abap
" One FI document per one-time vendor
LOOP AT lt_vendors INTO DATA(ls_vendor).  //1
  DATA(lv_n) = sy-tabix.
  APPEND VALUE ty_fi_doc(
    header  = VALUE #( BASE ls_header ref_doc_no = |{ lv_ref_base } { lv_n }| )  //2
    payable = VALUE #( ( itemno_acc = 1 vendor_no = lv_employee_vendor )  //3
                       ( itemno_acc = 2 vendor_no = lv_one_time_vendor ) )  //3
    amounts = VALUE #( ( itemno_acc = 1 currency = ls_vendor-waers amt_doccur = 0 - ls_vendor-amount )  //3
                       ( itemno_acc = 2 currency = ls_vendor-waers amt_doccur = ls_vendor-amount ) )  //3
    wtax    = renumber_wtax( it_wtax = ls_vendor-wtax iv_item = 2 )
    cpd     = VALUE #( name = ls_vendor-name city = ls_vendor-city
                       country = ls_vendor-country tax_no_1 = ls_vendor-tax_id )
    ext     = VALUE #( ( field1 = 'STCEG' field2 = ls_vendor-vat_id ) ) ) TO lt_docs.
ENDLOOP.

" Pass 1: check every document, post none
LOOP AT lt_docs INTO DATA(ls_doc).
  CALL FUNCTION 'BAPI_ACC_DOCUMENT_CHECK'
    EXPORTING documentheader = ls_doc-header
              customercpd    = ls_doc-cpd
    TABLES    accountpayable = ls_doc-payable
              currencyamount = ls_doc-amounts
              accountwt      = ls_doc-wtax
              extension1     = ls_doc-ext
              return         = lt_return.
  IF line_exists( lt_return[ type = 'E' ] ) OR line_exists( lt_return[ type = 'A' ] ).  //4
    log_errors( lt_return ).            " back to the standard flow, flagged as an error  //4
    RETURN.  //4
  ENDIF.
ENDLOOP.

" Pass 2: all valid, so post them and link each one to its Concur report
LOOP AT lt_docs INTO ls_doc.
  CALL FUNCTION 'BAPI_ACC_DOCUMENT_POST'
    EXPORTING documentheader = ls_doc-header
              customercpd    = ls_doc-cpd
    IMPORTING obj_key        = lv_obj_key
    TABLES    accountpayable = ls_doc-payable
              currencyamount = ls_doc-amounts
              accountwt      = ls_doc-wtax
              extension1     = ls_doc-ext
              return         = lt_return.
  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = abap_true.  //6
  link_to_report( lv_obj_key ).         " BELNR / GJAHR stored with the report  //5
ENDLOOP.

CLEAR ct_acc_documents.                 " the standard must not post them again  //5
```

1. EN: One document per one-time vendor: the BAPI accepts a single CUSTOMERCPD block per document.
   ES: Un documento por acreedor CPD: la BAPI solo admite un bloque CUSTOMERCPD por documento.
2. EN: Base reference plus a counter, so the duplicate check never blocks the second document.
   ES: Referencia base más contador, para que el control de duplicados nunca bloquee el segundo documento.
3. EN: Two lines per document, balanced: the employee’s vendor account against the one-time vendor.
   ES: Dos posiciones por documento, cuadradas: el acreedor del empleado frente al acreedor CPD.
4. EN: Pass 1 checks everything and posts nothing. One error and the whole report goes back, flagged.
   ES: La pasada 1 lo comprueba todo y no contabiliza nada. Un error y el informe entero vuelve, marcado.
5. EN: Pass 2 posts and links every document to its Concur report, so the standard never posts it twice.
   ES: La pasada 2 contabiliza y enlaza cada documento con su informe de Concur, para que el estándar nunca lo contabilice dos veces.
6. EN: Honest note: the commit is per document. A single commit at the end would make pass 2 fully atomic.
   ES: Nota sincera: el commit es por documento. Un único commit al final haría la pasada 2 totalmente atómica.

## Tax ID by country | NIF por país

`… → CHECK_TAX_ID`

```abap
METHOD check_tax_id.
  " Spain: national tax ID. EU countries (T005-XEGLD): VAT number. Elsewhere: tax number 5.
  SELECT SINGLE xegld FROM t005 WHERE land1 = @is_vendor-country INTO @DATA(lv_eu).  //1

  DATA lv_tax1 TYPE stcd1.
  DATA lv_tax3 TYPE stcd3.
  DATA lv_tax5 TYPE stcd5.
  IF is_vendor-country = 'ES'.  //1
    lv_tax1 = is_vendor-tax_id.  //1
  ELSEIF lv_eu = abap_true.  //1
    lv_tax3 = is_vendor-tax_id.  //1
  ELSE.  //1
    lv_tax5 = is_vendor-tax_id.  //1
  ENDIF.  //1

  CALL FUNCTION 'TAX_NUMBER_CHECK'  //2
    EXPORTING  country    = is_vendor-country
               tax_code_1 = lv_tax1
               tax_code_3 = lv_tax3
               tax_code_5 = lv_tax5
    EXCEPTIONS OTHERS     = 1.
  rv_valid = xsdbool( sy-subrc = 0 ).
ENDMETHOD.
```

1. EN: Each country’s tax ID goes in the field its check rules expect.
   ES: El NIF de cada país va en el campo que esperan sus reglas de comprobación.
2. EN: The country-specific rules are SAP’s own: the code only decides which field to fill.
   ES: Las reglas de cada país son las del propio SAP: el código solo decide qué campo rellenar.
