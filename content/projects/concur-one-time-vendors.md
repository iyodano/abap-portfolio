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
- Tax ID validated with each country's own rules (`TAX_NUMBER_CHECK`) and, for EU vendors, the VAT number checked with `EU_TAX_NUMBER_CHECK` and passed through `EXTENSION1`.
- Every document linked to its Concur report, so the standard never posts it twice.

## How I tell it {lesson half}

“I’m a payroll developer, but I got the FI side of Concur. The key was to split each report into one document per vendor and check them all before posting any: either the whole report goes in, or nothing does.”

## Next step {improve half}

Move the check and post calls, which repeat the same parameters in both passes, into one method, and cover the tax ID rules with a unit test per country.

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
- NIF validado con las reglas de su país (`TAX_NUMBER_CHECK`) y, en proveedores de la UE, el NIF-IVA comprobado con `EU_TAX_NUMBER_CHECK` y pasado por `EXTENSION1`.
- Cada documento enlazado con su informe de Concur, para que el estándar nunca lo contabilice dos veces.

## Cómo lo cuento {lesson half}

«Soy desarrollador de nómina, pero me tocó la parte FI de Concur. La clave fue partir cada informe en un documento por proveedor y comprobarlos todos antes de contabilizar ninguno: o entra el informe entero, o no entra nada.»

## Siguiente paso {improve half}

Llevar las llamadas de comprobación y contabilización, que repiten los mismos parámetros en las dos pasadas, a un único método, y cubrir las reglas de NIF con un test unitario por país.

# Code

EN: The split and the two passes, inside the enhancement that receives the expense documents before the standard posts them. And the tax ID check: the national tax ID with its country's rules and, in the EU, the VAT number too.
ES: La partición y las dos pasadas, dentro de la ampliación que recibe los documentos de gastos antes de que el estándar los contabilice. Y la comprobación del NIF: el nacional con las reglas de su país y, en la UE, también el NIF-IVA.

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
  IF line_exists( lt_return[ type = 'E' ] ) OR line_exists( lt_return[ type = 'A' ] ).  //6
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.  //6
    log_errors( lt_return ).            " rare after pass 1: a lock or a number range  //6
    EXIT.                               " documents already posted stay linked  //6
  ENDIF.  //6
  link_to_report( lv_obj_key ).         " BELNR / GJAHR stored with the report  //5
  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = abap_true.  //7
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
6. EN: The post result is checked too. After pass 1 a failure is rare (a lock, a number range), but if one happens, that document is rolled back and logged, and the ones already posted keep their link, so they are never posted twice.
   ES: También se comprueba el resultado de la contabilización. Tras la pasada 1 un fallo es raro (un bloqueo, un rango de números), pero si ocurre, ese documento se deshace y queda en el log, y los ya contabilizados conservan su enlace, así que nunca se contabilizan dos veces.
7. EN: One commit per document, with its link in the same unit of work: no document is ever saved without its link to the report.
   ES: Un commit por documento, con su enlace en la misma unidad de trabajo: ningún documento se guarda sin su enlace al informe.

## Tax ID check | Comprobación del NIF

`… → CHECK_TAX_ID`

```abap
METHOD check_tax_id.
  " Every vendor: national tax ID (tax number 1), with its country's rules.
  " EU vendors (T005-XEGLD) also carry a VAT number (STCEG), with its own check.
  DATA lv_tax1 TYPE stcd1.
  DATA lv_vat  TYPE stceg.
  lv_tax1 = is_vendor-tax_id.
  lv_vat  = is_vendor-vat_id.

  CALL FUNCTION 'TAX_NUMBER_CHECK'  //1
    EXPORTING  country    = is_vendor-country  //1
               tax_code_1 = lv_tax1  //1
    EXCEPTIONS OTHERS     = 1.  //1
  IF sy-subrc <> 0.
    rv_valid = abap_false.
    RETURN.
  ENDIF.

  SELECT SINGLE xegld FROM t005 WHERE land1 = @is_vendor-country INTO @DATA(lv_eu).  //2
  IF lv_eu = abap_true AND lv_vat IS NOT INITIAL.  //2
    CALL FUNCTION 'EU_TAX_NUMBER_CHECK'  //2
      EXPORTING  country       = is_vendor-country  //2
                 eu_tax_number = lv_vat  //2
      EXCEPTIONS OTHERS        = 1.  //2
    IF sy-subrc <> 0.
      rv_valid = abap_false.
      RETURN.
    ENDIF.
  ENDIF.

  rv_valid = abap_true.
ENDMETHOD.
```

1. EN: The national tax ID goes in tax number 1, the same field the split fills in the one-time vendor block, and SAP's own rules for that country check it.
   ES: El NIF nacional va en el número de identificación fiscal 1, el mismo campo que rellena la partición en el bloque CPD, y lo comprueban las reglas del propio SAP para ese país.
2. EN: The EU VAT number is a different field (STCEG) with its own check. It reaches the document through EXTENSION1 and a business transaction event (RWBAPI01).
   ES: El NIF-IVA comunitario es otro campo (STCEG) con su propia comprobación. Llega al documento por EXTENSION1 y un evento de BTE (RWBAPI01).
