import { createInitialState, downloadCsv, loadState, markAttendance, saveState } from "./domain.js";

const state = loadState();
const content = document.querySelector("#app-content");
const title = document.querySelector("#page-title");
const nav = document.querySelector("#navigation");
const roleSelect = document.querySelector("#role-select");
let page = "dashboard";
let siteFilter = "Todas las sedes";
let scannerStream;
let scanFrame;
let toastTimeout;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const employeeFor = (id) => state.employees.find((employee) => employee.id === id);
const activeEmployees = () => state.employees.filter((employee) => employee.status === "Activo");
const todayMarks = () => state.marks.filter((mark) => mark.date === today());
const fmtTime = (timestamp) => new Date(timestamp).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
const fmtDate = (timestamp) => new Date(timestamp).toLocaleDateString("es-CO");
const selectedEmployee = () => document.querySelector("#attendance-employee")?.value || activeEmployees()[0]?.id;
const accessRole = () => roleSelect.value;

const navItems = [
  ["dashboard", "Resumen", "⌂", ["Administrador", "Jefatura", "Colaborador"]],
  ["attendance", "Marcar asistencia", "◷", ["Administrador", "Jefatura", "Colaborador"]],
  ["employees", "Colaboradores", "♙", ["Administrador", "Jefatura"]],
  ["schedules", "Turnos", "▦", ["Administrador", "Jefatura", "Colaborador"]],
  ["novelties", "Novedades", "◇", ["Administrador", "Jefatura", "Colaborador"]],
  ["reports", "Reportes", "▤", ["Administrador", "Jefatura"]],
  ["help", "Manual de uso", "?", ["Administrador", "Jefatura", "Colaborador"]]
];

function showToast(message, error = false) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("visible"), 3500);
}

function persist() {
  const saved = saveState(state);
  if (!saved) showToast("No se pudo guardar. Libera espacio en el dispositivo.", true);
}

function employeeSelect(id = "", allowInactive = false) {
  const employees = allowInactive ? state.employees : activeEmployees();
  return employees.map((employee) => `<option value="${escapeHtml(employee.id)}" ${employee.id === id ? "selected" : ""}>${escapeHtml(employee.name)} · ${escapeHtml(employee.id)}</option>`).join("");
}

function siteSelect(selected = "") {
  return state.sites.map((site) => `<option value="${escapeHtml(site)}" ${site === selected ? "selected" : ""}>${escapeHtml(site)}</option>`).join("");
}

function render() {
  document.querySelector("#today-label").textContent = new Date().toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  }).toUpperCase();
  const visible = navItems.filter(([, , , roles]) => roles.includes(accessRole()));
  if (!visible.some(([key]) => key === page)) page = "dashboard";
  nav.innerHTML = visible.map(([key, label, icon]) => `<button class="nav-link ${page === key ? "active" : ""}" data-page="${key}">
    <span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`).join("");
  const titles = {
    dashboard: "Resumen de asistencia", attendance: "Marcar asistencia", employees: "Colaboradores",
    schedules: "Turnos y jornadas", novelties: "Novedades y permisos", reports: "Reportes",
    help: "Centro de ayuda"
  };
  title.textContent = titles[page];
  const screens = {
    dashboard: renderDashboard, attendance: renderAttendance, employees: renderEmployees,
    schedules: renderSchedules, novelties: renderNovelties, reports: renderReports, help: renderHelp
  };
  content.innerHTML = screens[page]();
  bindPageEvents();
}

function renderDashboard() {
  const marks = todayMarks();
  const entries = marks.filter((mark) => mark.action === "Entrada");
  const lateMarks = entries.filter((mark) => mark.late);
  const staff = accessRole() === "Colaborador"
    ? activeEmployees().filter((employee) => employee.id === activeEmployees()[0]?.id)
    : activeEmployees();
  const checkins = marks.filter((mark) => mark.action === "Entrada");
  const displayedStaff = siteFilter === "Todas las sedes" ? staff : staff.filter((person) => person.site === siteFilter);
  const ranking = lateMarks.map((mark) => {
    const person = employeeFor(mark.employeeId);
    const actual = new Date(mark.timestamp);
    const planned = person ? Number(person.start.slice(0, 2)) * 60 + Number(person.start.slice(3, 5)) : 0;
    return { person, minutes: Math.max(0, actual.getHours() * 60 + actual.getMinutes() - planned) };
  }).filter((row) => row.person).sort((a, b) => b.minutes - a.minutes).slice(0, 5);
  const siteCards = state.sites.map((site) => {
    const siteIds = new Set(activeEmployees().filter((person) => person.site === site).map((person) => person.id));
    const siteEntries = checkins.filter((mark) => siteIds.has(mark.employeeId)).length;
    return `<div class="site-row"><span class="site-symbol">⌖</span><span><strong>${escapeHtml(site)}</strong><small>${siteEntries} entradas hoy</small></span><span class="site-state">${siteEntries ? "Activo" : "Sin marcaciones"}</span></div>`;
  }).join("");
  const lateRows = ranking.length ? ranking.map(({ person, minutes }, index) => `<div class="ranking-row">
    <span class="rank-number">${String(index + 1).padStart(2, "0")}</span><span class="avatar">${escapeHtml(person.name.split(" ").map((part) => part[0]).slice(0, 2).join(""))}</span>
    <span class="rank-name"><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.site)}</small></span><strong class="late-time">+${minutes} min</strong></div>`).join("")
    : `<div class="empty-state compact"><span>☀</span><strong>Aún no hay llegadas tarde</strong><small>Las entradas tardías de hoy aparecerán aquí.</small></div>`;
  return `<section class="welcome-row"><div><span class="eyebrow">CONTROL EN TIEMPO REAL</span><h2>Hola, ${accessRole() === "Colaborador" ? "equipo" : "bienvenido"} <span>✳</span></h2>
    <p>Estado de asistencia y operación para tus sedes.</p></div><button class="button primary" data-go="attendance">＋ Registrar marcación</button></section>
    <section class="metric-grid">
      <article class="metric-card"><span>PERSONAL ACTIVO</span><strong>${displayedStaff.length}</strong><small>En ${siteFilter === "Todas las sedes" ? "todas las sedes" : escapeHtml(siteFilter)}</small><i class="metric-icon green">♙</i></article>
      <article class="metric-card"><span>ENTRADAS DE HOY</span><strong>${checkins.length}</strong><small>Marcaciones registradas</small><i class="metric-icon blue">↘</i></article>
      <article class="metric-card"><span>LLEGADAS TARDE</span><strong>${lateMarks.length}</strong><small>De ${entries.length} entradas registradas</small><i class="metric-icon orange">◷</i></article>
      <article class="metric-card"><span>NOVEDADES PENDIENTES</span><strong>${state.novelties.filter((item) => item.status === "Pendiente").length}</strong><small>Requieren revisión</small><i class="metric-icon purple">◇</i></article>
    </section>
    <section class="dashboard-grid"><article class="panel site-panel"><div class="panel-heading"><div><span class="eyebrow">COBERTURA</span><h3>Estado por sede</h3></div>
      <select id="site-filter" aria-label="Filtrar sede"><option>Todas las sedes</option>${siteSelect(siteFilter === "Todas las sedes" ? "" : siteFilter)}</select></div>
      <div class="site-list">${siteCards}</div><p class="footnote">Vista de muestra: ${state.sites.length} sedes configuradas.</p></article>
      <article class="panel ranking-panel"><div class="panel-heading"><div><span class="eyebrow">SEGUIMIENTO DIARIO</span><h3>Ranking de tardanzas</h3></div><span class="badge neutral">HOY</span></div>
      <div class="ranking-list">${lateRows}</div></article></section>`;
}

function renderAttendance() {
  const id = activeEmployees()[0]?.id || "";
  const person = employeeFor(id);
  const latest = todayMarks().filter((mark) => mark.employeeId === id).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  const nextAction = latest?.action === "Entrada" ? "Salida" : "Entrada";
  const records = todayMarks().slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 10);
  return `<section class="attendance-layout"><article class="panel checkin-card"><span class="eyebrow">MARCADOR DIGITAL</span><h2>Tu asistencia, <span>al día.</span></h2>
    <p>Identifícate para registrar una entrada o salida con la hora exacta del dispositivo.</p>
    <label class="field-label" for="attendance-employee">Colaborador</label><select class="field" id="attendance-employee">${employeeSelect(id)}</select>
    <div class="schedule-note"><span>▦</span><span>Turno asignado<strong id="selected-shift">${person ? `${person.start} · ${person.type}` : "Sin personal activo"}</strong></span></div>
    <div id="mark-feedback" class="feedback hidden"></div>
    <div class="button-row"><button class="button primary" id="mark-button" ${person ? "" : "disabled"}>${nextAction === "Entrada" ? "↘ Registrar entrada" : "↗ Registrar salida"}</button><button class="button secondary" id="scan-button">▦ Escanear QR</button></div>
    <video id="qr-video" class="qr-video hidden" muted playsinline></video><p id="scan-status" class="scan-status" role="status"></p>
    <p class="privacy-note">Sin conexión: las marcaciones se guardan localmente como pendientes, conservando su hora.</p></article>
    <article class="panel recent-panel"><div class="panel-heading"><div><span class="eyebrow">ACTIVIDAD</span><h3>Marcaciones de hoy</h3></div><span class="badge neutral">${records.length} recientes</span></div>
    ${records.length ? `<div class="table-wrap"><table><thead><tr><th>Colaborador</th><th>Acción</th><th>Hora</th><th>Estado</th></tr></thead><tbody>${records.map((mark) => {
      const user = employeeFor(mark.employeeId);
      return `<tr><td>${escapeHtml(user?.name || "Colaborador")}</td><td><span class="badge ${mark.late ? "warning" : "success"}">${mark.action}${mark.late ? " · tarde" : ""}</span></td><td>${fmtTime(mark.timestamp)}</td><td>${escapeHtml(mark.status)}</td></tr>`;
    }).join("")}</tbody></table></div>` : `<div class="empty-state"><span>◷</span><strong>Aún no hay marcaciones</strong><small>Las marcaciones de hoy aparecerán aquí.</small></div>`}</article></section>`;
}

function renderEmployees() {
  const people = accessRole() === "Jefatura"
    ? state.employees.filter((person) => person.site === state.sites[0])
    : state.employees;
  return `<section class="page-intro"><div><span class="eyebrow">DIRECTORIO DE PERSONAL</span><h2>Personas y estados</h2><p>Administra sedes, jornadas y acceso a la marcación.</p></div>
    <button class="button secondary" id="reset-demo">↺ Restaurar datos de muestra</button></section>
    <section class="panel form-panel"><form id="employee-form"><div class="form-title"><span class="eyebrow">NUEVO REGISTRO</span><strong>Agregar colaborador</strong></div>
    <label>Nombre completo<input name="name" required maxlength="80" placeholder="Nombre y apellido"></label>
    <label>Sede<select name="site" required>${siteSelect(state.sites[0])}</select></label>
    <label>Tipo de personal<select name="type"><option>Intramural</option><option>Extramural</option></select></label>
    <label>Inicio de turno<input name="start" type="time" value="07:00" required></label>
    <button class="button primary" type="submit">＋ Agregar</button></form></section>
    <section class="panel directory-panel"><div class="panel-heading"><div><span class="eyebrow">GESTIÓN DE USUARIOS</span><h3>Colaboradores (${people.length})</h3></div><span class="badge neutral">Altas y bajas manuales</span></div>
    <div class="table-wrap"><table><thead><tr><th>Colaborador</th><th>Sede</th><th>Tipo / turno</th><th>Estado</th><th></th></tr></thead><tbody>${people.map((person) => `<tr><td><strong>${escapeHtml(person.name)}</strong><small class="cell-sub">${escapeHtml(person.id)}</small></td><td>${escapeHtml(person.site)}</td><td>${escapeHtml(person.type)}<small class="cell-sub">${escapeHtml(person.start)}</small></td><td><span class="badge ${person.status === "Activo" ? "success" : "neutral"}">${escapeHtml(person.status)}</span></td><td><button class="text-button" data-toggle-employee="${escapeHtml(person.id)}">${person.status === "Activo" ? "Desactivar" : "Activar"}</button></td></tr>`).join("")}</tbody></table></div></section>`;
}

function renderSchedules() {
  const people = accessRole() === "Colaborador"
    ? activeEmployees().filter((person) => person.id === activeEmployees()[0]?.id)
    : state.employees;
  return `<section class="page-intro"><div><span class="eyebrow">PLANIFICACIÓN</span><h2>Jornadas y turnos</h2><p>Configura jornadas intramurales y horarios partidos extramurales.</p></div><span class="badge neutral">42 h semanales · referencia</span></section>
    <section class="panel"><div class="table-wrap"><table><thead><tr><th>Colaborador</th><th>Sede</th><th>Modalidad</th><th>Inicio</th><th>Jornada</th></tr></thead><tbody>${people.map((person) => `<tr><td><strong>${escapeHtml(person.name)}</strong><small class="cell-sub">${escapeHtml(person.id)}</small></td><td>${escapeHtml(person.site)}</td><td>${escapeHtml(person.type)}</td><td>${accessRole() === "Colaborador" ? escapeHtml(person.start) : `<form class="schedule-form" data-schedule="${escapeHtml(person.id)}"><input aria-label="Hora de inicio de ${escapeHtml(person.name)}" name="start" type="time" value="${escapeHtml(person.start)}"><button class="text-button" type="submit">Guardar</button></form>`}</td><td>${person.type === "Extramural" ? "AM / PM · pausa almuerzo" : "Lunes a sábado · 42 h"}</td></tr>`).join("")}</tbody></table></div><p class="footnote">El cierre de sede de referencia es a las 19:00. Las excepciones de horas extra requieren autorización administrativa.</p></section>`;
}

function renderNovelties() {
  const ownId = activeEmployees()[0]?.id;
  const items = state.novelties.filter((item) => accessRole() !== "Colaborador" || item.employeeId === ownId);
  return `<section class="page-intro"><div><span class="eyebrow">SOLICITUDES Y AUSENCIAS</span><h2>Gestiona novedades</h2><p>Registra permisos y adjunta un soporte PDF si lo necesitas.</p></div></section>
    <section class="panel form-panel"><form id="novelty-form"><div class="form-title"><span class="eyebrow">NUEVA SOLICITUD</span><strong>Registrar una novedad</strong></div>
      ${accessRole() !== "Colaborador" ? `<label>Colaborador<select name="employeeId">${employeeSelect(ownId)}</select></label>` : `<input type="hidden" name="employeeId" value="${escapeHtml(ownId)}">`}
      <label>Tipo<select name="type"><option>Cita médica</option><option>Día de votación</option><option>Día de la familia</option><option>Calamidad doméstica</option><option>Licencia</option><option>Otro permiso</option></select></label>
      <label>Fecha<input name="date" type="date" value="${today()}" required></label><label>Soporte PDF<input name="attachment" type="file" accept="application/pdf,.pdf"></label>
      <button class="button primary" type="submit">Enviar solicitud</button></form></section>
    <section class="panel directory-panel"><div class="panel-heading"><div><span class="eyebrow">SEGUIMIENTO</span><h3>Solicitudes (${items.length})</h3></div></div>
    ${items.length ? `<div class="table-wrap"><table><thead><tr><th>Persona</th><th>Novedad</th><th>Fecha</th><th>Soporte</th><th>Estado</th><th></th></tr></thead><tbody>${items.map((item) => `<tr><td>${escapeHtml(employeeFor(item.employeeId)?.name || "Colaborador")}</td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.date)}</td><td>${item.attachment ? "PDF adjunto (local)" : "—"}</td><td><span class="badge ${item.status === "Aprobada" ? "success" : item.status === "Pendiente" ? "warning" : "neutral"}">${escapeHtml(item.status)}</span></td><td>${accessRole() !== "Colaborador" && item.status === "Pendiente" ? `<button class="text-button" data-approve="${escapeHtml(item.id)}">Aprobar</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty-state"><span>◇</span><strong>Sin solicitudes todavía</strong><small>Las novedades registradas aparecerán aquí.</small></div>`}</section>`;
}

function renderReports() {
  const marks = state.marks.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const entries = marks.filter((mark) => mark.action === "Entrada");
  return `<section class="page-intro"><div><span class="eyebrow">DATOS PARA GESTIÓN</span><h2>Asistencia y liquidación</h2><p>Consulta marcaciones registradas y descarga datos en formato CSV compatible con hojas de cálculo.</p></div>
    <div class="button-row"><button class="button secondary" id="export-csv">↓ Exportar CSV</button><button class="button primary" id="print-report">▤ Guardar como PDF</button></div></section>
    <div class="metric-grid report-metrics"><article class="metric-card"><span>MARCACIONES TOTALES</span><strong>${marks.length}</strong><small>Todos los días guardados</small></article><article class="metric-card"><span>ENTRADAS TARDÍAS</span><strong>${entries.filter((mark) => mark.late).length}</strong><small>Según inicio de turno</small></article><article class="metric-card"><span>PENDIENTES OFFLINE</span><strong>${marks.filter((mark) => mark.status !== "Sincronizado").length}</strong><small>En este dispositivo</small></article><article class="metric-card"><span>HORAS EXTRAS</span><strong>—</strong><small>Requiere integración de nómina</small></article></div>
    <section class="panel directory-panel"><div class="panel-heading"><div><span class="eyebrow">DETALLE</span><h3>Registro de marcaciones</h3></div></div>
      ${marks.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha y hora</th><th>Colaborador</th><th>Sede</th><th>Tipo</th><th>Estado de sincronización</th></tr></thead><tbody>${marks.map((mark) => { const person = employeeFor(mark.employeeId); return `<tr><td>${fmtDate(mark.timestamp)} · ${fmtTime(mark.timestamp)}</td><td>${escapeHtml(person?.name || "Colaborador")}</td><td>${escapeHtml(person?.site || "—")}</td><td><span class="badge ${mark.late ? "warning" : "success"}">${mark.action}${mark.late ? " · tarde" : ""}</span></td><td>${escapeHtml(mark.status)}</td></tr>`; }).join("")}</tbody></table></div>` : `<div class="empty-state"><span>▤</span><strong>Sin información para reportar</strong><small>Cuando existan marcaciones podrás exportarlas.</small></div>`}</section>
      <p class="footnote">Este prototipo no calcula recargos ni liquida nómina; exporta registros sin alterar para integración futura.</p>`;
}

function renderHelp() {
  return `<section class="page-intro"><div><span class="eyebrow">GUÍA RÁPIDA</span><h2>Manual de uso</h2><p>Orientación para la demostración del control de acceso.</p></div></section>
    <section class="help-grid"><article class="panel help-card"><span class="help-icon">◷</span><h3>Marcar asistencia</h3><p>Elige una persona y registra entrada o salida. El sistema alterna el botón según la última marcación del día y compara la entrada con el inicio del turno.</p></article>
    <article class="panel help-card"><span class="help-icon">▦</span><h3>Escanear QR</h3><p>Permite acceso a la cámara en un navegador compatible para leer el identificador del colaborador. Si no hay cámara, selecciona a la persona manualmente.</p></article>
    <article class="panel help-card"><span class="help-icon">♙</span><h3>Personal y turnos</h3><p>Administra altas y bajas, sede, modalidad y hora de inicio. La jefatura de demostración ve el equipo de la primera sede.</p></article>
    <article class="panel help-card"><span class="help-icon">◇</span><h3>Novedades y reportes</h3><p>Envía permisos para aprobación y exporta las marcaciones como CSV o imprime el reporte para guardarlo como PDF.</p></article></section>
    <section class="notice-card"><strong>Importante · modo de demostración</strong><p>Los datos se almacenan solo en el navegador. Los perfiles son vistas de muestra, no son autenticación ni autorización seguras. No ingreses datos personales reales.</p>
    <p>Para uso productivo aún se requiere servidor con autenticación, permisos por rol, cifrado, auditoría, copias de respaldo, sincronización sin conexión, integración con nómina, geolocalización autorizada y notificaciones programadas.</p></section>`;
}

function bindPageEvents() {
  nav.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => {
    stopScanner();
    page = button.dataset.page;
    render();
  }));
  content.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => { page = button.dataset.go; render(); }));
  const filter = document.querySelector("#site-filter");
  filter?.addEventListener("change", () => { siteFilter = filter.value; render(); });
  document.querySelector("#attendance-employee")?.addEventListener("change", () => {
    const person = employeeFor(selectedEmployee());
    const latest = todayMarks().filter((mark) => mark.employeeId === person?.id).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    document.querySelector("#selected-shift").textContent = person ? `${person.start} · ${person.type}` : "Sin personal activo";
    document.querySelector("#mark-button").textContent = latest?.action === "Entrada" ? "↗ Registrar salida" : "↘ Registrar entrada";
  });
  document.querySelector("#mark-button")?.addEventListener("click", () => doMark());
  document.querySelector("#scan-button")?.addEventListener("click", () => startScanner());
  document.querySelector("#employee-form")?.addEventListener("submit", addEmployee);
  document.querySelector("#reset-demo")?.addEventListener("click", () => {
    if (confirm("¿Restaurar los datos de muestra? Se perderán los datos guardados en este navegador.")) {
      const fresh = createInitialState();
      state.employees = fresh.employees; state.marks = fresh.marks; state.novelties = fresh.novelties; state.sites = fresh.sites;
      persist(); render(); showToast("Datos de muestra restaurados.");
    }
  });
  content.querySelectorAll("[data-toggle-employee]").forEach((button) => button.addEventListener("click", () => {
    const person = employeeFor(button.dataset.toggleEmployee);
    person.status = person.status === "Activo" ? "Inactivo" : "Activo";
    persist(); render(); showToast("Estado del colaborador actualizado.");
  }));
  content.querySelectorAll(".schedule-form").forEach((form) => form.addEventListener("submit", (event) => {
    event.preventDefault();
    const person = employeeFor(form.dataset.schedule);
    person.start = new FormData(form).get("start");
    persist(); render(); showToast("Turno actualizado.");
  }));
  document.querySelector("#novelty-form")?.addEventListener("submit", addNovelty);
  content.querySelectorAll("[data-approve]").forEach((button) => button.addEventListener("click", () => {
    const item = state.novelties.find((novelty) => novelty.id === button.dataset.approve);
    item.status = "Aprobada"; item.approvedAt = new Date().toISOString();
    persist(); render(); showToast("Novedad aprobada.");
  }));
  document.querySelector("#export-csv")?.addEventListener("click", exportReport);
  document.querySelector("#print-report")?.addEventListener("click", () => window.print());
}

function doMark(employeeId = selectedEmployee()) {
  const person = employeeFor(employeeId);
  if (!person) return showToast("Selecciona un colaborador activo.", true);
  const latest = todayMarks().filter((mark) => mark.employeeId === employeeId).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  const action = latest?.action === "Entrada" ? "Salida" : "Entrada";
  try {
    const isOffline = !navigator.onLine;
    const mark = markAttendance(state, employeeId, action, new Date(), isOffline);
    persist();
    render();
    const feedback = document.querySelector("#mark-feedback");
    if (mark.action === "Entrada") {
      feedback.className = `feedback ${mark.late ? "sad" : "happy"}`;
      feedback.innerHTML = `<span>${mark.late ? "☹" : "☺"}</span><strong>${mark.late ? "Puedes mejorarlo" : "Sigue así, lo haces muy bien"}</strong><small>Entrada ${fmtTime(mark.timestamp)} · ${mark.late ? "Llegada tarde" : "A tiempo"}</small>`;
    } else {
      feedback.className = "feedback happy";
      feedback.innerHTML = `<span>✓</span><strong>Salida registrada</strong><small>${fmtTime(mark.timestamp)} · ${escapeHtml(person.name)}</small>`;
    }
    showToast(isOffline ? "Marcación guardada. Pendiente de sincronización." : `${action} registrada para ${person.name}.`);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function startScanner() {
  const status = document.querySelector("#scan-status");
  const video = document.querySelector("#qr-video");
  if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
    status.textContent = "Este navegador no permite escanear QR. Selecciona el colaborador manualmente.";
    return;
  }
  try {
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = scannerStream;
    video.classList.remove("hidden");
    await video.play();
    status.textContent = "Apunta la cámara al QR del colaborador.";
    const scan = async () => {
      if (!scannerStream) return;
      try {
        const codes = await detector.detect(video);
        const employee = codes.length && state.employees.find((person) => person.id === codes[0].rawValue.trim());
        if (employee?.status === "Activo") {
          stopScanner();
          document.querySelector("#attendance-employee").value = employee.id;
          document.querySelector("#attendance-employee").dispatchEvent(new Event("change"));
          status.textContent = `QR identificado: ${employee.name}.`;
          doMark(employee.id);
          return;
        }
      } catch {
        status.textContent = "No se pudo leer el QR. Comprueba la iluminación e inténtalo de nuevo.";
      }
      scanFrame = requestAnimationFrame(scan);
    };
    scanFrame = requestAnimationFrame(scan);
  } catch {
    status.textContent = "No se pudo iniciar la cámara. Revisa el permiso del navegador.";
  }
}

function stopScanner() {
  if (scanFrame) cancelAnimationFrame(scanFrame);
  scannerStream?.getTracks().forEach((track) => track.stop());
  scannerStream = null;
  const video = document.querySelector("#qr-video");
  if (video) { video.pause(); video.srcObject = null; video.classList.add("hidden"); }
}

function addEmployee(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const nextId = state.employees.reduce((max, person) => Math.max(max, Number(person.id.slice(1)) || 0), 0) + 1;
  const id = `E${String(nextId).padStart(4, "0")}`;
  state.employees.push({ id, ...values, role: "Colaborador", status: "Activo" });
  persist(); render(); showToast("Colaborador agregado.");
}

function addNovelty(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const attachment = formData.get("attachment");
  const person = employeeFor(formData.get("employeeId"));
  if (!person?.status || person.status !== "Activo") return showToast("Selecciona un colaborador activo.", true);
  if (attachment?.size && attachment.type !== "application/pdf") return showToast("El soporte debe ser un archivo PDF.", true);
  state.novelties.push({
    id: globalThis.crypto?.randomUUID?.() ?? `N${Date.now()}`,
    employeeId: person.id,
    type: formData.get("type"),
    date: formData.get("date"),
    attachment: attachment?.size ? attachment.name : "",
    status: "Pendiente",
    createdAt: new Date().toISOString()
  });
  persist(); render(); showToast("Novedad enviada para aprobación.");
}

function exportReport() {
  const marks = state.marks.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  downloadCsv("reporte-asistencia.csv", [
    ["Fecha", "Hora", "Colaborador", "Identificación", "Sede", "Tipo de personal", "Marcación", "Tardanza", "Estado"],
    ...marks.map((mark) => {
      const person = employeeFor(mark.employeeId);
      return [fmtDate(mark.timestamp), fmtTime(mark.timestamp), person?.name, person?.id, person?.site, person?.type, mark.action, mark.late ? "Sí" : "No", mark.status];
    })
  ]);
}

roleSelect.addEventListener("change", render);
window.addEventListener("online", () => showToast("Conexión disponible. Los registros locales se mantienen pendientes de sincronización."));
window.addEventListener("offline", () => showToast("Sin conexión. Las nuevas marcaciones se guardarán localmente."));
render();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
