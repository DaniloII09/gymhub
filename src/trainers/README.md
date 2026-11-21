# Módulo de Entrenadores y Sesiones Personales (`trainers`)

Implementa el backend de **H11 (`SCRUM-26`: Agendar una sesión con un entrenador)**:

- **`DB-11.1` (`SCRUM-93`)**: Modelo `PersonalSession` completo (`price`, `chargeId`), tabla singleton `PersonalSessionPricing` (`id = 1`) y migración reversible `20261118060000_complete_personal_sessions_and_pricing` con el índice único parcial `"personal_sessions_trainer_scheduled_start_key" ON "personal_sessions"("trainer_id", "starts_at") WHERE "status" = 'SCHEDULED'`.
- **`BE-11.1` (`SCRUM-94`)**: Listado de entrenadores activos y espacios libres de 60 minutos en los próximos 14 días generados desde los bloques recurrentes de H10 (`AvailabilityBlock`) en zona horaria `America/El_Salvador` (`UTC-06:00`).
- **`BE-11.2` (`SCRUM-95`)**: Agendamiento transaccional para `MEMBER` autenticado con bloqueo `SELECT ... FOR UPDATE`, creación atómica del cobro `PENDING` vía `CHARGES_SERVICE` y listado `"Mis sesiones"` (`GET /api/v1/personal-sessions/me`).

## Endpoints de H11

| Método y ruta | Roles | Descripción |
| :--- | :--- | :--- |
| `GET /api/v1/trainers` | Autenticado | Lista entrenadores activos (`role = TRAINER`, `isActive = true`). |
| `GET /api/v1/trainers/:trainerId/slots` | Autenticado | Espacios libres exactos de 60 min (rango máximo 14 días; 15 días responde `400`). Excluye fragmentos `< 60 min`, sesiones `SCHEDULED` y clases grupales `SCHEDULED`, respetando horarios contiguos. |
| `GET /api/v1/personal-sessions/pricing` | Autenticado | Consulta la tarifa configurada (`{ configured, price }`). |
| `PUT /api/v1/personal-sessions/pricing` | `ADMIN` | Configura o actualiza la tarifa de sesión personal (`PersonalSessionPricing`). |
| `POST /api/v1/personal-sessions` | `MEMBER` | Agenda un espacio con >= 12 h de anticipación (`< 12 h` responde `400`), cobra en `PENDING` vía `CHARGES_SERVICE` en la misma transacción y devuelve `409` (`Ese horario ya fue tomado.`) ante cruces o concurrencia. |
| `GET /api/v1/personal-sessions/me` | `MEMBER` | Lista únicamente las sesiones personales del miembro autenticado con el estado de su cobro asociado. |

> **Nota de alcance:** Esta versión **no** incluye cancelación de sesiones personales.

## Tarifa de sesión personal (decisión comercial pendiente)

El proyecto no define una tarifa comercial oficial por defecto. Por seguridad, el servicio falla de forma cerrada con **HTTP `503 Service Unavailable`** (`El precio de la sesión personal aún no está configurado.`) hasta que se defina por alguno de estos medios:

1. Administrador ejecutando `PUT /api/v1/personal-sessions/pricing`.
2. Variable opcional `PERSONAL_SESSION_PRICE` (o `SEED_PERSONAL_SESSION_PRICE` durante el seed idempotente).

## Integración con H10 y Pagos (`CHARGES_SERVICE`)

- **Pagos (`@Common/contracts` -> `src/payments/`)**: Se reutiliza `CHARGES_SERVICE.createPending(dto, tx)` dentro de la misma transacción `Prisma.$transaction` sin modificar archivos del módulo `payments`. El cobro generado queda visible en `"Mis pagos"` (`GET /api/v1/charges/me?status=PENDING`).
- **H10 (`AvailabilityBlock`)**:
  - Se reutiliza `AvailabilityBlockRepository` y `AvailabilityBlocksService` dentro de `TrainersModule`.
  - En `src/trainers/repositories/availability-block.repository.ts`, se actualizó únicamente `hasFutureScheduledSessions(blockId)` para consultar `this.prisma.personalSession` (`status: 'SCHEDULED'`, `endsAt: { gt: now }`), en lugar de la referencia provisional previa.
  - `AvailabilityBlocksController` (H10, Christian) no se monta en `TrainersModule` hasta que su autor resuelva el uso de `@CurrentUser('id')` e importe `AuthModule` / DTOs completos de H10.

## Zona horaria

Todos los bloques recurrentes semanales (`weekday`, `startTime`, `endTime`) y fechas límite (`dueDate` del cobro) se calculan en **`America/El_Salvador` (`UTC-06:00`)**, alineado con `src/payments/services/gym-calendar.ts`.

## Pruebas

- Unitarias: `src/trainers/services/trainer-calendar.spec.ts` y `src/trainers/services/personal-sessions.service.spec.ts`.
- Integración y concurrencia PostgreSQL real: `test/personal-sessions.e2e-spec.ts`.
# H12 / BE-12.1 — agenda y resultado del entrenador

- `GET /api/v1/personal-sessions/trainer/me` exige JWT con rol `TRAINER`. Devuelve `data` ordenada por inicio, con miembro, horario, estado y estado del cobro. Incluye las próximas dos semanas y las últimas 24 horas para poder registrar el resultado de una sesión recién iniciada.
- `PATCH /api/v1/personal-sessions/trainer/me/:sessionId/result` exige `{"outcome":"COMPLETED"}` o `{"outcome":"NO_SHOW"}`. El entrenador se obtiene del JWT; no se acepta otro `trainerId` en la petición.
- El resultado solo se puede registrar desde el inicio y hasta 24 horas después. Una sesión ajena o inexistente devuelve `404`; una sesión fuera del plazo o ya registrada devuelve `409`. La transición es atómica y guarda `resultRecordedAt`.
- Ambos resultados llevan `status = COMPLETED`; `outcome` distingue `COMPLETED` (Realizada) de `NO_SHOW` (No asistió). Así se conserva el contrato de estado de H11.
- La migración agrega `outcome` y `result_recorded_at` a `personal_sessions`. El frontend del miembro puede leer ambos campos adicionales sin perder compatibilidad.
