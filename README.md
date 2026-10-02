# Sistema de Control de Acceso y Gestión de Asistencia

API (Fase 1 – MVP) para control de acceso y asistencia por QR/móvil con operación multi-sede y soporte de marcaciones offline.
Cobertura objetivo: 23 sedes, ~900 colaboradores, personal intramural y extramural.

## Arquitectura y decisiones

- **Modular monolith** en **NestJS + TypeScript**, un módulo por dominio (`auth`, `health`, `sites`, `employees`, `shifts`, `attendance`, `reports`).
- **PostgreSQL + TypeORM**. El esquema se crea solo mediante **migraciones** (`synchronize: false`). Roles y estados son `varchar` con `CHECK` (equivalente a enum, más fácil de evolucionar). Todas las tablas tienen `created_at` / `updated_at`.
- **Auth JWT + RBAC**: un guard global exige JWT en todas las rutas salvo las marcadas `@Public()` (login, health) y aplica `@Roles(...)`. Roles: `ADMIN`, `LEADER`, `EMPLOYEE`. El login valida contra la tabla `users` (usuarios semilla, contraseñas con bcrypt).
- **Marcaciones**: un registro por colaborador y día local (`UNIQUE(employee_id, work_date)`), con `check_in_at` / `check_out_at` (`timestamptz`). Reglas: no doble entrada, no salida sin entrada, no doble salida, salida >= entrada, colaborador inactivo no marca, no se aceptan marcaciones en el futuro (>5 min). El día se calcula en la zona `APP_TIMEZONE` (por defecto `America/Bogota`).
- Un `EMPLOYEE` solo puede marcar por sí mismo; `ADMIN`/`LEADER` marcan indicando `employeeId`.
- **Sync offline**: `POST /attendance/sync-offline` recibe un lote con el `timestamp` original; se procesan ordenados cronológicamente, se persiste la hora original (nunca la hora de subida) y se devuelve el resultado por ítem (un error no aborta el lote).
- **Reporte diario**: por sede y fecha; `PRESENT`, `LATE` (entrada > inicio de turno + tolerancia) o `NO_MARK`.
- Redis se levanta en docker-compose para fases siguientes (jobs/colas); aún no lo usa la API.
- Fuera de alcance de esta fase: novedades, nómina/Defontana, dashboards, geolocalización extramural, cierre 19:00, generación de QR.

## Ejecución local

Requisitos: Node 20+, Docker.

```bash
npm install
cp .env.example .env
docker compose up -d postgres redis
npm run db:migrate
npm run db:seed
npm run dev            # http://localhost:3000/api/v1
```

Otros scripts: `npm run build`, `npm start`, `npm run lint`, `npm run format`, `npm run db:revert`.

### Usuarios semilla

| Rol | Email | Password |
|---|---|---|
| ADMIN | admin@example.com | Admin123! |
| LEADER | lider@example.com | Lider123! |
| EMPLOYEE | colaborador1@example.com | Colab123! |
| EMPLOYEE | colaborador2@example.com | Colab123! |

Además: "Sede Principal" y turno "Turno Mañana" (07:00–16:00, tolerancia 5 min). Solo para desarrollo.

## Endpoints (`/api/v1`)

| Método | Ruta | Roles |
|---|---|---|
| GET | `/health` | público |
| POST | `/auth/login` | público |
| POST / GET | `/sites` | ADMIN / ADMIN, LEADER |
| POST / GET | `/employees` (`?siteId=`) | ADMIN, LEADER |
| POST / GET | `/shifts/templates` | ADMIN / ADMIN, LEADER |
| POST / GET | `/shifts/assignments` | ADMIN, LEADER |
| POST | `/attendance/checkin`, `/attendance/checkout` | todos |
| POST | `/attendance/sync-offline` | todos |
| GET | `/reports/daily-attendance?siteId=&date=YYYY-MM-DD` | ADMIN, LEADER |

### Ejemplos

Todas las rutas (salvo login/health) requieren el header `Authorization: Bearer <accessToken>`.

```bash
# Login -> {"accessToken":"<jwt>","user":{...}}
curl -X POST localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"Admin123!"}'

H1="Authorization: Bearer <accessToken>"
H2="Content-Type: application/json"
API=localhost:3000/api/v1

# Sede, empleado, turno, asignación
curl -X POST $API/sites -H "$H1" -H "$H2" -d '{"name":"Sede Norte","address":"Calle 10"}'
curl -X POST $API/employees -H "$H1" -H "$H2" \
  -d '{"fullName":"Ana Pérez","documentNumber":"2001","siteId":"<siteId>","staffType":"INTRAMURAL"}'
curl -X POST $API/shifts/templates -H "$H1" -H "$H2" \
  -d '{"name":"Turno Tarde","startTime":"13:00","endTime":"19:00","lateToleranceMinutes":5}'
curl -X POST $API/shifts/assignments -H "$H1" -H "$H2" \
  -d '{"employeeId":"<employeeId>","shiftTemplateId":"<templateId>","startDate":"2026-10-01","endDate":"2026-10-31"}'

# Marcación (ADMIN/LEADER indican employeeId; un EMPLOYEE marca por sí mismo)
curl -X POST $API/attendance/checkin -H "$H1" -H "$H2" -d '{"employeeId":"<employeeId>"}'
curl -X POST $API/attendance/checkout -H "$H1" -H "$H2" -d '{"employeeId":"<employeeId>"}'

# Sincronización offline (hora original en ISO 8601)
curl -X POST $API/attendance/sync-offline -H "$H1" -H "$H2" \
  -d '{"marks":[{"employeeId":"<employeeId>","type":"CHECK_IN","timestamp":"2026-10-01T12:05:00Z"}]}'

# Reporte diario por sede
curl "$API/reports/daily-attendance?siteId=<siteId>&date=2026-10-01" -H "$H1"
```

## Variables de entorno

Ver `.env.example` (`PORT`, `APP_TIMEZONE`, `DB_*`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `REDIS_*`). **Cambiar `JWT_SECRET` fuera de local.**

## Roadmap

- **Fase 1 (esta entrega)**: usuarios/roles, sedes, turnos, asignaciones, marcación online/offline, reporte diario.
- **Fase 2**: novedades con adjuntos y aprobación, reglas avanzadas de tardanza.
- **Fase 3**: horas extras, exportes Excel/PDF, integración Defontana, dashboards.
