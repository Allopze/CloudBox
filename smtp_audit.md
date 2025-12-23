# SMTP Audit - CloudBox

## Hallazgos

1) **Falso "OK" cuando SMTP no esta configurado**
- En `backend/src/lib/email.ts`, `sendEmail` solo registra "SMTP not configured" y retorna sin lanzar error.
- Las rutas de prueba devuelven 200 aunque no se haya enviado nada.

2) **El From configurado en UI no se usa**
- UI guarda `smtp_from_name` y `smtp_from_email` en DB.
- El mailer usa `smtp_from` (DB) o `SMTP_FROM` (ENV) y no construye el From desde esos campos.
- Resultado: el From real puede ser distinto al mostrado en el panel.

3) **El test SMTP del panel no envia al destinatario ingresado**
- `POST /admin/settings/smtp/test` usa `req.body.email` si existe, pero la UI no envia email.
- Termina enviando al email del admin (`req.user.email`) sin advertirlo.

4) **Validacion inconsistente de SMTP**
- El endpoint real del panel (`/admin/settings/smtp`) no valida con Zod.
- Existe un endpoint `/admin/smtp` con `smtpConfigSchema`, pero la UI no lo usa.

5) **Logging insuficiente para trazabilidad**
- No se registran `messageId`, `accepted/rejected`, respuesta SMTP, ni duracion.
- Dificulta correlacionar intentos con el proveedor (Brevo).

## Posibles fixes

1) **Eliminar falsos positivos**
- En `/admin/settings/smtp/test`:
  - llamar `testSmtpConnection()` y devolver error si falla, o
  - usar `sendMail` y devolver `accepted`, `rejected`, `response`, `messageId`.
- En `sendEmail`, si `smtpConfigured` es `false`, lanzar error en endpoints de test.

2) **Alinear From con lo configurado en UI**
- Guardar `smtp_from` al guardar `fromName/fromEmail`, o
- Construir `from` en `sendEmail` con `smtp_from_name` + `smtp_from_email`.

3) **Usar destinatario real en pruebas**
- UI debe enviar `email` en `/admin/settings/smtp/test` o
- Backend debe requerir `email` y validarlo.

4) **Validacion consistente**
- Aplicar un schema a `/admin/settings/smtp` similar a `smtpConfigSchema`.
- Normalizar tipos (port/secure) en backend.

5) **Instrumentacion minima**
- Log estructurado con:
  - `messageId`, `accepted`, `rejected`, `response`
  - `envelope.from`, `envelope.to`
  - `host`, `port`, `secure`, `durationMs`
- Registrar error con stacktrace y devolverlo al panel en modo admin.

