// ================= SERVER LICENCIAS =================

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// 🔐 Base de licencias (temporal)
const LICENCIAS = {
  "B23VB198.ADMIN!": {
	activo: true,
	usuario: "ADMIN",
	expira: "2026-12-31"
  },
  "B23VB200":
	{ activo: true,
	usuario: "Ale",
	expira: "2026-12-31"
  },
  "B23VB":
	{ activo: false,
	usuario: "Minions",
	expira: "2026-05-31"
  },
  "TEST-OK":
	{ activo: false,
	usuario: "test",
	expira: "2026-12-31"
  } // ejemplo desactivada
};

// ================= ENDPOINT =================

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

  // 🔥 VALIDACIÓN DE FECHA
  const hoy = new Date();
  const expira = new Date(data.expira);

  if (hoy > expira) {
    return res.json({ valido: false, motivo: "EXPIRADA" });
  }

  return res.json({
    valido: true,
    usuario: data.usuario,
    expira: data.expira
  });
});

// ================= START =================

app.listen(3000, () => {
  console.log("🚀 Servidor de licencias corriendo en http://localhost:3000");
});