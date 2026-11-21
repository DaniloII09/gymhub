# Problemas conocidos

| Problema | Cómo se reproduce | Impacto | Historia relacionada |
|---|---|---|---|
| Las tareas programadas no corren mientras el backend está dormido. El plan gratuito de Render apaga el servicio tras unos minutos sin tráfico, así que la tarea de las 00:05 que pasa membresías a Vencida y la de las 07:00 que envía los avisos de vencimiento pueden no ejecutarse. | Dejar el backend sin uso durante la noche y revisar al día siguiente que no llegaron los avisos de 5 días y 1 día. El administrador puede enviarlos a mano con `POST /api/v1/notifications/expiry-notices/run` desde Swagger. | Medio | H26 |
| La primera petición después de un rato sin uso tarda cerca de un minuto. | Abrir el frontend después de 15 minutos sin uso. | Bajo | Todas |
| La historia de horarios disponibles del entrenador quedó pendiente por falta de tiempo y no pasó las pruebas de QA. La agenda del entrenador incluye un avance parcial de esta funcionalidad que no se considera terminado. | Iniciar sesión como Entrenador y abrir **Agenda** (`/entrenador/agenda`) para definir bloques de disponibilidad. | Medio | H10 |
