# Instalación local

## Requisitos

- Docker Desktop con docker-compose v2
- Node.js 24 o superior y npm
- Git

## Pasos

### Backend (`gymhub`)

1. Clonar el repositorio: `git clone https://github.com/DaniloII09/gymhub.git` y entrar a la carpeta.
2. Copiar el archivo de variables: `cp .env.example .env` y poner un `JWT_SECRET` propio:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
3. Levantar PostgreSQL: `docker compose up -d postgres` (esperar a que el contenedor esté `healthy`).
4. Instalar dependencias (también genera el cliente de Prisma): `npm install`
5. Aplicar las migraciones: `npx prisma migrate deploy` (o `npx prisma migrate dev` al desarrollar).
6. Cargar los datos semilla: `npm run db:seed`
7. Levantar la API: `npm run start:dev`
8. Abrir [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

Para correr la API también en Docker en lugar del paso 7: `docker compose up -d --build`. El contenedor aplica las migraciones al arrancar; el seed se corre desde el host con `npm run db:seed`.

### Frontend (`gymhub-frontend`)

1. Clonar `https://github.com/DaniloII09/gymhub-frontend.git` y entrar a la carpeta.
2. `cp .env.example .env.local` (por defecto apunta a `http://localhost:3000/api/v1`).
3. `npm install`
4. `npm run dev`
5. Abrir [http://localhost:3001](http://localhost:3001)

## Datos semilla

`prisma/seed.ts` usa `upsert`, así que se puede correr varias veces. Es el mismo script en local y en producción. Crea:

- Un administrador, una cuenta de recepción y dos entrenadores (contraseñas de `SEED_ADMIN_PASSWORD` y `SEED_STAFF_PASSWORD`; si están vacías, en local se usa la contraseña demo de las pruebas e2e).
- Tres miembros de prueba con distintos estados de membresía (activa, vencida y pendiente de pago), con la contraseña de `SEED_MEMBER_PASSWORD`.
- Los planes Mensual (30 días, $25.00), Trimestral (90 días, $65.00) y Clase suelta ($5.00), y el precio de la sesión personal (`SEED_PERSONAL_SESSION_PRICE`, $15.00).
- Ocho máquinas, clases futuras y pasadas con reservas (para el reporte de ocupación), membresías, ingresos al gimnasio, cobros pendientes y vencidos, pagos con comprobante (para el reporte de ingresos), avisos, rutinas, registros de progreso y reseñas de ejemplo.

## Variables de entorno

Backend (`.env`):

| Variable | Descripción | Ejemplo |
|---|---|---|
| `NODE_ENV` | Ambiente | `development` |
| `PORT` | Puerto de la API | `3000` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | Usados por docker-compose para crear la base local | `postgres` / `postgres` / `gymhub` / `5432` |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL | `postgresql://postgres:postgres@localhost:5432/gymhub?schema=public` |
| `JWT_SECRET` | Secreto para firmar los JWT | (aleatorio, 32 bytes en base64) |
| `JWT_EXPIRES_IN` | Duración del access token | `15m` |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | Duración del refresh token en días | `7` |
| `BCRYPT_SALT_ROUNDS` | Costo del hash de contraseñas | `12` |
| `FRONTEND_URL` | Orígenes permitidos por CORS, separados por coma | `http://localhost:3001` |
| `SEED_ADMIN_PASSWORD` | Contraseña del administrador que crea el seed | (vacía en local) |
| `SEED_STAFF_PASSWORD` | Contraseña de recepción y entrenadores que crea el seed | (vacía en local) |
| `SEED_MEMBER_PASSWORD` | Contraseña de los miembros de prueba que crea el seed | (vacía en local) |
| `SEED_PERSONAL_SESSION_PRICE` | Precio de la sesión personal que guarda el seed | `15` |
| `PERSONAL_SESSION_PRICE` | Opcional: precio de la sesión personal si no está en la base | `15` |

Frontend (`.env.local`):

| Variable | Descripción | Ejemplo |
|---|---|---|
| `API_URL` | URL base de la API con el prefijo `/api/v1` | `http://localhost:3000/api/v1` |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | Vigencia de la cookie del refresh token; igual que en el backend | `7` |

## Pruebas automatizadas

Backend:

```
npm test            # unitarias (Vitest): src/**/*.spec.ts
npm run test:e2e    # e2e contra la base local: test/*.e2e-spec.ts
npm run lint        # oxlint
```

Las pruebas unitarias están junto al código que prueban (`<nombre>.service.spec.ts`). Las e2e están en `test/`, una por historia o flujo (`class-reservations.e2e-spec.ts`, `payments.e2e-spec.ts`, ...) y necesitan PostgreSQL levantado.

Frontend:

```
npm test            # Vitest
npm run lint        # ESLint
```
