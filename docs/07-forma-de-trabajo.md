# Forma de trabajo

**Tablero:** https://rodrigoguzman1412.atlassian.net/jira/software/projects/SCRUM/summary

Trabajamos con Scrum. Cada épica del tablero corresponde a un módulo (E0 a E10), cada historia (H01 a H30) es una *Story* y cada task de base de datos, backend, frontend o QA es una *Subtask* con su responsable. Las cards de Jira tienen la clave `SCRUM-<n>`.

## Ramas (Git Flow)

- `main`: código en producción. Solo recibe cambios desde `release/*` y `hotfix/*`.
- `develop`: rama de integración. De aquí salen y aquí llegan las ramas de trabajo.
- `feature/<ID>-<descripcion>`: una rama por historia o task. El ID es el de la historia (`H07`), la task (`FE-7.1`) o la card de Jira (`SCRUM-22`).
- `fix/<ID>-<descripcion>` o `bugfix/<ID>-<descripcion>`: correcciones de defectos encontrados en las pruebas.
- `release/<version>` y `hotfix/<descripcion>`: publicación y correcciones de producción.

Reglas en GitHub (rulesets):

- `main` y `develop` están protegidas: no se hace push directo y todo cambio entra por PR con al menos una aprobación de otro integrante.
- `release/*` está protegida contra borrado, para que la rama de la versión no se pierda con el borrado automático y se pueda fusionar también a `develop`.
- El repositorio borra automáticamente la rama de un PR al fusionarlo.

## Commits

Formato `<tipo>(<ID>): <descripción>`, por ejemplo `feat(H17): tabla de pagos pendientes para el administrador (FE-17.1)`.
Tipos que usamos: `feat` o `add` (funcionalidad nueva), `fix`, `test`, `docs`, `refactor` y `chore`. En minúscula, sin punto final y un cambio lógico por commit.

## Pull requests

- El PR va de la rama de trabajo hacia `develop` (revisar que el repositorio base sea `DaniloII09/...` y no el de la cátedra, porque los repositorios son forks del boilerplate).
- El título lleva el ID de la historia y una descripción clara; la descripción enlaza la card de Jira.
- Antes de abrirlo se corre `npm run build`, `npm run lint` y `npm test`.
- Lo aprueba al menos otro integrante; los cambios al esquema de `User` o a la base compartida los revisa el líder técnico.
- Se fusiona después de la aprobación y la card pasa a **Hecho** con el enlace al PR.

## Migraciones de Prisma

Cada módulo edita su archivo en `prisma/schema/`. Antes de generar una migración se actualiza la rama con `develop`, y nunca se edita una migración que ya está en `develop`.
