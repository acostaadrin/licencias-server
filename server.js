// ================= SERVER LICENCIAS =================

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// ================= CONFIG =================

// 🔐 Clave admin (cambiar en producción)
const ADMIN_KEY = "SUPER_ADMIN_123!";

// 🔐 Base de licencias (temporal en memoria)
const LICENCIAS = {
  "B23VB198.ADMIN!": {
    activo: true,
    usuario: "ADMIN",
    expira: "2026-12-31"
  },
  "B23VB200": {
    activo: true,
    usuario: "Ale",
    expira: "2026-12-31"
  },
  "B23VB195": {
    activo: true,
    usuario: "Minion1",
    expira: "2026-05-31"
  },
  "B23VB355": {
    activo: true,
    usuario: "Minion2",
    expira: "2026-05-31"
  },
  "B23VB888": {
    activo: true,
    usuario: "Minion3",
    expira: "2026-05-31"
  },
  "TEST-OK": {
    activo: false,
    usuario: "test",
    expira: "2026-12-31"
  }
};

// ================= MIDDLEWARE ADMIN =================

function authAdmin(req, res, next) {

  const key = req.headers["x-admin-key"];

  if (key !== ADMIN_KEY) {
    return res.status(403).json({ error: "No autorizado" });
  }

  next();
}

// ================= VALIDACIÓN LICENCIA =================

app.post("/validar-licencia", (req, res) => {

  const { licencia } = req.body;

  if (!licencia) {
    return res.json({ valido: false, motivo: "SIN_LICENCIA" });
  }

  const data = LICENCIAS[licencia];

  if (!data) {
    return res.json({ valido: false, motivo: "NO_EXISTE" });
  }

  if (!data.activo) {
    return res.json({ valido: false, motivo: "DESACTIVADA" });
  }

  // 🔥 Validar fecha
  const hoy = new Date();
  const expira = new Date(data.expira);

  if (isNaN(expira)) {
    return res.json({ valido: false, motivo: "FECHA_INVALIDA" });
  }

  if (hoy > expira) {
    return res.json({ valido: false, motivo: "EXPIRADA" });
  }

  return res.json({
    valido: true,
    usuario: data.usuario,
    expira: data.expira
  });
});

// ================= ADMIN =================

// 🔹 Obtener todas las licencias
app.get("/licencias", authAdmin, (req, res) => {
  res.json(LICENCIAS);
});

// 🔹 Crear nueva licencia
app.post("/licencias", authAdmin, (req, res) => {

  const { key, usuario, expira } = req.body;

  if (!key) {
    return res.status(400).json({ error: "Falta key" });
  }

  if (!expira || isNaN(new Date(expira))) {
    return res.status(400).json({ error: "Fecha inválida" });
  }

  if (LICENCIAS[key]) {
    return res.status(400).json({ error: "La licencia ya existe" });
  }

  LICENCIAS[key] = {
    activo: true,
    usuario: usuario || "SIN_NOMBRE",
    expira
  };

  res.json({ ok: true });
});

// 🔹 Actualizar licencia
app.put("/licencias/:key", authAdmin, (req, res) => {

  const key = req.params.key;

  if (!LICENCIAS[key]) {
    return res.status(404).json({ error: "No existe" });
  }

  const { activo, usuario, expira } = req.body;

  if (expira && isNaN(new Date(expira))) {
    return res.status(400).json({ error: "Fecha inválida" });
  }

  LICENCIAS[key] = {
    ...LICENCIAS[key],
    ...(activo !== undefined && { activo }),
    ...(usuario && { usuario }),
    ...(expira && { expira })
  };

  res.json({ ok: true });
});

// ================= START =================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});