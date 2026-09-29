export const STORAGE_KEY = "control-de-acceso-state-v1";
const KEY_DATABASE = "control-de-acceso-keys-v1";
const KEY_STORE = "keys";

export const SITES = [
  "Sede 01 · Centro", "Sede 02 · Norte", "Sede 03 · Sur", "Sede 04 · Oriente",
  "Sede 05 · Occidente", "Sede 06 · Industrial", "Sede 07 · Parque", "Sede 08 · Terminal",
  "Sede 09 · Estación", "Sede 10 · Aeropuerto", "Sede 11 · Puerto", "Sede 12 · Bodega",
  "Sede 13 · Clínica", "Sede 14 · Comercial", "Sede 15 · Administrativa", "Sede 16 · Taller",
  "Sede 17 · Logística", "Sede 18 · Regional", "Sede 19 · Rural", "Sede 20 · Central",
  "Sede 21 · Valle", "Sede 22 · Costa", "Sede 23 · Montaña"
];

const SAMPLE_NAMES = [
  "Ana Torres", "Luis Rojas", "María Gómez", "Carlos Díaz", "Sofía Pérez", "Andrés Castro",
  "Valentina Ruiz", "Mateo Vargas", "Camila Herrera", "Samuel Ortiz", "Isabella Moreno",
  "Daniel Silva", "Lucía Ramírez", "Gabriel Muñoz", "Martina Álvarez", "Tomás Romero",
  "Paula Jiménez", "Nicolás Vásquez", "Elena Castillo", "Diego Mendoza", "Sara Cárdenas",
  "Juan Restrepo", "Laura Ospina"
];

export function createInitialState() {
  const employees = SAMPLE_NAMES.map((name, index) => ({
    id: `E${String(index + 1).padStart(4, "0")}`,
    name,
    site: SITES[index],
    type: index % 4 === 0 ? "Extramural" : "Intramural",
    status: "Activo",
    start: index % 4 === 0 ? "08:00" : "07:00",
    role: "Colaborador"
  }));
  return { employees, marks: [], novelties: [], sites: [...SITES] };
}

function getEncryptionKey(cryptoApi) {
  if (!globalThis.indexedDB || !cryptoApi?.subtle) throw new Error("Cifrado local no disponible.");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(KEY_DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(KEY_STORE);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction(KEY_STORE, "readonly").objectStore(KEY_STORE).get("state");
      read.onerror = () => reject(read.error);
      read.onsuccess = async () => {
        if (read.result) {
          database.close();
          resolve(read.result);
          return;
        }
        try {
          const key = await cryptoApi.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
          const transaction = database.transaction(KEY_STORE, "readwrite");
          transaction.objectStore(KEY_STORE).put(key, "state");
          transaction.oncomplete = () => { database.close(); resolve(key); };
          transaction.onerror = () => reject(transaction.error);
        } catch (error) {
          database.close();
          reject(error);
        }
      };
    };
  });
}

const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

export async function loadState(storage = globalThis.localStorage, cryptoApi = globalThis.crypto, key) {
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (!saved) return createInitialState();
    const envelope = JSON.parse(saved);
    if (envelope.format !== "AES-GCM-v1") return createInitialState();
    const encryptionKey = key || await getEncryptionKey(cryptoApi);
    const decrypted = await cryptoApi.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(envelope.iv) },
      encryptionKey,
      fromBase64(envelope.ciphertext)
    );
    const parsed = JSON.parse(new TextDecoder().decode(decrypted));
    if (!Array.isArray(parsed.employees) || !Array.isArray(parsed.marks)
      || !Array.isArray(parsed.novelties) || !Array.isArray(parsed.sites)) {
      return createInitialState();
    }
    return parsed;
  } catch {
    return createInitialState();
  }
}

export async function saveState(state, storage = globalThis.localStorage, cryptoApi = globalThis.crypto, key) {
  try {
    const encryptionKey = key || await getEncryptionKey(cryptoApi);
    const iv = cryptoApi.getRandomValues(new Uint8Array(12));
    const encrypted = await cryptoApi.subtle.encrypt(
      { name: "AES-GCM", iv },
      encryptionKey,
      new TextEncoder().encode(JSON.stringify(state))
    );
    storage?.setItem(STORAGE_KEY, JSON.stringify({
      format: "AES-GCM-v1",
      iv: toBase64(iv),
      ciphertext: toBase64(encrypted)
    }));
    return true;
  } catch {
    return false;
  }
}

function localDateAndMinutes(date) {
  return {
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    minutes: date.getHours() * 60 + date.getMinutes()
  };
}

export function markAttendance(state, employeeId, action, at = new Date(), offline = false) {
  if (action !== "Entrada" && action !== "Salida") throw new Error("Tipo de marcación inválido.");
  const employee = state.employees.find((item) => item.id === employeeId);
  if (!employee || employee.status !== "Activo") throw new Error("Colaborador no encontrado o inactivo.");
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) throw new Error("La fecha de marcación no es válida.");
  const current = localDateAndMinutes(date);
  const latest = state.marks
    .filter((mark) => mark.employeeId === employeeId && mark.date === current.date)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  if (action === "Entrada" && latest?.action === "Entrada") {
    throw new Error("Ya existe una entrada sin salida para hoy.");
  }
  if (action === "Salida" && latest?.action !== "Entrada") {
    throw new Error("Registra una entrada antes de la salida.");
  }

  const scheduledMinutes = Number(employee.start.slice(0, 2)) * 60 + Number(employee.start.slice(3, 5));
  const mark = {
    id: globalThis.crypto?.randomUUID?.() ?? `M${date.getTime()}${Math.random().toString(36).slice(2, 7)}`,
    employeeId,
    action,
    timestamp: date.toISOString(),
    date: current.date,
    late: action === "Entrada" && current.minutes > scheduledMinutes,
    status: offline ? "Pendiente de sincronización" : "Sincronizado"
  };
  state.marks.push(mark);
  return mark;
}

export function serializeCsv(rows) {
  const escape = (value) => {
    let text = String(value ?? "");
    if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return `\uFEFF${rows.map((row) => row.map(escape).join(";")).join("\r\n")}`;
}

export function downloadCsv(filename, rows) {
  const csv = serializeCsv(rows);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
