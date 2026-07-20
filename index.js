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
// Création demande soutien (INCHANGÉ)
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


// ===================================================================
// NOUVEAU — Génération séquentielle du numéro de carte de fidélité
// ===================================================================
//
// IMPORTANT : ce numéro ne doit JAMAIS être généré côté Flutter.
// Si deux utilisateurs créent une demande au même moment, un calcul fait
// dans l'app (ex: DateTime.now()) pourrait produire le même numéro pour
// les deux. Ici, on utilise une transaction Firestore : elle garantit
// que même en cas d'appels simultanés, chaque lecture+écriture du
// compteur est atomique, donc jamais deux demandes ne reçoivent le
// même numéro.
//
// Format : RM-{année}-{6 chiffres}, avec remise à zéro chaque année.

async function genererNumeroCarte() {
  const anneeActuelle = new Date().getFullYear();
  const counterRef = db.collection("counters").doc("cardNumber");

  const nouveauNumero = await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(counterRef);

    let valeur = 1;

    if (doc.exists) {
      const data = doc.data();
      if (data.annee === anneeActuelle) {
        valeur = data.valeur + 1;
      }
      // Si l'année a changé, on repart automatiquement à 1.
    }

    transaction.set(counterRef, { annee: anneeActuelle, valeur });

    return valeur;
  });

  const valeurFormatee = String(nouveauNumero).padStart(6, "0");
  return `RM-${anneeActuelle}-${valeurFormatee}`;
}


// ===================================================================
// NOUVEAU — Création d'une demande de soutien AVEC carte de fidélité
// Écrit dans la collection payment_requests, avec le schéma exact que
// vous avez défini dans la console Firebase.
// ===================================================================

app.post("/create-payment-request", async (req, res) => {
  try {
    const { nom, telephone, formule, montant, operateur } = req.body;

    if (!nom || !telephone || !formule || !montant || !operateur) {
      return res.status(400).json({
        success: false,
        message: "Informations incomplètes",
      });
    }

    const cardNumber = await genererNumeroCarte();

    const demande = {
      cardNumber,
      nom,
      telephone: Number(telephone),
      formule,
      montant: Number(montant),
      operateur,

      // Deux statuts séparés, comme dans votre schéma :
      // - status       : où en est la DEMANDE (en_attente / validee / ...)
      // - paymentStatus: où en est le PAIEMENT (non_paye / paye / echec)
      status: "en_attente",
      paymentStatus: "non_paye",

      dateCreation: admin.firestore.FieldValue.serverTimestamp(),
    };

    const doc = await db.collection("payment_requests").add(demande);

    console.log("Nouvelle demande de soutien :", doc.id, cardNumber);

    return res.json({
      success: true,
      id: doc.id,
      cardNumber,
      message: "Demande enregistrée avec succès",
    });
  } catch (error) {
    console.error("Erreur création payment_request :", error);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur",
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