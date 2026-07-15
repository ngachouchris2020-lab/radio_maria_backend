const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();

app.use(cors());
app.use(express.json());


// ===============================
// Firebase Admin
// ===============================

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,

    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,

    privateKey: process.env.FIREBASE_PRIVATE_KEY
      .replace(/\\n/g, "\n"),
  }),
});


const db = admin.firestore();


// ===============================
// Test serveur
// ===============================

app.get("/", (req, res) => {

  res.json({
    success: true,
    message: "Radio Maria Backend connecté à Firestore",
  });

});


// ===============================
// Création demande service
// ===============================

app.post("/create-service-request", async (req, res)=>{

try {

const {
  userId,
  service,
  description,
  montant
}=req.body;


const doc = await db
.collection("demandes_services")
.add({

userId,
service,
description,
montant,

status:"pending",

dateCreation:
admin.firestore.FieldValue.serverTimestamp()

});


res.json({

success:true,

id:doc.id

});


}catch(error){

console.error(error);

res.status(500).json({

success:false,

message:error.message

});

}


});



// ===============================
// Création demande paiement
// Préparation CinetPay
// ===============================

app.post("/create-payment-request", async(req,res)=>{

try{


const {

nom,
telephone,
ville,
formule,
montant

}=req.body;



const doc =
await db.collection("payment_requests")
.add({

nom,
telephone,
ville,
formule,
montant,

operateur:null,

transactionId:null,

paymentUrl:null,

paymentStatus:"non_paye",

status:"en_attente",

dateCreation:
admin.firestore.FieldValue.serverTimestamp()

});


res.json({

success:true,

id:doc.id,

message:"Demande paiement créée"

});


}catch(error){

console.error(error);

res.status(500).json({

success:false,

message:error.message

});

}


});



// ===============================
// Serveur Render
// ===============================

const PORT =
process.env.PORT || 10000;


app.listen(PORT,()=>{

console.log(
`Serveur lancé sur le port ${PORT}`
);

});