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

// ================= INICIALIZAR DATABASE =================

async function inicializarDatabase() {

  const client = await pool.connect();

  try {

    await client.query("BEGIN");

    // Crear tabla si todavía no existe
    await client.query(`
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

    // Incorporar nuevas columnas
    await client.query(`
      ALTER TABLE usos
        ADD COLUMN IF NOT EXISTS tipo TEXT,
        ADD COLUMN IF NOT EXISTS origen TEXT,
        ADD COLUMN IF NOT EXISTS duracion_ms INTEGER,
        ADD COLUMN IF NOT EXISTS version_extension TEXT
    `);

    // Clasificar registros históricos
    const resultado = await client.query(`
      UPDATE usos
      SET tipo = CASE

        WHEN ot ~ '^GAR-[0-9]{4}-[0-9]{6}$'
          AND UPPER(TRIM(reclamo)) = 'GAR'
          THEN 'TALLER_AUTORIZADO'

        WHEN ot ~ '^[0-9]+$'
          AND UPPER(TRIM(reclamo)) = 'CAMPANIA'
          THEN 'CAMPANIA'

        WHEN ot ~ '^[0-9]+$'
          AND TRIM(reclamo) ~ '^[0-9]+([[:space:]]*[-/][[:space:]]*[0-9]+)*$'
          THEN 'GARANTIA_INTERNA'

        ELSE 'SIN_CLASIFICAR'

      END

      WHERE tipo IS NULL
    `);

    const total = await client.query(`
      SELECT COUNT(*) AS total FROM usos
    `);

    await client.query("COMMIT");

    console.log("🐘 PostgreSQL conectado correctamente");

    console.log("✅ Estructura de base de datos verificada");

    console.log(
      "📊 Registros históricos clasificados:",
      resultado.rowCount
    );

    console.log(
      "📊 Total de registros almacenados:",
      total.rows[0].total
    );

  } catch (error) {

    await client.query("ROLLBACK");

    throw error;

  } finally {

    client.release();

  }

}


// ================= CONFIG =================

const ADMIN_KEY = process.env.ADMIN_KEY;
const SUPERVISOR_KEY = process.env.SUPERVISOR_KEY;

// ================= LICENCIAS =================

const LICENCIAS = {
  "B23VB198.ADMIN!": { activo: true, usuario: "ADMIN", expira: "2026-12-31" },
  "B23VB200": { activo: true, usuario: "Alejandra B.", expira: "2026-12-31" },
  "B23VB195": { activo: true, usuario: "Walter B.", expira: "2026-12-31" },
  "B23VB355": { activo: true, usuario: "Jorge G.", expira: "2026-12-31" },
  "B23VB888": { activo: true, usuario: "Fernando S.", expira: "2026-12-31" },
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

  const {
    licencia,
    ot,
    reclamo,
    origen,
    duracionMs,
    version
  } = req.body || {};

  // ================= VALIDAR DATOS =================

  if (
    typeof licencia !== "string" ||
    !["string", "number"].includes(typeof ot) ||
    !["string", "number"].includes(typeof reclamo)
  ) {

    return res.status(400).json({
      error: "DATOS_INCOMPLETOS"
    });

  }

  const numeroOT = String(ot).trim().toUpperCase();
  const reclamoRaw = String(reclamo).trim().toUpperCase();

  if (!licencia.trim() || !numeroOT || !reclamoRaw) {

    return res.status(400).json({
      error: "DATOS_INCOMPLETOS"
    });

  }


  // ================= VALIDAR LICENCIA =================

  const dataLicencia =
    Object.prototype.hasOwnProperty.call(LICENCIAS, licencia)
      ? LICENCIAS[licencia]
      : null;

  if (!dataLicencia) {

    return res.status(403).json({
      error: "LICENCIA_INVALIDA"
    });

  }

  if (!dataLicencia.activo) {

    return res.status(403).json({
      error: "LICENCIA_DESACTIVADA"
    });

  }

  const hoy = new Date();

  const expira = new Date(dataLicencia.expira);

  if (isNaN(expira.getTime()) || hoy > expira) {

    return res.status(403).json({
      error: "LICENCIA_EXPIRADA"
    });

  }

  const usuario = dataLicencia.usuario;


  // ================= CLASIFICACION =================

  const esGAR = /^GAR-\d{4}-\d{6}$/.test(numeroOT);

  const esOTInterna = /^\d+$/.test(numeroOT);

  if (!esGAR && !esOTInterna) {

    return res.status(400).json({
      error: "FORMATO_OT_INVALIDO"
    });

  }

  let tipo;
  let reclamos;

  if (esGAR) {

    if (reclamoRaw !== "GAR") {

      return res.status(400).json({
        error: "RECLAMO_GAR_INVALIDO"
      });

    }

    tipo = "TALLER_AUTORIZADO";
    reclamos = ["GAR"];

  } else if (reclamoRaw === "CAMPANIA") {

    tipo = "CAMPANIA";
    reclamos = ["CAMPANIA"];

  } else {

    tipo = "GARANTIA_INTERNA";

    reclamos = [...new Set(
      reclamoRaw
        .split(/[-/]/)
        .map(r => r.trim())
        .filter(Boolean)
    )];

    if (
      reclamos.length === 0 ||
      reclamos.some(r => !/^\d+$/.test(r))
    ) {

      return res.status(400).json({
        error: "RECLAMO_INVALIDO"
      });

    }

  }


  // ================= METADATOS =================

  const origenesPermitidos = {

    GARANTIA_INTERNA: [
      "SOLICITUD_INTERNA"
    ],

    CAMPANIA: [
      "SOLICITUD_INTERNA",
      "CAMPANIA_SIN_SOLICITUD"
    ],

    TALLER_AUTORIZADO: [
      "TALLER_AUTORIZADO"
    ]

  };

  let origenRegistro = null;

  if (typeof origen === "string") {

    const origenNormalizado =
      origen.trim().toUpperCase();

    if (
      origenesPermitidos[tipo]
        ?.includes(origenNormalizado)
    ) {

      origenRegistro = origenNormalizado;

    }

  }

  // Deducir origen cuando sea posible

  if (!origenRegistro) {

    if (tipo === "GARANTIA_INTERNA") {

      origenRegistro = "SOLICITUD_INTERNA";

    } else if (tipo === "TALLER_AUTORIZADO") {

      origenRegistro = "TALLER_AUTORIZADO";

    }

  }

  // Validar duración

  const duracionRegistro =

    Number.isInteger(duracionMs) &&
    duracionMs >= 0 &&
    duracionMs <= 2147483647

      ? duracionMs
      : null;

  // Validar versión

  const versionRegistro =

    typeof version === "string" &&
    /^\d+(\.\d+){1,3}$/.test(version.trim())

      ? version.trim()
      : null;


  // ================= REGISTRAR =================

  let registrados = 0;
  let duplicados = 0;
  let client;

  try {

    client = await pool.connect();

    await client.query("BEGIN");

    for (const r of reclamos) {

      const clave = `${licencia}-${numeroOT}-${r}`;

      
      const resultado = await client.query(`

        INSERT INTO usos (
          clave,
          usuario,
          licencia,
          ot,
          reclamo,
          fecha,
          tipo,
          origen,
          duracion_ms,
          version_extension
        )

        VALUES (
          $1, $2, $3, $4, $5,
          NOW(),
          $6, $7, $8, $9
        )

        ON CONFLICT (clave) DO NOTHING

        RETURNING id

      `, [

        clave,
        usuario,
        licencia,
        numeroOT,
        r,
        tipo,
        origenRegistro,
        duracionRegistro,
        versionRegistro

      ]);


      if (resultado.rowCount > 0) {

        registrados++;

      } else {

        duplicados++;

      }

    }

    await client.query("COMMIT");

    console.log("📊 REGISTRO DE PRODUCTIVIDAD:", {
      usuario,
      ot: numeroOT,
      tipo,
      registrados,
      duplicados
    });

    return res.json({

      ok: true,
      tipo,
      recibidos: reclamos.length,
      registrados,
      duplicados

    });

  } catch (e) {

    if (client) {

      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("❌ ROLLBACK ERROR:", rollbackError);
      }

    }

    console.error("❌ DB ERROR:", e);

    return res.status(500).json({
      error: "DB_ERROR"
    });

  } finally {

    if (client) {
      client.release();
    }

  }

});

// ============= METRICAS ==================

app.get("/metricas", authSupervisor, async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT usuario, reclamo, fecha
      FROM usos
    `);

    const rows = result.rows;

    // 🔧 función correcta (igual que frontend)
    function contarReclamos(str) {
      if (!str) return 0;
      return str.split("-").map(s => s.trim()).filter(Boolean).length;
    }

    const hoy = new Date();
    const inicioSemana = new Date();
    inicioSemana.setDate(hoy.getDate() - 7);

    let totalHoy = 0;
    let totalSemana = 0;
    let totalMes = 0;

    const ranking = {};

    const USUARIOS_PERMITIDOS = ["Walter B.", "Jorge G.", "Fernando S."];

    rows.forEach(r => {

      if (!USUARIOS_PERMITIDOS.includes(r.usuario)) return;

      const fecha = new Date(r.fecha);
      const cantidad = 1;

      // HOY
      if (fecha.toDateString() === hoy.toDateString()) {
        totalHoy += cantidad;
      }

      // SEMANA
      if (fecha >= inicioSemana) {
        totalSemana += cantidad;
      }

      // MES
      if (
        fecha.getMonth() === hoy.getMonth() &&
        fecha.getFullYear() === hoy.getFullYear()
      ) {
        totalMes += cantidad;
      }

      // RANKING
      if (!ranking[r.usuario]) {
        ranking[r.usuario] = 0;
      }

      ranking[r.usuario] += cantidad;

    });

    const rankingArray = Object.entries(ranking)
      .map(([usuario, total]) => ({ usuario, total }))
      .sort((a, b) => b.total - a.total);

    res.json({
      hoy: totalHoy,
      semana: totalSemana,
      mes: totalMes,
      ranking: rankingArray
    });

  } catch (e) {

    console.error("❌ METRICAS ERROR:", e);
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

async function iniciarServidor() {

  try {

    await inicializarDatabase();

    app.listen(PORT, () => {

      console.log(
        `🚀 Servidor corriendo en puerto ${PORT}`
      );

    });

  } catch (error) {

    console.error(
      "❌ ERROR AL INICIALIZAR EL SERVIDOR:",
      error
    );

    process.exit(1);

  }

}

iniciarServidor();
