require("dotenv").config();

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();


// ===============================
// Middlewares
// ===============================

app.use(cors());
app.use(express.json());



// ===============================
// Firebase Admin Configuration
// ===============================

try {

  admin.initializeApp({

    credential: admin.credential.cert(
      require("./radio-f14ca-firebase-adminsdk-fbsvc-42deb1673c.json")
    )

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
// NOKASH SERVICE
// ===============================

const {
  createPayment
} = require("./services/nokash.service");



console.log(
  "NOKASH_API_URL =",
  process.env.NOKASH_API_URL
);


console.log(
  "NOKASH_MERCHANT_ID =",
  process.env.NOKASH_MERCHANT_ID
);



// ===============================
// Test serveur
// ===============================

app.get("/", (req, res) => {

  res.send(
    "Radio Maria Backend fonctionne !"
  );

});




// ==================================================
// Création paiement NOKASH
// Préparé pour recevoir les vraies clés API plus tard
// ==================================================

app.post("/create-payment", async (req, res) => {


  try {


    const {

      nom,

      telephone,

      montant,

      formule

    } = req.body;



    if(
      !nom ||
      !telephone ||
      !montant ||
      !formule
    ){

      return res.status(400).json({

        success:false,

        message:
        "Informations paiement incomplètes"

      });

    }



    const reference =
      "RM-" + Date.now();



    const nokashResponse =
      await createPayment({

        amount:Number(montant),

        phone:telephone,

        description:formule,

        reference

      });



    const doc =
      await db
      .collection("payment_requests")
      .add({

        nom,

        telephone,

        montant:Number(montant),

        formule,


        reference,


        status:
        "paiement_initie",


        paymentStatus:
        "en_attente",


        nokashResponse,


        createdAt:
        admin.firestore.FieldValue.serverTimestamp()

      });



    return res.json({

      success:true,

      id:doc.id,

      reference,

      data:nokashResponse

    });



  } catch(error) {


    console.error(
      "Erreur création paiement NOKASH :",
      error
    );



    return res.status(500).json({

      success:false,

      message:
      "Erreur création paiement"

    });


  }


});




// ==================================================
// Webhook NOKASH
// NOKASH appelle cette route après paiement
// ==================================================

app.post("/nokash-webhook", async (req,res)=>{


try {


const data = req.body;



console.log(
"Notification NOKASH :",
data
);



// Recherche par référence

const snapshot =
await db
.collection("payment_requests")
.where(
"reference",
"==",
data.reference
)
.get();



if(!snapshot.empty){


const doc =
snapshot.docs[0];


await doc.ref.update({

  paymentStatus:
    data.status,

  transactionId:
    data.transaction_id || "",

  paymentDate:
    admin.firestore.FieldValue.serverTimestamp(),

  updatedAt:
    admin.firestore.FieldValue.serverTimestamp()

});


console.log(
"Paiement mis à jour :",
data.reference
);


}



return res.sendStatus(200);



}catch(error){


console.error(
"Erreur webhook NOKASH :",
error
);


return res.sendStatus(500);


}


});




// ==================================================
// Création demande soutien
// ==================================================

app.post("/create-support-request", async (req,res)=>{


try {


const {

nom,

telephone,

ville,

formule,

montant


}=req.body;



if(
!nom ||
!telephone ||
!ville ||
!formule ||
!montant
){


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


statut:
"en_attente",


createdAt:
admin.firestore.FieldValue.serverTimestamp()


};




const doc =
await db
.collection("demandes_soutien")
.add(demande);




return res.json({

success:true,

id:doc.id,

message:
"Demande enregistrée avec succès"

});



}catch(error){


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




// ==================================================
// Génération numéro carte fidélité
// ==================================================

async function genererNumeroCarte(){


const anneeActuelle =
new Date().getFullYear();



const counterRef =
db.collection("counters")
.doc("cardNumber");



const nouveauNumero =
await db.runTransaction(
async(transaction)=>{


const doc =
await transaction.get(counterRef);



let valeur = 1;



if(doc.exists){


const data =
doc.data();



if(data.annee === anneeActuelle){

valeur =
data.valeur + 1;

}


}



transaction.set(
counterRef,
{

annee:
anneeActuelle,

valeur

}

);



return valeur;



});



const numero =
String(nouveauNumero)
.padStart(6,"0");



return `RM-${anneeActuelle}-${numero}`;


}




// ==================================================
// Demande soutien avec carte fidélité
// ==================================================

app.post("/create-payment-request", async(req,res)=>{


try {


const {

nom,

telephone,

formule,

montant,

operateur


}=req.body;



if(
!nom ||
!telephone ||
!formule ||
!montant ||
!operateur
){


return res.status(400).json({

success:false,

message:
"Informations incomplètes"

});


}



const cardNumber =
await genererNumeroCarte();

const paymentReference =
  "RM-" + Date.now();

const nokashResponse =
  await createPayment({

    amount: Number(montant),

    phone: telephone,

    description: formule,

    reference: paymentReference

  });

const demande = {

  cardNumber,

  nom,

  telephone:Number(telephone),

  formule,

  montant:Number(montant),

  operateur,

  status:"en_attente",

  paymentStatus:"pending",

  paymentReference,

  transactionId:
    nokashResponse.transaction_id || "",

  dateCreation:
    admin.firestore.FieldValue.serverTimestamp(),

  createdAt:
    admin.firestore.FieldValue.serverTimestamp(),

  updatedAt:
    admin.firestore.FieldValue.serverTimestamp()

};



const doc =
await db
.collection("payment_requests")
.add(demande);



return res.json({

  success:true,

  id:doc.id,

  cardNumber,

  paymentReference,

  transactionId:
    nokashResponse.transaction_id,

  paymentStatus:
    nokashResponse.status,

  message:
    "Paiement initié avec succès"

});


}catch(error){


console.error(
"Erreur payment_request :",
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
// Serveur
// ===============================

const PORT =
process.env.PORT || 10000;



app.listen(PORT,()=>{


console.log(

`Serveur lancé sur le port ${PORT}`

);


});