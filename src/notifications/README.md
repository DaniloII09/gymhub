# Épica 9 · Notificaciones

**H24 (SCRUM-39): Enviar avisos desde cualquier módulo.** Dueño: Juan Carlos.

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

| Campo | Tipo | Obligatorio | Restricción |
|---|---|---|---|
| `recipients` | `uuid[]` | Sí | 1 a 500 usuarios existentes y activos. Un id repetido recibe un solo aviso. |
| `title` | `string` | Sí | 1 a 80 caracteres |
| `message` | `string` | Sí | 1 a 300 caracteres |
| `source` | `NotificationSource` | Sí | Uno de la lista de módulos de origen |
| `referenceId` | `string` | No | Máx. 40 caracteres, por ejemplo el id de la clase o de la membresía |

Los textos se guardan sin los espacios del principio y del final.

### Módulos de origen (`NotificationSource`)

| Valor | Módulo |
|---|---|
| `MEMBERSHIPS` | 1 · Membresías y planes (H26: aviso de vencimiento) |
| `CLASSES` | 2 · Clases grupales (H27: clase cancelada) |
| `TRAINERS` | 3 · Agenda de entrenadores |
| `CHECK_INS` | 4 · Check-in y acceso |
| `PAYMENTS` | 5 · Pagos y facturación |
| `ROUTINES` | 6 · Rutinas y progreso |
| `MACHINES` | 7 · Máquinas |
| `REVIEWS` | 8 · Reseñas |
| `REPORTS` | 10 · Reportes |

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

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `serial` | |
| `user_id` | `uuid` | Destinatario, FK a `users` |
| `title` | `varchar(80)` | |
| `message` | `varchar(300)` | |
| `source` | enum `NotificationSource` | La base rechaza cualquier otro valor |
| `reference_id` | `varchar(40)` | Opcional |
| `read_at` | `timestamp` | Vacío significa no leído (lo marca H25) |
| `created_at` | `timestamp` | |

Índice `(user_id, read_at)` para la bandeja y el contador de no leídos de H25.
Los avisos no se borran en esta versión.

Para revertir la migración:

```bash
npx prisma db execute --file prisma/migrations/20261113020542_add_notifications/down.sql
```

El seed carga 3 avisos de prueba para `miembro@gymhub.test`, uno de ellos leído.

## Pruebas

- Unitarias: `src/notifications/services/notifications.service.spec.ts`.
- Integración contra la base real: `test/notifications.e2e-spec.ts` (30
  destinatarios en una llamada, transacción revertida, validaciones y enum).
