import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState, loadState, markAttendance, saveState, serializeCsv, STORAGE_KEY } from "../src/domain.js";

const employee = { id: "A1", name: "Ejemplo", site: "Sede", type: "Intramural", status: "Activo", start: "07:00" };
const fixedDate = (hour, minute = 0) => new Date(2026, 0, 5, hour, minute);

test("marca entrada a tiempo con la hora real y conserva el estado offline", () => {
  const state = { employees: [employee], marks: [], novelties: [], sites: [] };
  const mark = markAttendance(state, "A1", "Entrada", fixedDate(7, 0), true);
  assert.equal(mark.late, false);
  assert.equal(mark.status, "Pendiente de sincronización");
  assert.equal(mark.timestamp, fixedDate(7, 0).toISOString());
  assert.equal(state.marks.length, 1);
});

test("detecta tardanza y exige entrada antes de permitir salida", () => {
  const state = { employees: [employee], marks: [], novelties: [], sites: [] };
  assert.throws(() => markAttendance(state, "A1", "Salida", fixedDate(8)), /entrada antes/);
  assert.equal(markAttendance(state, "A1", "Entrada", fixedDate(7, 1)).late, true);
  assert.throws(() => markAttendance(state, "A1", "Entrada", fixedDate(8)), /sin salida/);
  assert.equal(markAttendance(state, "A1", "Salida", fixedDate(16)).action, "Salida");
});

test("bloquea personas inactivas y acciones inválidas", () => {
  const state = { employees: [{ ...employee, status: "Inactivo" }], marks: [], novelties: [], sites: [] };
  assert.throws(() => markAttendance(state, "A1", "Entrada", fixedDate(7)), /inactivo/);
  assert.throws(() => markAttendance(state, "A1", "Otro", fixedDate(7)), /inválido/);
});

test("restaura estado guardado y vuelve al estado inicial ante datos corruptos", () => {
  const saved = new Map();
  const storage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value)
  };
  const state = createInitialState();
  assert.equal(saveState(state, storage), true);
  assert.equal(saved.has(STORAGE_KEY), true);
  assert.deepEqual(loadState(storage), state);
  storage.setItem(STORAGE_KEY, "{");
  assert.equal(loadState(storage).sites.length, 23);
});

test("exporta CSV con delimitadores escapados y neutraliza fórmulas de hoja de cálculo", () => {
  const csv = serializeCsv([["Nombre", "Observación"], ['Ana "A"', "=1+1"]]);
  assert.match(csv, /"Ana ""A"""/);
  assert.match(csv, /"'=1\+1"/);
  assert.match(csv, /^\uFEFF/);
});
