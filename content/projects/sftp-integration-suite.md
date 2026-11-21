---
id: sftp-integration-suite
place: main
order: 40
category: ecp
size: wide
icon: send
kicker: ECP integration · SAP Integration Suite | Integración ECP · SAP Integration Suite
title: Unattended interfaces to SFTP through SAP Integration Suite | Interfaces desatendidas al SFTP con SAP Integration Suite
flow: IT2001 save | Grabación IT2001 -> BAdI + log table | BAdI + tabla de log -> Daily job | Job diario -> SOAP proxy · Base64 | Proxy SOAP · Base64 -> iFlow -> SFTP
tags:
  - CPI
  - SOAP proxy | Proxy SOAP
  - HRPAD00INFTY
  - Base64
  - SLG1
---

# English

> Payroll files for a time-and-attendance provider, and every absence change for the client’s own system, sent every day through SAP Integration Suite. Nobody touches anything, and every record can be traced to the file it travelled in.

## Context

Two needs, one pattern. A time-and-attendance provider abroad needed payroll files for two sites, per environment, on its SFTP server. And the client’s own system needed every absence change from ECP without anyone exporting it by hand.

## Interface 1 · Files for a provider {half}

- A service class reads the files from the application server (AL11), encodes them in Base64 and calls the consumer proxy generated from the iFlow’s WSDL, with its logical port in SOAMANAGER.
- A configuration table per process, file and environment, so a new site is a table entry, not a code change.
- SAP Integration Suite writes the file to the right SFTP folder and keeps a backup. ABAP deletes the original only after a successful call.
- Every read, send and move is logged in SLG1, and an email goes out when something fails.

## Interface 2 · Absences, change by change {half}

- A BAdI on infotype saves (`HRPAD00INFTY`, `IN_UPDATE`) turns every IT2001 change into one clean operation for the receiver: insert, change or delete, delimitations included.
- A new start date on a record already sent becomes a delete of the old key plus an insert of the new one.
- While a record is still pending, changes are consolidated into it: the receiver never gets duplicates or intermediate steps.
- A daily job builds the CSV from the pending records, keeps a copy on the server, sends it and marks each record as sent with its file name and time stamp. A resend mode rebuilds any file from the log.

## Flow {flow}

IT2001 save / AL11 -> BAdI + log table -> Job -> Consumer proxy -> iFlow -> SFTP

## Result {result}

Both flows run every day without anyone touching them, and every record can be traced to the file it travelled in.

## Lessons {lesson half}

With a one-way service, “OK” in SAP only means the message reached SAP Integration Suite. The real check is the CPI message monitor and SRT_UTIL.

Encode the xstring directly (`cl_http_utility=>encode_x_base64`) so the file arrives byte for byte, line endings included.

## Next step {improve half}

Mark records as sent only when the receiver confirms, not when the proxy call succeeds. And move the BAdI logic into its own class, so the BAdI only calls it and the logic can be unit-tested.

# Español

> Ficheros de nómina para un proveedor de control horario y cada cambio de absentismo para el sistema del propio cliente, enviados cada día con SAP Integration Suite. Nadie toca nada, y cada registro se puede rastrear hasta el fichero en el que viajó.

## Contexto

Dos necesidades, un mismo patrón. Un proveedor de control horario en el extranjero necesitaba en su SFTP ficheros de nómina de dos centros, por entorno. Y el sistema del propio cliente necesitaba cada cambio de absentismo de ECP sin que nadie lo exportara a mano.

## Interfaz 1 · Ficheros para un proveedor {half}

- Una clase de servicio lee los ficheros del servidor de aplicación (AL11), los codifica en Base64 y llama al proxy consumidor generado desde el WSDL del iFlow, con su puerto lógico en SOAMANAGER.
- Una tabla de configuración por proceso, fichero y entorno, para que un centro nuevo sea una entrada en la tabla y no un cambio de código.
- SAP Integration Suite escribe el fichero en la carpeta del SFTP que corresponde y guarda una copia de seguridad. ABAP solo borra el original tras una llamada correcta.
- Cada lectura, envío y movimiento queda en SLG1, y sale un correo cuando algo falla.

## Interfaz 2 · Absentismos, cambio a cambio {half}

- Una BAdI de grabación de infotipos (`HRPAD00INFTY`, `IN_UPDATE`) convierte cada cambio del IT2001 en una operación limpia para el receptor: alta, modificación o borrado, delimitaciones incluidas.
- Una fecha de inicio nueva en un registro ya enviado se convierte en el borrado de la clave antigua más el alta de la nueva.
- Mientras un registro sigue pendiente, los cambios se consolidan en él: el receptor nunca recibe duplicados ni pasos intermedios.
- Un job diario genera el CSV con los registros pendientes, guarda una copia en el servidor, lo envía y marca cada registro como enviado con su nombre de fichero y su marca de tiempo. Un modo de reenvío reconstruye cualquier fichero desde el log.

## Recorrido {flow}

Grabación IT2001 / AL11 -> BAdI + tabla de log -> Job -> Proxy consumidor -> iFlow -> SFTP

## Resultado {result}

Los dos flujos se ejecutan cada día sin que nadie los toque, y cada registro se puede rastrear hasta el fichero en el que viajó.

## Lecciones {lesson half}

Con un servicio one-way, el «OK» de SAP solo significa que el mensaje llegó a SAP Integration Suite. La comprobación real está en el monitor de mensajes de CPI y en SRT_UTIL.

Codifica directamente el xstring (`cl_http_utility=>encode_x_base64`) para que el fichero llegue idéntico byte a byte, saltos de línea incluidos.

## Siguiente paso {improve half}

Marcar los registros como enviados solo cuando el receptor confirme, no cuando la llamada al proxy vaya bien. Y sacar la lógica de la BAdI a una clase propia, para que la BAdI solo llame y la lógica se pueda probar con tests unitarios.

# Code

EN: Three pieces: the BAdI that turns every absence change into one clean operation, the job that sends the pending ones as a file, and the generic service that hands any file to the SFTP through SAP Integration Suite.
ES: Tres piezas: la BAdI que convierte cada cambio de absentismo en una operación limpia, el job que envía los pendientes como fichero y el servicio genérico que entrega cualquier fichero al SFTP a través de SAP Integration Suite.

## BAdI · capture | BAdI · captura

`ZCL_IM_HR_ABSENCE_CAPTURE → IN_UPDATE / QUEUE`

```abap
METHOD if_ex_hrpad00infty~in_update.
  " Runs in the update task, inside the save: plain DB writes, no COMMIT  //1
  CHECK new_image-infty = '2001' OR old_image-infty = '2001'.

  DATA ls_old TYPE p2001.
  DATA ls_new TYPE p2001.
  cl_hr_pnnnn_type_cast=>prelp_to_pnnnn( EXPORTING prelp = old_image IMPORTING pnnnn = ls_old ).
  cl_hr_pnnnn_type_cast=>prelp_to_pnnnn( EXPORTING prelp = new_image IMPORTING pnnnn = ls_new ).

  " What did the user do, seen from the receiver?
  DATA(lv_op) = COND zhr_abs_op( WHEN ls_old IS INITIAL THEN 'INS'  //2
                                 WHEN ls_new IS INITIAL THEN 'DEL'  //2
                                 ELSE 'MOD' ).  //2

  " A new start date is a new key for the receiver
  IF lv_op = 'MOD' AND ls_new-begda <> ls_old-begda.  //3
    queue( is_abs = ls_old iv_op = 'DEL' ).  //3
    queue( is_abs = ls_new iv_op = 'INS' ).  //3
  ELSE.
    queue( is_abs = COND #( WHEN lv_op = 'DEL' THEN ls_old ELSE ls_new ) iv_op = lv_op ).
  ENDIF.
ENDMETHOD.

METHOD queue.
  DATA(ls_row) = VALUE zhr_abs_log(
    docnr = is_abs-docnr  pernr = is_abs-pernr  awart = is_abs-awart
    begda = is_abs-begda  endda = is_abs-endda
    hours = COND #( WHEN is_abs-alldf = abap_true THEN 0 ELSE is_abs-stdaz )
    operation = iv_op  status = 'N' ).

  " Still pending? Consolidate instead of queueing another step
  SELECT SINGLE * FROM zhr_abs_log
    WHERE docnr = @is_abs-docnr AND begda = @is_abs-begda AND status = 'N'  //4
    INTO @DATA(ls_pending).
  IF sy-subrc <> 0.
    ls_row-log_id = cl_system_uuid=>create_uuid_x16_static( ).
    INSERT zhr_abs_log FROM @ls_row.
    RETURN.
  ENDIF.

  IF ls_pending-operation = 'INS' AND iv_op = 'DEL'.  //5
    DELETE zhr_abs_log FROM @ls_pending.   " never sent: never existed for them  //5
    RETURN.  //5
  ENDIF.  //5
  " The receiver never saw the insert, so a later change is still an insert
  ls_row-operation = COND #( WHEN ls_pending-operation = 'INS' THEN 'INS' ELSE iv_op ).  //4
  ls_row-log_id    = ls_pending-log_id.  //4
  UPDATE zhr_abs_log FROM @ls_row.  //4
ENDMETHOD.
```

1. EN: IN_UPDATE runs in the update task, as part of the infotype save: plain database writes and no COMMIT.
   ES: IN_UPDATE se ejecuta en la tarea de actualización, dentro de la grabación del infotipo: escrituras directas en base de datos y ningún COMMIT.
2. EN: What the user did, translated into what the receiver understands.
   ES: Lo que hizo el usuario, traducido a lo que entiende el receptor.
3. EN: The receiver identifies an absence by its start date, so a moved start date is a delete plus an insert.
   ES: El receptor identifica un absentismo por su fecha de inicio, así que mover la fecha de inicio es un borrado más un alta.
4. EN: Consolidation: while a record is pending, every change updates the same row.
   ES: Consolidación: mientras un registro está pendiente, cada cambio actualiza la misma fila.
5. EN: An insert deleted before it leaves never travels at all.
   ES: Un alta que se borra antes de salir no llega a viajar.

## Job · send | Job · envío

`ZHR_ABSENCE_EXPORT → LCL_EXPORT->RUN`

```abap
METHOD run.
  " Normal run: everything pending. Resend: the rows of one file already sent
  IF p_resend = abap_true.  //1
    SELECT * FROM zhr_abs_log WHERE status = 'S' AND file_name = @p_file  //1
      INTO TABLE @DATA(lt_send).  //1
  ELSE.
    SELECT * FROM zhr_abs_log WHERE status = 'N' INTO TABLE @lt_send.
  ENDIF.
  CHECK lt_send IS NOT INITIAL.

  DATA(lv_nl)  = cl_abap_char_utilities=>cr_lf.
  DATA(lv_csv) = REDUCE string(
    INIT csv = |DOCNR;PERNR;TYPE;BEGDA;ENDDA;HOURS;OPERATION{ lv_nl }|
    FOR r IN lt_send
    NEXT csv = csv && |{ r-docnr };{ r-pernr };{ r-awart };{ r-begda };{ r-endda };{ r-hours };{ r-operation }{ lv_nl }| ).

  " One file per day, with a name the receiver can predict
  DATA(lv_file) = COND string( WHEN p_resend = abap_true THEN p_file  //2
                               ELSE |ABS_{ sy-datum }.csv| ).  //2
  save_copy_on_server( iv_name = lv_file iv_content = lv_csv ).    " OPEN DATASET

  " Encode the bytes, not the characters: the file arrives identical
  DATA(lv_base64) = cl_http_utility=>encode_x_base64( cl_abap_codepage=>convert_to( lv_csv ) ).  //3

  TRY.
      NEW zco_absence_file_out( logical_port_name = 'ZCPI_ABSENCES' )->send_absfile(
        output = VALUE #( line = VALUE #( file_name   = lv_file
                                          file_base64 = lv_base64 ) ) ).

      " Mark exactly the rows of this file, by their own key
      GET TIME STAMP FIELD DATA(lv_now).
      LOOP AT lt_send INTO DATA(ls_row).
        UPDATE zhr_abs_log SET status = 'S', file_name = @lv_file, sent_at = @lv_now  //4
          WHERE log_id = @ls_row-log_id.  //4
      ENDLOOP.
      COMMIT WORK.        " the outbound message and the marks, together  //5
      log( iv_type = 'S' iv_text = |{ lines( lt_send ) } records sent in { lv_file }| ).

    CATCH cx_ai_system_fault INTO DATA(lx_fault).
      ROLLBACK WORK.  //6
      log( iv_type = 'E' iv_text = lx_fault->get_text( ) ).  //6
  ENDTRY.
ENDMETHOD.
```

1. EN: Resend mode: any file already sent can be rebuilt from the log in minutes. One file per run, with a parameter and not a range, so rows from two files never end up in one.
   ES: Modo reenvío: cualquier fichero ya enviado se reconstruye desde el log en minutos. Un fichero por ejecución, con un parámetro y no un rango, para que nunca acaben filas de dos ficheros en uno.
2. EN: One file per day with a predictable name, agreed with the receiver.
   ES: Un fichero al día con un nombre predecible, pactado con el receptor.
3. EN: Base64 of the xstring, not of the string: line endings and special characters arrive exactly as they left. The WSDL declares this field as a plain string and the iFlow decodes it; with base64Binary, the proxy would take the xstring and encode it itself.
   ES: Base64 del xstring, no del string: los saltos de línea y los caracteres especiales llegan tal como salieron. El WSDL declara este campo como string y el iFlow lo decodifica; con base64Binary, el proxy recibiría el xstring y lo codificaría él.
4. EN: Rows are marked by their own key. Marking by document number overwrote which file each earlier change had travelled in.
   ES: Las filas se marcan por su propia clave. Marcarlas por número de documento machacaba en qué fichero había viajado cada cambio anterior.
5. EN: A one-way proxy call is only sent on COMMIT WORK, in the same unit of work as the “sent” marks: both happen, or neither does.
   ES: Una llamada a un proxy one-way solo sale con el COMMIT WORK, en la misma unidad de trabajo que las marcas de «enviado»: o pasan las dos cosas o ninguna.
6. EN: If the proxy fails, nothing is marked and the rows travel in the next run. The error goes to SLG1.
   ES: Si el proxy falla, no se marca nada y las filas viajan en la siguiente ejecución. El error queda en SLG1.

## SFTP service | Servicio SFTP

`ZCL_HR_SFTP_SENDER → SEND_FILE`

```abap
METHOD send_file.
  " Where does this file go? One row per process, file and environment
  SELECT SINGLE * FROM zhr_sftp_config
    WHERE process = @iv_process AND file_id = @iv_file_id AND sysid = @sy-sysid  //1
    INTO @DATA(ls_cfg).
  IF sy-subrc <> 0.
    add_message( iv_type = 'E' iv_text = |No SFTP configuration for { iv_process }/{ iv_file_id } in { sy-sysid }| ).
    RETURN.
  ENDIF.

  DATA(lv_path)  = |{ ls_cfg-source_dir }/{ iv_file_name }|.
  DATA(lv_xfile) = read_binary( lv_path ).                    " OPEN DATASET ... IN BINARY MODE

  TRY.
      NEW zco_sftp_file_out( logical_port_name = ls_cfg-logical_port )->send_file(
        output = VALUE #( file = VALUE #(
                   name    = iv_file_name
                   folder  = ls_cfg-target_dir  //2
                   content = cl_http_utility=>encode_x_base64( lv_xfile ) ) ) ).
      COMMIT WORK.

      " Only after a successful hand-over; the iFlow keeps its own backup copy
      DELETE DATASET lv_path.  //3
      add_message( iv_type = 'S' iv_text = |{ iv_file_name } sent to { ls_cfg-target_dir }| ).

    CATCH cx_ai_system_fault cx_ai_application_fault INTO DATA(lx_fault).
      " SLG1 for support, an email for the business
      add_message( iv_type = 'E' iv_text = lx_fault->get_text( ) ).  //4
      send_alert( iv_subject = |SFTP transfer failed: { iv_file_name }|  //4
                  iv_body    = lx_fault->get_text( ) ).  //4
  ENDTRY.
  save_log( ).                                                " BAL_DB_SAVE, visible in SLG1
ENDMETHOD.
```

1. EN: Where each file goes is configuration: a new site or environment is a table entry, not a transport.
   ES: A dónde va cada fichero es configuración: un centro o un entorno nuevo es una entrada en la tabla, no un transporte.
2. EN: The target folder travels with the file, so one iFlow serves every site.
   ES: La carpeta destino viaja con el fichero, así que un solo iFlow sirve para todos los centros.
3. EN: The original is deleted only after a successful hand-over.
   ES: El original solo se borra después de una entrega correcta.
4. EN: Errors go to SLG1 for support and by email to the business.
   ES: Los errores van a SLG1 para soporte y por correo a negocio.
