# Épica 6 · Progreso y evolución (H19)

**H19 (SCRUM-34): Registrar progreso físico y consultar evolución.** Subtareas: DB-19.1 (`SCRUM-130`), BE-19.1 (`SCRUM-131`), BE-19.2 (`SCRUM-132`).

## Endpoints

Todos los endpoints requieren JWT con rol **Miembro** (`403` para otro rol, `401` sin sesión). La identidad sale siempre del token.

| Método | Ruta | Subtarea | Descripción |
|---|---|---|---|
| `POST` | `/api/v1/progress` | BE-19.1 | Registra fecha, peso y medidas (`201`; `409` si ya existe un registro en esa fecha). |
| `GET` | `/api/v1/progress/me` | BE-19.2 | Lista registros ordenados ascendentemente con `isBaseline: true` en el primero y diferencias último − primero. |
| `PATCH` | `/api/v1/progress/{entryId}` | BE-19.1 | Actualiza un registro propio (`404` si no existe o pertenece a otro miembro). |

## Reglas de negocio

- `date`: `AAAA-MM-DD`, fecha real del calendario y no futura respecto a `America/El_Salvador`.
- `weightKg`: `20..300` kg; `chestCm`, `waistCm`, `armCm`: `10..250` cm (hasta 2 decimales), validados también en PostgreSQL (`CHECK`).
- Unicidad por `(member_id, recorded_at)`: un segundo registro en la misma fecha responde `409` `"Ya tienes un registro en esa fecha."`.
- El primer registro cronológico marca `isBaseline: true`. Con `76.0` kg iniciales y `72.5` kg finales, `deltas.weightKg` devuelve `-3.5`; con un solo registro todas las diferencias son `0`.

Reversión de la migración:

```bash
npx prisma db execute --file prisma/migrations/20261120193001_add_progress_entries/down.sql
```
