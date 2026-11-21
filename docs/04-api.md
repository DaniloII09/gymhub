# API

**Documentación interactiva (Swagger):** [https://PENDIENTE.onrender.com/api/docs]

Todas las rutas llevan el prefijo `/api/v1`. Las respuestas y los cuerpos son JSON (salvo el comprobante, que es PDF). Los listados usan paginación con `page` y `pageSize` (máximo 100) y responden `{ items, page, pageSize, total }`. Los montos llegan como texto con dos decimales (`"25.00"`).

## Autenticación

1. `POST /api/v1/auth/login` con `{ "email", "password" }` devuelve el usuario, un **access token** (JWT, dura 15 minutos) y un **refresh token** (dura 7 días).
2. El access token se envía en cada petición en el encabezado `Authorization: Bearer <token>`. En Swagger se usa el botón **Authorize**.
3. `POST /api/v1/auth/refresh` con `{ "refreshToken" }` entrega un par nuevo y revoca el anterior. Si se reutiliza un refresh token ya usado, se cierran todas las sesiones del usuario.
4. Sin token o con token vencido la API responde **401**; con un rol sin permiso responde **403**. El rol se relee de la base en cada petición y una cuenta desactivada ya no puede entrar.
5. Si la cuenta tiene contraseña temporal, solo puede usar `GET /auth/me` y `PATCH /auth/password` hasta cambiarla.

## Endpoints por módulo

"Autenticado" significa cualquier rol con sesión.

### Autenticación y cuentas (Módulo 0)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1 | Estado del servicio (health check) | Público |
| POST | /api/v1/auth/login | Iniciar sesión | Público |
| POST | /api/v1/auth/refresh | Renovar el access token | Público |
| POST | /api/v1/auth/logout | Cerrar sesión (revoca el refresh token) | Público |
| GET | /api/v1/auth/me | Usuario autenticado | Autenticado |
| PATCH | /api/v1/auth/password | Cambiar la contraseña (incluida la temporal) | Autenticado |
| GET | /api/v1/members | Listar y buscar miembros | Recepción, Administrador |
| POST | /api/v1/members | Inscribir un miembro (H01) | Recepción, Administrador |
| GET | /api/v1/staff | Listar el personal | Administrador |
| POST | /api/v1/staff | Crear una cuenta del personal (H02) | Administrador |
| PATCH | /api/v1/users/:userId/status | Activar o desactivar una cuenta (H02) | Administrador |

### Membresías y planes (Módulo 1)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/plans | Listar planes | Autenticado |
| POST | /api/v1/plans | Crear plan (H03) | Administrador |
| PATCH | /api/v1/plans/:planId | Editar plan (H03) | Administrador |
| PATCH | /api/v1/plans/:planId/deactivate | Desactivar plan (H03) | Administrador |
| POST | /api/v1/memberships | Vender o renovar una membresía (H04) | Recepción, Administrador |
| POST | /api/v1/memberships/drop-in | Vender una clase suelta (H04) | Recepción, Administrador |
| GET | /api/v1/memberships/me | Mi membresía (H05) | Miembro |

### Clases grupales (Módulo 2)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/classes | Listar clases por rango | Autenticado |
| POST | /api/v1/classes | Programar una clase (H06) | Administrador |
| PATCH / PUT | /api/v1/classes/:classId | Editar una clase (H06) | Administrador |
| PATCH | /api/v1/classes/:classId/cancel | Cancelar una clase con motivo (H09) | Administrador |
| POST | /api/v1/classes/:classId/reservations | Reservar un cupo (H07) | Miembro |
| GET | /api/v1/classes/reservations/me | Mis reservas | Miembro |
| PATCH | /api/v1/classes/reservations/:reservationId/cancel | Cancelar mi reserva (H08) | Miembro |

### Agenda de entrenadores (Módulo 3)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/availability-blocks | Mis bloques de disponibilidad (H10) | Entrenador |
| POST | /api/v1/availability-blocks | Agregar un bloque (H10) | Entrenador |
| DELETE | /api/v1/availability-blocks/:id | Eliminar un bloque (H10) | Entrenador |
| GET | /api/v1/trainers | Listar entrenadores | Autenticado |
| GET | /api/v1/trainers/:trainerId/slots | Horarios libres de un entrenador (H11) | Autenticado |
| GET | /api/v1/personal-sessions/pricing | Precio de la sesión personal | Autenticado |
| PUT | /api/v1/personal-sessions/pricing | Cambiar el precio | Administrador |
| POST | /api/v1/personal-sessions | Agendar una sesión (H11) | Miembro |
| GET | /api/v1/personal-sessions/me | Mis sesiones | Miembro |
| GET | /api/v1/personal-sessions/trainer/me | Mi agenda (H12) | Entrenador |
| PATCH | /api/v1/personal-sessions/trainer/me/:sessionId/result | Marcar Realizada o No asistió (H12) | Entrenador |

### Check-in (Módulo 4)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/check-ins/lookup | Buscar al miembro y ver el estado de su membresía (H13, H14) | Recepción, Administrador |
| POST | /api/v1/check-ins | Registrar el ingreso, con motivo si es excepción (H13, H14) | Recepción, Administrador |

### Pagos (Módulo 5)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/charges/member-search | Buscar miembros con cobros | Recepción, Administrador |
| GET | /api/v1/members/:memberId/charges | Cobros de un miembro | Recepción, Administrador |
| POST | /api/v1/payments | Registrar un pago en efectivo o tarjeta (H15) | Recepción, Administrador |
| GET | /api/v1/charges/me | Mis cobros (H16) | Miembro |
| POST | /api/v1/charges/:chargeId/card-payment | Pagar con tarjeta (H16) | Miembro |
| GET | /api/v1/receipts/me | Mis comprobantes | Miembro |
| GET | /api/v1/receipts/:receiptId/pdf | Descargar comprobante en PDF | Recepción, Administrador o el miembro dueño |
| GET | /api/v1/charges/pending | Pagos pendientes (H17) | Administrador |

### Rutinas y progreso (Módulo 6)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| POST | /api/v1/routines | Crear y asignar una rutina a un miembro (H18) | Entrenador |
| GET | /api/v1/routines/trainer/me | Rutinas creadas por mí (H18) | Entrenador |
| PATCH | /api/v1/routines/:routineId | Editar una rutina propia (H18) | Entrenador |
| DELETE | /api/v1/routines/:routineId | Eliminar una rutina propia y sus ejercicios (H18) | Entrenador |
| GET | /api/v1/routines/me | Mis rutinas asignadas (H18) | Miembro |
| GET | /api/v1/progress/me | Mi historial de progreso (H19) | Miembro |
| POST | /api/v1/progress | Registrar peso y medidas (H19) | Miembro |
| PATCH | /api/v1/progress/:entryId | Editar un registro propio (H19) | Miembro |

### Máquinas (Módulo 7)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/machines | Inventario de máquinas | Administrador |
| PATCH | /api/v1/machines/:machineId/status | Cambiar el estado con motivo (H20) | Administrador |
| GET | /api/v1/machines/:machineId/status-history | Historial de estados (H20) | Administrador |
| GET | /api/v1/machines/availability | Disponibilidad de máquinas (H21) | Autenticado |

### Reseñas (Módulo 8)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/reviews/pending | Clases y sesiones que puedo calificar (H22) | Miembro |
| POST | /api/v1/reviews | Calificar de 1 a 5 estrellas con comentario opcional (H22) | Miembro |
| GET | /api/v1/reviews/me | Mis reseñas enviadas (H22) | Miembro |

### Notificaciones (Módulo 9)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/notifications/me | Mis avisos (H25) | Miembro |
| GET | /api/v1/notifications/me/unread-count | Contador de no leídos (H25) | Miembro |
| PATCH | /api/v1/notifications/:id/read | Marcar un aviso como leído (H25) | Miembro |
| PATCH | /api/v1/notifications/me/read-all | Marcar todos como leídos (H25) | Miembro |
| POST | /api/v1/notifications/expiry-notices/run | Ejecutar a mano el envío de avisos de vencimiento (H26) | Administrador |

El envío de avisos (H24) no tiene endpoint: los demás módulos llaman al servicio `notify` dentro de su transacción.

### Reportes (Módulo 10)

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/reports/occupancy | Ocupación de clases en un rango de hasta 12 meses (H28) | Administrador |
| GET | /api/v1/reports/income | Ingresos de un periodo por concepto y por mes (H29) | Administrador |
| GET | /api/v1/reports/ratings | Promedios de calificación por entrenador y por clase (H23) | Administrador |
| GET | /api/v1/reports/renewal-rate | Tasa de renovación de membresías por rango y por mes (H30) | Administrador |
