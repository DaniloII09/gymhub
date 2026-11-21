# GymHub

Plataforma web para digitalizar la operación de un gimnasio: venta y control de membresías, reserva de clases grupales con cupo, agenda de entrenadores personales, control de acceso, cobros con comprobante, rutinas y seguimiento del progreso, mantenimiento de máquinas, reseñas, avisos y reportes para la administración. La usan cuatro roles: Miembro, Entrenador, Recepción y Administrador.

**Proyecto asignado:** Proyecto 2: Plataforma de gestión de gimnasio / centro de entrenamiento

**Curso:** Ingeniería de Software, UCA, ciclo 02/2026, Sección 02

**Equipo:** Los Ñ 5.0

## Ambiente desplegado

| Componente | URL |
| --- | --- |
| Frontend | [https://PENDIENTE.vercel.app] |
| Documentación de la API (Swagger) | [https://PENDIENTE.onrender.com/api/docs] |

Los usuarios de prueba se entregan en Moodle, no en este repositorio.

> El backend está en el plan gratuito de Render: después de un rato sin uso se apaga y la primera petición puede tardar cerca de un minuto en responder.

## Integrantes

| Nombre | Carnet | Usuario de GitHub | Rol | Módulos o historias principales |
| --- | --- | --- | --- | --- |
| Danilo Isaac Iraheta Mejivar | 00377223 | [@DaniloII09](https://github.com/DaniloII09) | Líder técnico / Arquitecto | E0 Autenticación y roles, E1 Membresías, E4 Check-in (H01, H02, H03, H04, H13, H14) |
| Luis Rodrigo Guzmán Estrada | 00003921 | [@LGuzman14](https://github.com/LGuzman14) | Scrum Master | E2 Clases grupales, E3 Agenda de entrenadores (H06, H07, H08, H09, H11, H12); además E6 Rutinas, E8 Reseñas y H30, reasignadas (H18, H19, H22, H23, H30) |
| Jaime Arturo Magaña Nerio | 00077320 | [@JaimeArturoMaganaNerio](https://github.com/JaimeArturoMaganaNerio) | Product Owner | E5 Pagos, E10 Reportes (H15, H16, H17, H28, H29) |
| Juan Carlos Amaya Hernández | 00365123 | [@JCAmaya9003](https://github.com/JCAmaya9003) | DevOps / QA Lead | E7 Máquinas, E9 Notificaciones (H05, H20, H21, H24, H25, H26, H27) |
| Christian Alexis Merino Chavez | 00002521 | [@Alexis00002521](https://github.com/Alexis00002521) | Frontend Lead | E3 Agenda de entrenadores (H10, pendiente) |

## Repositorios

| Repositorio | Contenido |
| --- | --- |
| [gymhub](https://github.com/DaniloII09/gymhub) (este) | API REST en NestJS + Prisma + PostgreSQL. **Aquí está la documentación completa.** |
| [gymhub-frontend](https://github.com/DaniloII09/gymhub-frontend) | Aplicación web en Next.js. Su README enlaza a esta documentación. |

## Documentación

1. [Guía de uso](docs/01-guia-de-uso.md)
2. [Arquitectura](docs/02-arquitectura.md)
3. [Modelo de datos](docs/03-modelo-de-datos.md)
4. [API](docs/04-api.md)
5. [Instalación local](docs/05-instalacion-local.md)
6. [Despliegue](docs/06-despliegue.md)
7. [Forma de trabajo](docs/07-forma-de-trabajo.md)
8. [Historias por módulo](docs/08-historias.md)
9. [Problemas conocidos](docs/09-problemas-conocidos.md)
