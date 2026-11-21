# Guía de uso

Al iniciar sesión, el sistema lleva a cada usuario a la página de su rol y el menú muestra solo las opciones de ese rol. Si alguien abre una ruta de otro rol, ve "No tienes permiso para ver esta página.". Las cuentas nuevas reciben una contraseña temporal y deben cambiarla en el primer inicio de sesión.

## Roles

| Rol | Qué puede hacer |
| --- | --- |
| Administrador | Crea y desactiva cuentas del personal, define los planes, programa y cancela clases grupales, registra el mantenimiento de las máquinas, ve los pagos pendientes y los reportes de ocupación, ingresos, calificaciones y renovación. También puede hacer lo mismo que Recepción. |
| Recepción | Inscribe miembros, vende membresías y clases sueltas, registra pagos en efectivo o con tarjeta y registra el ingreso de los miembros con la alerta de membresía vencida. |
| Entrenador | Consulta su agenda de sesiones personales, marca si el miembro asistió y asigna rutinas a los miembros. |
| Miembro | Consulta su membresía, reserva y cancela cupos en clases, agenda sesiones personales, paga sus cobros con tarjeta, ve su rutina, registra su progreso, califica las clases y sesiones que tomó, consulta la disponibilidad de las máquinas y lee sus avisos. |

## Flujos principales

### Módulo 0: Autenticación y roles

#### Iniciar sesión y cambiar la contraseña temporal

1. Entrar a `/login` con correo y contraseña.
2. Si la cuenta tiene contraseña temporal, el sistema abre `/cambiar-contrasena` antes que cualquier otra pantalla.
3. Al guardar la nueva contraseña, el sistema lleva al usuario a la página de su rol.

<!-- TODO captura: ![Inicio de sesión](img/login.png) -->

#### Crear y desactivar cuentas del personal (Administrador)
1. Abrir **Cuentas del personal** (`/admin/cuentas-del-personal`).
2. Crear la cuenta con nombre, correo y rol (Entrenador, Recepción o Administrador). El sistema muestra la contraseña temporal.
3. Desde la misma lista se puede desactivar o reactivar una cuenta; una cuenta desactivada ya no puede iniciar sesión.

#### Inscribir un miembro (Recepción o Administrador)
1. Abrir **Inscribir miembro** (`/recepcion/miembros/nuevo`).
2. Escribir nombre completo, sexo, fecha de nacimiento y correo, y guardar.
3. El sistema muestra el código de miembro y la contraseña temporal para entregársela.

<!-- TODO captura: ![Inscripción de miembro](img/inscripcion-miembro.png) -->

### Módulo 1: Membresías y planes

#### Definir los planes (Administrador)
1. Abrir **Planes** (`/admin/planes`).
2. Crear o editar un plan con nombre, tipo, duración, precio y beneficios, o desactivarlo.

#### Vender una membresía o una clase suelta (Recepción)
1. Abrir **Nueva membresía** (`/recepcion/membresias/nueva`) y buscar al miembro.
2. Elegir el plan. La membresía queda Pendiente de pago hasta que se paga su cobro. La clase suelta se cobra al momento y se asigna a una clase de ese día con cupo.

#### Consultar mi membresía (Miembro)
1. Abrir **Mi membresía** (`/miembro/membresia`) para ver el plan, las fechas y el estado.

### Módulo 2: Clases grupales

#### Programar y cancelar clases (Administrador)
1. Abrir **Clases** (`/classes`) y ver el calendario semanal.
2. Crear o editar una clase con nombre, entrenador, fecha, horario y cupo.
3. Para cancelarla, escribir el motivo. Los miembros con reserva reciben un aviso.

#### Reservar y cancelar un cupo (Miembro)
1. Abrir **Clases** (`/miembro/clases`) y reservar una clase con cupo (requiere membresía Mensual o Trimestral activa, hasta 7 días antes).
2. En **Mis reservas** (`/miembro/reservas`) se puede cancelar hasta 2 horas antes de la clase.

### Módulo 3: Agenda de entrenadores

#### Ver la agenda y marcar el resultado (Entrenador)
1. Abrir **Agenda** (`/entrenador/agenda`) para ver las sesiones personales agendadas.
2. Después de la hora de inicio, marcar cada sesión como Realizada o No asistió.

#### Agendar una sesión personal (Miembro)
1. Abrir **Agendar sesión** (`/miembro/sesiones/agendar`), elegir entrenador y horario libre.
2. La sesión queda Agendada con un cobro pendiente de $15.00. **Mis sesiones** está en `/miembro/sesiones`.

### Módulo 4: Check-in

#### Registrar el ingreso de un miembro (Recepción)
1. Abrir **Check-in** (`/recepcion/check-in`) y buscar al miembro por código o nombre.
2. Si la membresía no está vigente, el sistema muestra la alerta. Para dejarlo pasar de todos modos hay que escribir el motivo, que queda guardado.

### Módulo 5: Pagos

#### Registrar un pago en recepción
1. Abrir **Cobros** (`/recepcion/cobros`), buscar al miembro y elegir el cobro pendiente.
2. Pagar en efectivo o con tarjeta. Al aprobarse se genera el comprobante en PDF.

#### Pagar con tarjeta (Miembro)
1. Abrir **Pagos** (`/miembro/pagos`), elegir el cobro y escribir los datos de la tarjeta.
2. Tarjetas de prueba de la pasarela simulada: `4242 4242 4242 4242` aprueba; `4000 0000 0000 0002` rechaza por fondos insuficientes.

#### Ver los pagos pendientes (Administrador)
1. Abrir **Pagos pendientes** (`/admin/pagos-pendientes`) y filtrar por concepto o fecha.

### Módulo 6: Rutinas y progreso

#### Asignar una rutina (Entrenador)
1. Abrir **Rutinas** (`/entrenador/rutinas`), elegir al miembro y los días de la semana.
2. Agregar los ejercicios con series, repeticiones y peso sugerido, y guardar. La rutina se puede editar o eliminar después.

#### Ver mi rutina y registrar mi progreso (Miembro)
1. Abrir **Mi rutina** (`/miembro/rutina`) para ver los ejercicios asignados.
2. En **Progreso** (`/miembro/progreso`), registrar peso y medidas de pecho, cintura y brazo de una fecha, y ver la evolución. Solo el propio miembro ve su progreso.

### Módulo 7: Máquinas

1. El Administrador cambia el estado de una máquina con su motivo en **Máquinas** (`/admin/maquinas`) y ve su historial.
2. El Miembro consulta qué máquinas están operativas en **Máquinas** (`/miembro/maquinas`).

### Módulo 8: Reseñas

#### Calificar una clase o sesión (Miembro)
1. Abrir **Por calificar** (`/miembro/por-calificar`), donde aparecen las clases y sesiones que tomó.
2. Elegir de 1 a 5 estrellas y escribir un comentario opcional. Cada clase o sesión se califica una sola vez.

### Módulo 9: Notificaciones

1. El Miembro ve sus avisos en la campana del menú y en **Avisos** (`/miembro/avisos`), donde puede marcarlos como leídos.
2. Reciben avisos los miembros cuya membresía vence en 5 días o en 1 día, y los que tenían reserva en una clase cancelada.

### Módulo 10: Reportes (Administrador)

1. **Ocupación** (`/admin/reportes/ocupacion`): ocupación de las clases en un rango de fechas.
2. **Ingresos** (`/admin/reportes/ingresos`): ingresos de un periodo por concepto y por mes.
3. **Calificaciones** (`/admin/reportes/calificaciones`): promedio de calificación por entrenador y por clase.
4. **Renovaciones** (`/admin/reportes/renovaciones`): tasa de renovación de membresías por rango y por mes.

### Historias no incluidas en esta versión

H10 (definir los horarios disponibles del entrenador) quedó pendiente. Ver [Historias por módulo](08-historias.md) y [Problemas conocidos](09-problemas-conocidos.md).
