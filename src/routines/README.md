# Épica 6 · Rutinas (H18)

**H18 (SCRUM-33): Asignar una rutina de entrenamiento.** Subtareas: DB-18.1 (`SCRUM-125`), BE-18.1 (`SCRUM-126`).

## Endpoints

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/api/v1/routines` | `TRAINER` | Crea una rutina con días y ejercicios y la asigna a un miembro activo (`201`). |
| `PATCH` | `/api/v1/routines/{routineId}` | `TRAINER` | Edita una rutina propia del entrenador (`403` si pertenece a otro entrenador). |
| `DELETE` | `/api/v1/routines/{routineId}` | `TRAINER` | Elimina una rutina propia y en cascada sus ejercicios (`204`). |
| `GET` | `/api/v1/routines/trainer/me` | `TRAINER` | Lista las rutinas creadas por el entrenador autenticado. |
| `GET` | `/api/v1/routines/me` | `MEMBER` | Lista únicamente las rutinas asignadas al miembro autenticado. |

## Reglas de validación y atomicidad

- `name`: 3 a 60 caracteres (recortado).
- `daysOfWeek`: 1 a 7 enteros únicos entre `1` (Lunes) y `7` (Domingo).
- `exercises`: 1 a 15 ejercicios; cada ejercicio requiere `name` (1 a 80), `sets` (`1..10`), `reps` (`1..50`) y `suggestedWeightKg` (`0..300`, hasta 2 decimales).
- Toda creación y actualización corre en una transacción: una solicitud inválida nunca guarda una rutina parcial.
- Restricciones PostgreSQL (`DB-18.1`): `CHECK` sobre longitudes y rangos (incluyendo `sets BETWEEN 1 AND 10` que rechaza `0` series a nivel SQL) y `ON DELETE CASCADE` desde `routines` hacia `routine_exercises`.

Reversión de la migración:

```bash
npx prisma db execute --file prisma/migrations/20261120192445_add_routines/down.sql
```
