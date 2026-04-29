// ========= PARA ACTUALIZACIONES ==========

const path = require("path");

// ============ SERVER LICENCIAS ============

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// ================= CONFIG =================

const ADMIN_KEY = process.env.ADMIN_KEY;
const SUPERVISOR_KEY = process.env.SUPERVISOR_KEY;

// 🔐 Base de licencias
const LICENCIAS = {
  "B23VB198.ADMIN!": { activo: true, usuario: "ADMIN", expira: "2026-12-31" },
  "B23VB200": { activo: true, usuario: "Alejandra B.", expira: "2026-12-31" },
  "B23VB195": { activo: true, usuario: "Walter B.", expira: "2026-05-31" },
  "B23VB355": { activo: true, usuario: "Jorge G.", expira: "2026-05-31" },
  "B23VB888": { activo: true, usuario: "Fernando S.", expira: "2026-05-31" },
  "TEST-OK": { activo: false, usuario: "test", expira: "2026-12-31" }
};

// ================= REGISTRO DE USOS =================

const USOS = [];

// ================= MIDDLEWARE =================

function authAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== ADMIN_KEY) {
    return res.status(403).json({ error: "No autorizado" });
  }
  next();
}

function authSupervisor(req, res, next) {
  const key = req.headers["x-supervisor-key"];
  if (!key || key !== SUPERVISOR_KEY) {
    return res.status(403).json({ error: "No autorizado" });
  }
  next();
}

// ================= VALIDACIÓN LICENCIA =================

app.post("/validar-licencia", (req, res) => {

  const { licencia } = req.body;

  if (!licencia) return res.json({ valido: false, motivo: "SIN_LICENCIA" });

  const data = LICENCIAS[licencia];

  if (!data) return res.json({ valido: false, motivo: "NO_EXISTE" });
  if (!data.activo) return res.json({ valido: false, motivo: "DESACTIVADA" });

  const hoy = new Date();
  const expira = new Date(data.expira);

  if (isNaN(expira)) return res.json({ valido: false, motivo: "FECHA_INVALIDA" });
  if (hoy > expira) return res.json({ valido: false, motivo: "EXPIRADA" });

  return res.json({
    valido: true,
    usuario: data.usuario,
    expira: data.expira
  });
});

// ================= REGISTRAR USO =================

app.post("/registrar-uso", (req, res) => {

  const { licencia, ot, reclamo } = req.body;

  if (!licencia || !ot || !reclamo) {
    return res.status(400).json({ error: "DATOS_INCOMPLETOS" });
  }

  const user = LICENCIAS[licencia]?.usuario || "DESCONOCIDO";

  // 🔥 CLAVE ÚNICA (ANTI DUPLICADOS REAL)
  const clave = `${licencia}-${ot}-${reclamo}`;

  const existe = USOS.some(u => u.clave === clave);

  if (!existe) {

    const registro = {
      clave, // 🔑 clave interna
      usuario: user,
      licencia,
      ot,
      reclamo,
      fecha: new Date().toISOString()
    };

    USOS.push(registro);

    console.log("📊 USO REGISTRADO:", registro);

  } else {
    console.log("⚠️ DUPLICADO IGNORADO:", clave);
  }

  res.json({ ok: true });
});

// ================= ADMIN =================

app.get("/licencias", authAdmin, (req, res) => {
  res.json(LICENCIAS);
});

app.get("/usos-admin", authAdmin, (req, res) => {
  res.json(USOS);
});

// ================= SUPERVISOR =================

app.get("/usos", authSupervisor, (req, res) => {
  res.json(USOS);
});

// ================= LICENCIAS =================

app.post("/licencias", authAdmin, (req, res) => {

  const { key, usuario, expira } = req.body;

  if (!key) return res.status(400).json({ error: "Falta key" });
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

// ================= AUTO UPDATE =================

app.get("/garantia-extension.crx", (req, res) => {
  res.sendFile(path.join(__dirname, "garantia-extension.crx"));
});

app.get("/updates.xml", (req, res) => {
  res.set("Content-Type", "text/xml");
  res.sendFile(path.join(__dirname, "updates.xml"));
});

// ================= START =================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});