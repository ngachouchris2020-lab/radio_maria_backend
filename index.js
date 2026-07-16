const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();


// Middlewares

app.use(cors());
app.use(express.json());


// ===============================
// Firebase Admin Configuration
// Render Environment Variables
// ===============================

try {

  admin.initializeApp({

    credential: admin.credential.cert({

      projectId: process.env.FIREBASE_PROJECT_ID,

      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,

      privateKey: process.env.FIREBASE_PRIVATE_KEY
        ?.replace(/\\n/g, "\n"),

    }),

  });


  console.log("Firebase Admin connecté");

} catch (error) {

  console.error(
    "Erreur connexion Firebase Admin :",
    error.message
  );

}


const db = admin.firestore();


// ===============================
// Test serveur
// ===============================

app.get("/", (req, res) => {

  res.send(
    "Radio Maria Backend fonctionne !"
  );

});



// ===============================
// Création demande soutien
// ===============================

app.post("/create-support-request", async (req, res) => {


  try {


    const {
      nom,
      telephone,
      ville,
      formule,
      montant

    } = req.body;



    // Validation simple

    if (
      !nom ||
      !telephone ||
      !ville ||
      !formule ||
      !montant
    ) {

      return res.status(400).json({

        success:false,

        message:
        "Informations incomplètes"

      });

    }



    const demande = {

      nom,

      telephone,

      ville,

      formule,

      montant:Number(montant),


      statut:"en_attente",


      createdAt:
      admin.firestore.FieldValue.serverTimestamp(),

    };



    const doc =
    await db
    .collection("demandes_soutien")
    .add(demande);



    console.log(
      "Nouvelle demande :",
      doc.id
    );



    return res.json({

      success:true,

      id:doc.id,

      message:
      "Demande enregistrée avec succès"

    });



  } catch(error) {


    console.error(
      "Erreur création demande :",
      error
    );



    return res.status(500).json({

      success:false,

      message:
      "Erreur serveur"

    });


  }


});



// ===============================
// Serveur Render
// ===============================

const PORT = process.env.PORT || 10000;


app.listen(PORT, () => {

  console.log(
    `Serveur lancé sur le port ${PORT}`
  );

});