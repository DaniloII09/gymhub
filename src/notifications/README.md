# Épica 9 · Notificaciones

**H24 (SCRUM-39): Enviar avisos desde cualquier módulo.**
**H25 (SCRUM-40): Ver todos mis avisos en un solo lugar.** Dueño: Juan Carlos.

## Endpoints de la bandeja (BE-25.1)

Todos son solo para **Miembro** y trabajan sobre los avisos del usuario del
token. Ninguno recibe el id de otro usuario.

| Método | Ruta                                    | Respuesta                                                                                                                                                 |
| ------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/notifications/me?page=1`       | 200 `{ data[], total, page, pageSize: 20 }`, del más reciente al más antiguo. Cada aviso trae `id`, `title`, `message`, `source`, `createdAt` e `isRead`. |
| GET    | `/api/v1/notifications/me/unread-count` | 200 `{ unread }`: COUNT de avisos con `read_at` vacío.                                                                                                    |
| PATCH  | `/api/v1/notifications/{id}/read`       | 204. Marcar uno que ya estaba leído no cambia nada.                                                                                                       |
| PATCH  | `/api/v1/notifications/me/read-all`     | 204. Deja `unread` en 0.                                                                                                                                  |

Errores: 401 sin sesión, 403 si no es Miembro, 400 si la página o el id no son
válidos, y 404 "No encontramos ese aviso." si el aviso no existe **o es de otro
usuario** (no se revela que existe).

Un solo servicio central de avisos para todo el sistema. Ningún módulo tiene su
propia lógica de envío ni escribe en la tabla `notifications`: todos llaman a
`notify` a través del contrato `NOTIFICATION_SERVICE`.

## Contrato para otros módulos: `NOTIFICATION_SERVICE`

```ts
// En tu módulo: imports: [NotificationsModule]
import {
  NOTIFICATION_SERVICE,
  type NotificationService,
} from '@Common/contracts';

constructor(
  @Inject(NOTIFICATION_SERVICE)
  private readonly notifications: NotificationService,
) {}

await this.prisma.$transaction(async (tx) => {
  await tx.gymClass.update({ ... }); // la operación de tu módulo
  const sent = await this.notifications.notify(
    {
      recipients: memberIds, // uuid[] de los destinatarios
      source: 'CLASSES',
      title: 'Clase cancelada',
      message: 'La clase Yoga Flow del 14/11/2026 a las 09:00 fue cancelada. Motivo: ...',
      referenceId: String(gymClass.id), // opcional
    },
    tx,
  );
});
```

`notify(input, tx)` devuelve cuántos avisos creó: uno por destinatario. Se
guarda con la **transacción de quien llama**, así que si esa operación falla y
se revierte, no queda ningún aviso.

| Campo         | Tipo                 | Obligatorio | Restricción                                                                 |
| ------------- | -------------------- | ----------- | --------------------------------------------------------------------------- |
| `recipients`  | `uuid[]`             | Sí          | 1 a 500 usuarios existentes y activos. Un id repetido recibe un solo aviso. |
| `title`       | `string`             | Sí          | 1 a 80 caracteres                                                           |
| `message`     | `string`             | Sí          | 1 a 300 caracteres                                                          |
| `source`      | `NotificationSource` | Sí          | Uno de la lista de módulos de origen                                        |
| `referenceId` | `string`             | No          | Máx. 40 caracteres, por ejemplo el id de la clase o de la membresía         |

Los textos se guardan sin los espacios del principio y del final.

## Aviso de clase cancelada para H09: `CLASS_CANCELLATION_NOTIFIER` (BE-27.1)

H09 (cancelar una clase) no arma el aviso: inyecta este contrato y lo llama
**dentro de su transacción y antes de cambiar las reservas**, porque se avisa a
las reservas que en ese momento siguen confirmadas.

```ts
// En ClassesModule: imports: [NotificationsModule]
import {
  CLASS_CANCELLATION_NOTIFIER,
  type ClassCancellationNotifier,
} from '@Common/contracts';

constructor(
  @Inject(CLASS_CANCELLATION_NOTIFIER)
  private readonly cancellationNotices: ClassCancellationNotifier,
) {}

await this.prisma.$transaction(async (tx) => {
  await this.cancellationNotices.notifyClassCancelled(
    { classId, reason }, // el motivo ya validado de 5 a 200 caracteres
    tx,
  );
  // ...pasar la clase a CANCELLED y sus reservas a "Cancelada por el gimnasio"
});
```

- Avisa solo a los miembros activos con reserva `CONFIRMED`. Quien canceló su
  reserva o no tenía reserva no recibe nada.
- Título "Clase cancelada" y mensaje "La clase {nombre} del {dd/mm/aaaa} a las
  {hh:mm} fue cancelada. Motivo: {motivo}.", con la fecha y hora de
  `America/El_Salvador`. Si nombre y motivo no caben en 300 caracteres, el
  motivo se recorta con "…".
- `referenceId` es `class:{id}` y el módulo de origen es `CLASSES`.
- Devuelve cuántos avisos creó; con 0 reservas confirmadas devuelve 0 sin error.
- Si la clase no existe lanza `ClassNotFoundForNoticeError`. Si la transacción
  de H09 se revierte, no queda ningún aviso.

### Módulos de origen (`NotificationSource`)

| Valor         | Módulo                                              |
| ------------- | --------------------------------------------------- |
| `MEMBERSHIPS` | 1 · Membresías y planes (H26: aviso de vencimiento) |
| `CLASSES`     | 2 · Clases grupales (H27: clase cancelada)          |
| `TRAINERS`    | 3 · Agenda de entrenadores                          |
| `CHECK_INS`   | 4 · Check-in y acceso                               |
| `PAYMENTS`    | 5 · Pagos y facturación                             |
| `ROUTINES`    | 6 · Rutinas y progreso                              |
| `MACHINES`    | 7 · Máquinas                                        |
| `REVIEWS`     | 8 · Reseñas                                         |
| `REPORTS`     | 10 · Reportes                                       |

### Errores

Si los datos no son válidos, `notify` lanza `NotificationValidationError`
(`@Notifications/errors`) y **no registra ningún aviso**:

- la lista de destinatarios está vacía, tiene más de 500 o algún id no es un UUID;
- falta el título o el mensaje, o se pasan de largo;
- el módulo de origen no está en la lista;
- la referencia pasa de 40 caracteres;
- algún destinatario no existe o está inactivo.

Es un error de dominio y no una respuesta HTTP: cada módulo decide si su
operación sigue o se revierte. Si lo dejas escapar dentro de tu `$transaction`,
se revierte todo.

## Tabla `notifications` (DB-24.1)

| Columna        | Tipo                      | Notas                                   |
| -------------- | ------------------------- | --------------------------------------- |
| `id`           | `serial`                  |                                         |
| `user_id`      | `uuid`                    | Destinatario, FK a `users`              |
| `title`        | `varchar(80)`             |                                         |
| `message`      | `varchar(300)`            |                                         |
| `source`       | enum `NotificationSource` | La base rechaza cualquier otro valor    |
| `reference_id` | `varchar(40)`             | Opcional                                |
| `read_at`      | `timestamp`               | Vacío significa no leído (lo marca H25) |
| `created_at`   | `timestamp`               |                                         |

Índice `(user_id, read_at)` para la bandeja y el contador de no leídos de H25.
Los avisos no se borran en esta versión.

Para revertir la migración:

```bash
npx prisma db execute --file prisma/migrations/20261113020542_add_notifications/down.sql
```

El seed carga 3 avisos de prueba para `miembro@gymhub.test`, uno de ellos leído.

## Pruebas

- Unitarias: `src/notifications/services/notifications.service.spec.ts`.
- Unitarias de la bandeja: `src/notifications/services/notification-inbox.service.spec.ts`.
- Unitarias del aviso de clase cancelada: `src/notifications/services/class-cancellation-notices.service.spec.ts`.
- Integración contra la base real: `test/notifications.e2e-spec.ts` (30
  destinatarios en una llamada, transacción revertida, validaciones y enum) y
  `test/notifications-inbox.e2e-spec.ts` (orden y paginación, privacidad,
  contador, marcar uno y todos, 401, 403 y 404).
  `test/class-cancellation-notices.e2e-spec.ts` cubre H27: 14 reservas
  confirmadas y 2 canceladas por el miembro generan 14 avisos, y si la
  transacción se revierte no queda ninguno.
