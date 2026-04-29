// ========= PARA ACTUALIZACIONES ==========

const path = require("path");

// ============ SERVER LICENCIAS ============

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());

// ================= DATABASE =================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

console.log("🐘 PostgreSQL conectado");

// Crear tabla
pool.query(`
  CREATE TABLE IF NOT EXISTS usos (
    id SERIAL PRIMARY KEY,
    clave TEXT UNIQUE,
    usuario TEXT,
    licencia TEXT,
    ot TEXT,
    reclamo TEXT,
    fecha TIMESTAMP
  )
`);

// ================= CONFIG =================

const ADMIN_KEY = process.env.ADMIN_KEY;
const SUPERVISOR_KEY = process.env.SUPERVISOR_KEY;

// ================= LICENCIAS =================

const LICENCIAS = {
  "B23VB198.ADMIN!": { activo: true, usuario: "ADMIN", expira: "2026-12-31" },
  "B23VB200": { activo: true, usuario: "Alejandra B.", expira: "2026-12-31" },
  "B23VB195": { activo: true, usuario: "Walter B.", expira: "2026-05-31" },
  "B23VB355": { activo: true, usuario: "Jorge G.", expira: "2026-05-31" },
  "B23VB888": { activo: true, usuario: "Fernando S.", expira: "2026-05-31" },
  "TEST-OK": { activo: false, usuario: "test", expira: "2026-12-31" }
};

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

app.post("/registrar-uso", async (req, res) => {

  const { licencia, ot, reclamo } = req.body;

  if (!licencia || !ot || !reclamo) {
    return res.status(400).json({ error: "DATOS_INCOMPLETOS" });
  }

  const user = LICENCIAS[licencia]?.usuario || "DESCONOCIDO";
  const clave = `${licencia}-${ot}-${reclamo}`;

  try {

    await pool.query(`
      INSERT INTO usos (clave, usuario, licencia, ot, reclamo, fecha)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (clave) DO NOTHING
    `, [clave, user, licencia, ot, reclamo]);

    console.log("📊 USO REGISTRADO:", clave);

    res.json({ ok: true });

  } catch (e) {

    console.error("❌ DB ERROR:", e);
    res.status(500).json({ error: "DB_ERROR" });

  }
});

// ================= ADMIN =================

app.get("/licencias", authAdmin, (req, res) => {
  res.json(LICENCIAS);
});

app.get("/usos-admin", authAdmin, async (req, res) => {

  try {
    const result = await pool.query("SELECT * FROM usos ORDER BY fecha DESC");
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: "DB_ERROR" });
  }
});

// ================= SUPERVISOR =================

app.get("/usos", authSupervisor, async (req, res) => {

  try {
    const result = await pool.query("SELECT * FROM usos ORDER BY fecha DESC");
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: "DB_ERROR" });
  }
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