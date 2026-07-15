const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// ===============================
// Route de test
// ===============================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Radio Maria Backend fonctionne sur Render",
  });
});

// ===============================
// Création demande soutien (test)
// ===============================

app.post("/create-support-request", async (req, res) => {
  try {
    const {
      nom,
      telephone,
      ville,
      formule,
      montant,
    } = req.body;

    res.json({
      success: true,
      message: "Demande reçue",
      data: {
        nom,
        telephone,
        ville,
        formule,
        montant,
      },
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ===============================
// Démarrage serveur Render
// ===============================

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Serveur lancé sur le port ${PORT}`);
});