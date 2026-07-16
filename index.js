const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,

  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,

  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
};

const app = express();

app.use(cors());
app.use(express.json());


// Firebase Admin avec fichier service account


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


const db = admin.firestore();

// Test serveur
app.get("/", (req, res) => {
  res.send("Radio Maria Backend fonctionne !");
});


// Création demande soutien

app.post("/create-support-request", async (req, res) => {

   console.log("Headers:", req.headers);
   console.log("Body:", req.body);

  try {

    const {
      nom,
      telephone,
      ville,
      formule,
      montant

    } = req.body;


    const doc = await db.collection("demandes_soutien").add({

      nom,
      telephone,
      ville,
      formule,
      montant,

      statut: "en_attente",

      createdAt:
        admin.firestore.FieldValue.serverTimestamp(),

    });


    res.json({

      success:true,
      id:doc.id

    });


  } catch(error){

    console.error(error);

    res.status(500).json({

      success:false,
      message:error.message

    });

  }

});


// Port Render

const PORT = process.env.PORT || 10000;


app.listen(PORT, ()=>{

 console.log(`Serveur lancé sur le port ${PORT}`);

});