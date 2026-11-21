# Épica 6 · Rutinas, progreso y evolución (H18 y H19)

## Progreso y evolución (H19)

**H19 (SCRUM-34): Registrar progreso físico y consultar evolución.** Subtareas: DB-19.1 (`SCRUM-130`), BE-19.1 (`SCRUM-131`), BE-19.2 (`SCRUM-132`).

### Endpoints

Todos los endpoints requieren JWT con rol **Miembro** (`403` para otro rol, `401` sin sesión). La identidad sale siempre del token.

| Método | Ruta | Subtarea | Descripción |
|---|---|---|---|
| `POST` | `/api/v1/progress` | BE-19.1 | Registra fecha, peso y medidas (`201`; `409` si ya existe un registro en esa fecha). |
| `GET` | `/api/v1/progress/me` | BE-19.2 | Lista registros ordenados ascendentemente con `isBaseline: true` en el primero y diferencias último − primero. |
| `PATCH` | `/api/v1/progress/{entryId}` | BE-19.1 | Actualiza un registro propio (`404` si no existe o pertenece a otro miembro). |

### Reglas de negocio

- `date`: `AAAA-MM-DD`, fecha real del calendario y no futura respecto a `America/El_Salvador`.
- `weightKg`: `20..300` kg; `chestCm`, `waistCm`, `armCm`: `10..250` cm (hasta 2 decimales), validados también en PostgreSQL (`CHECK`).
- Unicidad por `(member_id, recorded_at)`: un segundo registro en la misma fecha responde `409` `"Ya tienes un registro en esa fecha."`.
- El primer registro cronológico marca `isBaseline: true`. Con `76.0` kg iniciales y `72.5` kg finales, `deltas.weightKg` devuelve `-3.5`; con un solo registro todas las diferencias son `0`.

## Rutinas (H18)

**H18 (SCRUM-33): Asignar una rutina de entrenamiento.** Subtareas: DB-18.1 (`SCRUM-125`), BE-18.1 (`SCRUM-126`).

### Endpoints

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/api/v1/routines` | `TRAINER` | Crea una rutina con días y ejercicios y la asigna a un miembro activo (`201`). |
| `PATCH` | `/api/v1/routines/{routineId}` | `TRAINER` | Edita una rutina propia del entrenador (`403` si pertenece a otro entrenador). |
| `DELETE` | `/api/v1/routines/{routineId}` | `TRAINER` | Elimina una rutina propia y en cascada sus ejercicios (`204`). |
| `GET` | `/api/v1/routines/trainer/me` | `TRAINER` | Lista las rutinas creadas por el entrenador autenticado. |
| `GET` | `/api/v1/routines/me` | `MEMBER` | Lista únicamente las rutinas asignadas al miembro autenticado. |

### Reglas de validación y atomicidad

- `name`: 3 a 60 caracteres (recortado).
- `daysOfWeek`: 1 a 7 enteros únicos entre `1` (Lunes) y `7` (Domingo).
- `exercises`: 1 a 15 ejercicios; cada ejercicio requiere `name` (1 a 80), `sets` (`1..10`), `reps` (`1..50`) y `suggestedWeightKg` (`0..300`, hasta 2 decimales).
- Toda creación y actualización corre en una transacción: una solicitud inválida nunca guarda una rutina parcial.
- Restricciones PostgreSQL (`DB-18.1`): `CHECK` sobre longitudes y rangos (incluyendo `sets BETWEEN 1 AND 10` que rechaza `0` series a nivel SQL) y `ON DELETE CASCADE` desde `routines` hacia `routine_exercises`.

Reversión de las migraciones:

```bash
npx prisma db execute --file prisma/migrations/20261120193001_add_progress_entries/down.sql
npx prisma db execute --file prisma/migrations/20261120192445_add_routines/down.sql
```
