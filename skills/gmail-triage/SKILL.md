---
name: gmail-triage
description: Ejecuta un workflow de triage de inbox en Gmail: lista correos no leidos, agrupa por remitente o etiqueta, resume y pregunta que hacer con cada grupo (responder, archivar, marcar leido, dejar).
---

# Gmail Triage

Workflow reutilizable para revisar la bandeja de entrada y decidir que hacer con cada grupo de correos.

## Cuando usar

Cuando el usuario dice cosas como:
- "revisá mi inbox"
- "qué tengo sin leer"
- "triageá los correos de hoy"
- "limpiá la bandeja"

## Pasos

1. Llamar `gmail_list_recent` con `unreadOnly: true` y `maxResults: 25`.
2. Si hay menos de 25, llamar `gmail_search` con `query: "is:unread newer_than:7d"` para traer el resto de la semana.
3. Agrupar los stubs por `from` (dominio) y detectar hilos (mismo `threadId`).
4. Mostrar al usuario un resumen corto: cuantos correos no leidos, de cuantos remitentes distintos, y los 3-5 mas importantes (por snippet).
5. Preguntar al usuario que accion tomar por grupo:
   - Responder (llamar `gmail_get_message` para ver el contenido, despues `gmail_reply`)
   - Marcar como leido (llamar `gmail_modify` con `markRead: true`)
   - Archivar (llamar `gmail_modify` con `removeLabelIds: ["INBOX"]`)
   - Dejar para despues (no hacer nada)
6. Ejecutar las acciones confirmadas y reportar resumen final.

## Reglas

- NO responder correos sin que el usuario confirme el cuerpo del mensaje.
- NO archivar correos de remitentes que el usuario no haya marcado como "promociones" o "spam" antes.
- Si una accion falla con 429 (rate limit), esperar 5 segundos y reintentar una vez.
- Si una accion falla con 401, el token expiro: avisar al usuario que vuelva a autorizar.
