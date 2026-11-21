# Épica 10 · Reportes y analítica para administración

**H28: Ver la ocupación de las clases.** Dueño: Jaime.
**H29: Ver los ingresos de un periodo.** Dueño: Jaime.

El módulo no tiene tablas propias: cada reporte consulta los datos de otros
módulos. Todos los endpoints son solo para **Administrador** (403 para otro
rol, 401 sin sesión).

| Método | Ruta | Task |
|---|---|---|
| GET | `/api/v1/reports/occupancy?from=2026-09-01&to=2026-11-30` | BE-28.1 |
| GET | `/api/v1/reports/income?from=2026-09-01&to=2026-11-30` | BE-29.1 |

## Rango de fechas (compartido con H28)

`services/report-range.ts` tiene las reglas que usan todos los reportes, y
`dto/report-range-query.dto.ts` la query `?from=&to=` que comparten:

- `from` y `to` son fechas solo-día `AAAA-MM-DD` del calendario del gimnasio,
  las dos incluidas. Otro formato o un parámetro faltante responde 400 "Las
  fechas deben tener el formato AAAA-MM-DD.".
- Una fecha que no existe (`2026-02-30`) responde 400 "La fecha 2026-02-30 no
  existe.".
- Inicio posterior al fin: 400 "La fecha de inicio no puede ser posterior a la
  de fin.".
- **Hasta 12 meses:** `to` tiene que ser anterior a la misma fecha del año
  siguiente. Del 2026-01-01 al 2026-12-31 sí; del 2026-01-01 al 2027-01-01
  responde 400 "El rango no puede ser mayor a 12 meses.".

## Ocupación de las clases (`GET /reports/occupancy`)

Suma las **clases grupales** y sus **reservas** (tablas `gym_classes` y
`class_reservations`, H06 y H07), agrupadas por el nombre de la clase.

```json
{
  "from": "2026-09-01",
  "to": "2026-11-20",
  "totals": { "classCount": 7, "sessions": 9, "capacity": 44, "confirmedReservations": 20, "occupancyPercent": 45.5 },
  "classes": [
    { "name": "CrossFit Funcional", "sessions": 1, "capacity": 3, "confirmedReservations": 3, "occupancyPercent": 100, "level": "HIGH" },
    { "name": "Spinning Matutino", "sessions": 2, "capacity": 8, "confirmedReservations": 6, "occupancyPercent": 75, "level": "HIGH" },
    { "name": "Zumba Ritmos", "sessions": 1, "capacity": 3, "confirmedReservations": 2, "occupancyPercent": 66.7, "level": "HIGH" },
    { "name": "Boxeo Fitness", "sessions": 1, "capacity": 4, "confirmedReservations": 2, "occupancyPercent": 50, "level": null },
    { "name": "Yoga Flow", "sessions": 2, "capacity": 10, "confirmedReservations": 5, "occupancyPercent": 50, "level": "LOW" },
    { "name": "Pilates Core", "sessions": 1, "capacity": 6, "confirmedReservations": 1, "occupancyPercent": 16.7, "level": "LOW" },
    { "name": "HIIT Nocturno", "sessions": 1, "capacity": 10, "confirmedReservations": 1, "occupancyPercent": 10, "level": "LOW" }
  ]
}
```

- **Qué clases cuentan:** las no canceladas (`SCHEDULED`) cuya hora de fin ya
  pasó y cuya fecha de inicio, en la zona del gimnasio, está en el rango. Una
  clase que todavía no termina no cuenta, aunque sea de hoy.
- **Ocupación:** suma de reservas `CONFIRMED` entre la suma del cupo máximo de
  esas clases, por 100, con un decimal. Las reservas canceladas no cuentan.
- **Orden:** de mayor a menor ocupación. Con el mismo porcentaje (ya
  redondeado a un decimal), por nombre en orden alfabético.
- **Resaltado (`level`):** con 6 clases o más, las 3 primeras son `HIGH`, las
  3 últimas `LOW` y las de en medio `null`. Con menos de 6, la mitad superior
  es `HIGH` y el resto `LOW`; con un número impar la del medio va en la mitad
  superior (5 clases: 3 `HIGH` y 2 `LOW`). Ninguna clase tiene los dos.
- **Sin clases:** si ninguna clase cuenta en el rango, no se genera el reporte:
  404 "No hay clases en ese rango.".

## Ingresos de un periodo (`GET /reports/income`)

Suma los **comprobantes** emitidos en el rango (tablas `receipts` y `charges`
de Pagos, H15 y H16). Un comprobante existe solo cuando el pago se aprobó, y
el monto es el del cobro que pagó.

```json
{
  "from": "2026-09-01",
  "to": "2026-11-30",
  "totals": { "membership": 110, "dropIn": 10, "personalSession": 30, "total": 150, "receiptCount": 7 },
  "months": [
    { "month": "2026-09", "membership": 25, "dropIn": 5, "personalSession": 0, "total": 30, "receiptCount": 2 },
    { "month": "2026-10", "membership": 0, "dropIn": 0, "personalSession": 0, "total": 0, "receiptCount": 0 },
    { "month": "2026-11", "membership": 85, "dropIn": 5, "personalSession": 30, "total": 120, "receiptCount": 5 }
  ],
  "message": null
}
```

- **Conceptos:** `membership` (membresías Mensual y Trimestral), `dropIn`
  (clases sueltas) y `personalSession` (sesiones personales), según el tipo del
  cobro.
- **Por mes:** `months` trae todos los meses que toca el rango, en orden y con
  0 en los que no hubo pagos, para que la tabla o la gráfica no salten meses.
  La suma de los meses es igual a `totals.total`.
- **Fecha del filtro:** la fecha de **emisión** del comprobante en la zona del
  gimnasio (`America/El_Salvador`), no el vencimiento del cobro. Así el total
  coincide con los comprobantes del rango. `issued_at` se guarda en UTC: un
  comprobante del 31/03 a las 21:00 en El Salvador (1/04 en UTC) cuenta en
  marzo.
- **Sin pagos:** responde 200 con todo en 0 y `message` "No hay pagos en ese
  rango.". La pantalla muestra ese texto y el total en $0.00.
- Las sumas se hacen en centavos para no dejar decimales sueltos.

## Datos de prueba

El seed carga 10 clases ya terminadas con `entrenador2@gymhub.test`
(`PAST_CLASSES`): 7 nombres con reservas de los 3 miembros de prueba, una
clase cancelada y una reserva cancelada, que no cuentan. Todas terminaron en
los últimos 30 días: un rango que los cubra da el ejemplo de arriba, si no hay
otras clases terminadas.

El seed carga 6 comprobantes de los últimos 3 meses (`INCOME_RECEIPTS`), con
los tres conceptos, en efectivo y con tarjeta. Junto con los cobros pagados de
H04 y H15 del mes actual, el reporte de los últimos meses tiene datos en cada
concepto.

## Pruebas

```bash
npx vitest run src/reports
npx vitest run --config ./vitest.config.e2e.ts test/income-report.e2e-spec.ts test/occupancy-report.e2e-spec.ts
```

Las pruebas e2e crean sus propios datos en 2020, donde no hay otros, y los
borran al terminar.
