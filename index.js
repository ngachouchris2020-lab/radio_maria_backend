require("dotenv").config();
console.log(
  "PROJECT_ID =",
  process.env.FIREBASE_PROJECT_ID
);

console.log(
  "CLIENT_EMAIL =",
  process.env.FIREBASE_CLIENT_EMAIL
);

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

    credential: admin.credential.cert({

      projectId:
        process.env.FIREBASE_PROJECT_ID,

      clientEmail:
        process.env.FIREBASE_CLIENT_EMAIL,

      privateKey:
        process.env.FIREBASE_PRIVATE_KEY.replace(
          /\\n/g,
          "\n"
        )

    })

  });

  console.log("Firebase Admin connecté");

} catch (error) {

  console.error(
    "Erreur connexion Firebase Admin :",
    error
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
  "NOKASH_INTEGRATOR_KEY =",
  process.env.NOKASH_INTEGRATOR_KEY
    ? "CONFIGURED"
    : "MISSING"
);

console.log(
  "NOKASH_APPLICATION_KEY =",
  process.env.NOKASH_APPLICATION_KEY
    ? "CONFIGURED"
    : "MISSING"
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
// WEBHOOK NOKASH
// NOKASH appelle cette route après paiement
// ==================================================

app.post("/nokash-webhook", async (req, res) => {

  try {

    const data = req.body;

    console.log(
      "Notification NOKASH :",
      data
    );


    // ==================================================
    // 1. Récupération de l'identifiant NoKaSH
    // ==================================================

   const orderId =
  data.orderId ||
  data.order_id ||
  data.reference ||
  data.paymentReference;

const status =
  data.status ||
  data.payment_status;


if (!orderId) {
  console.error(
    "Webhook NOKASH : orderId manquant. Payload reçu :",
    JSON.stringify(data, null, 2)
  );

  return res.sendStatus(400);
}

    // ==================================================
    // 2. Recherche du paiement dans Firestore
    // ==================================================
    //
    // NoKaSH envoie :
    //
    // orderId: "RM-..."
    //
    // Notre Firestore contient :
    //
    // paymentReference: "RM-..."
    //
    // ==================================================

    
    console.log("orderId reçu =", orderId);
console.log("status reçu =", status);

    const snapshot =
      await db
        .collection("payment_requests")
        .where(
          "paymentReference",
          "==",
          orderId
        )
        .limit(1)
        .get();


    // ==================================================
    // 3. Paiement introuvable
    // ==================================================

    if (snapshot.empty) {

      console.error(
        "Paiement introuvable pour orderId :",
        orderId
      );

      return res.sendStatus(200);
    }


    // ==================================================
    // 4. Récupération du paiement
    // ==================================================

    const paymentDoc =
      snapshot.docs[0];

    const paymentData =
      paymentDoc.data();


    console.log(
      "Paiement trouvé :",
      paymentDoc.id
    );


    // ==================================================
    // 5. Mise à jour du paiement
    // ==================================================

    await paymentDoc.ref.update({

      nokashStatus:
        status,

      statusReason:
        data.statusReason || null,

      transactionId:
        data.id ||
        data.transaction_id ||
        null,

      nokashNotification:
        data,

      updatedAt:
        admin.firestore.FieldValue.serverTimestamp()

    });


    // ==================================================
    // 6. SI LE PAIEMENT N'EST PAS SUCCESS
    // ==================================================

    if (status !== "SUCCESS") {

  const reason =
    data.statusReason || "UNKNOWN";

  console.log(
    "Paiement non réussi :",
    status,
    reason
  );

  await paymentDoc.ref.update({

    nokashStatus:
      status,

    statusReason:
      reason,

    paymentStatus:
      "failed",

    status:
      "paiement_echoue",

    cardStatus:
      "inactive",

    nokashNotification:
      data,

    updatedAt:
      admin.firestore.FieldValue.serverTimestamp()

  });

  console.log(
    "Paiement FAILED enregistré dans Firestore :",
    paymentDoc.id
  );

  return res.sendStatus(200);
}


    // ==================================================
    // 7. Vérification du userId
    // ==================================================

    const userId =
      paymentData.userId;


    if (!userId) {

      console.error(
        "Paiement SUCCESS mais userId manquant :",
        orderId
      );

      return res.sendStatus(200);
    }


    // ==================================================
    // 8. Vérification de l'utilisateur
    // ==================================================

    const userRef =
      db
        .collection("users")
        .doc(userId);


    const userDoc =
      await userRef.get();


    if (!userDoc.exists) {

      console.error(
        "Utilisateur Firestore introuvable :",
        userId
      );

      return res.sendStatus(200);
    }


    // ==================================================
    // 9. Génération du numéro de carte
    // ==================================================

    const cardNumber =
      paymentData.cardNumber ||
      await genererNumeroCarte();


    // ==================================================
    // 10. Paiement SUCCESS
    // ==================================================

    await paymentDoc.ref.update({

      paymentStatus:
        "paye",

      status:
        "valide",

      cardNumber,

      cardStatus:
        "active",

      transactionId:
        data.id ||
        data.transaction_id ||
        null,

      paymentDate:
        admin.firestore.FieldValue.serverTimestamp(),

      updatedAt:
        admin.firestore.FieldValue.serverTimestamp()

    });


    // ==================================================
    // 11. Activation de la carte fidélité
    // ==================================================

    await userRef.update({
  hasFidelityCard: true,
  cardNumber,
  cardStatus: "active",
  supportTier: paymentData.formule,
  subscriptionActive: true,
  updatedAt:
    admin.firestore.FieldValue.serverTimestamp()
});


    console.log(
      "Paiement SUCCESS - carte activée :",
      orderId
    );


    return res.sendStatus(200);


  } catch (error) {

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

app.post("/create-payment-request", async (req, res) => {

  try {

    const {
      userId,
      nom,
      telephone,
      formule,
      montant,
      operateur
    } = req.body;


    // ===============================
    // Vérification des informations
    // ===============================

    if (
      !userId ||
      !nom ||
      !telephone ||
      !formule ||
      !montant ||
      !operateur
    ) {

      return res.status(400).json({
        success: false,
        message: "Informations incomplètes"
      });

    }


    // ===============================
    // Conversion opérateur
    // ===============================

    let paymentMethod;

    const operateurNormalise =
      String(operateur)
        .trim()
        .toLowerCase();


   if (
  operateurNormalise === "mtn" ||
  operateurNormalise === "mtn momo" ||
  operateurNormalise === "mtn_momo" ||
  operateurNormalise === "mtn_mobile_money" ||
  operateurNormalise === "mtn mobile money"
) {

      paymentMethod = "MTN_MOMO";

  } else if (
  operateurNormalise === "orange" ||
  operateurNormalise === "orange money" ||
  operateurNormalise === "orange_money"
) {

      paymentMethod = "ORANGE_MONEY";

    } else {

      return res.status(400).json({
        success: false,
        message:
          "Opérateur de paiement non pris en charge"
      });

    }


  

    // ===============================
    // Référence paiement
    // ===============================

    const paymentReference =
      "RM-" + Date.now();


    // ===============================
    // URL webhook
    // ===============================

    const callbackUrl =
      "https://radio-maria-backend.onrender.com/nokash-webhook";


    // ===============================
    // Création paiement NoKaSH
    // ===============================

    const nokashResponse =
      await createPayment({

        amount: Number(montant),

        phone: String(telephone),

        description: formule,

        reference: paymentReference,

        paymentMethod,

        callbackUrl

      });
      // ===============================
// Vérification réponse NoKaSH
// ===============================

if (nokashResponse.status !== "REQUEST_OK") {

    // ===============================
    // Génération carte fidélité
    // ===============================

   


  return res.status(400).json({

    success: false,

    message:
      nokashResponse.message ||
      "NoKaSH a refusé le paiement",

    data: nokashResponse

  });

}


    // ===============================
    // Enregistrement paiement
    // ===============================

    const demande = {

      userId,

      nom,

      telephone: String(telephone),

      formule,

      montant: Number(montant),

      operateur,

      paymentMethod,

      status: "paiement_initie",

     paymentStatus: "pending",
nokashStatus: nokashResponse.data?.status || "PENDING",
statusReason: null,
cardStatus: "inactive",

      paymentReference,

      nokashResponse,

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


    // ===============================
    // Mise à jour utilisateur
    // Carte créée mais inactive
    // ===============================

   await db
  .collection("users")
  .doc(userId)
  .update({
    
    supportTier: formule,
    subscriptionActive: false,
    cardStatus: "inactive",
    updatedAt:
      admin.firestore.FieldValue.serverTimestamp()
  }); 


    // ===============================
    // Réponse
    // ===============================

    return res.json({

      success: true,

      id: doc.id,


      paymentReference,

      paymentMethod,

      data: nokashResponse,

      message:
        "Paiement initié avec succès"

    });


  } catch (error) {

    console.error(
      "Erreur payment_request :",
      error.response?.data ||
      error.message ||
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Erreur lors de l'initialisation du paiement"

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
app.post("/create-service-request", async (req, res) => {
  try {

    const {
      userId,
      label,
      price,
      description,
      telephone,
      paymentMethod
    } = req.body;

    if (!label || !description) {
      return res.status(400).json({
        success: false,
        message: "Informations incomplètes"
      });
    }

    const doc = await db
      .collection("demandes_services")
      .add({
        userId: userId || null,
        service: label,
        montant: price,
        description,
        telephone: telephone || null,
        paymentMethod: paymentMethod || null,

        statut:
          price === "GRATUIT"
            ? "en_attente"
            : "paiement_requis",

        createdAt:
          admin.firestore.FieldValue.serverTimestamp()
      });

    return res.json({
      success: true,
      id: doc.id
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Erreur serveur"
    });

  }
});