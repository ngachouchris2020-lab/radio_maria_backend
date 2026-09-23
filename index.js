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

// ==================================================
// MIDDLEWARES
// ==================================================

app.use(cors());
app.use(express.json());

// ==================================================
// FIREBASE ADMIN
// ==================================================

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

// ==================================================
// NOKASH SERVICE
// ==================================================

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

// ==================================================
// TEST SERVEUR
// ==================================================

app.get("/", (req, res) => {

  res.send(
    "Radio Maria Backend fonctionne !"
  );

});

// ==================================================
// ==================================================
// PAIEMENT CARTE DE FIDELITE
// ==================================================
// ==================================================

app.post("/create-payment", async (req, res) => {

  try {

    const {
      nom,
      telephone,
      montant,
      formule
    } = req.body;

    if (
      !nom ||
      !telephone ||
      !montant ||
      !formule
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Informations paiement incomplètes"

      });

    }

    const reference =
      "RM-" + Date.now();

    const nokashResponse =
      await createPayment({

        amount: Number(montant),

        phone: telephone,

        description: formule,

        reference,

        paymentMethod:
          "MTN_MOMO",

        callbackUrl:
          "https://radio-maria-backend.onrender.com/nokash-webhook"

      });

    const doc =
      await db
        .collection("payment_requests")
        .add({

          nom,

          telephone,

          montant:
            Number(montant),

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

      success: true,

      id: doc.id,

      reference,

      data: nokashResponse

    });

  } catch (error) {

    console.error(
      "Erreur création paiement NOKASH :",
      error.response?.data ||
      error.message ||
      error
    );

    return res.status(500).json({

      success: false,

      message:
        "Erreur création paiement"

    });

  }

});

// ==================================================
// ==================================================
// WEBHOOK NOKASH
// ==================================================
// ==================================================

app.post("/nokash-webhook", async (req, res) => {

  try {

    const data = req.body;

    console.log(
      "======================================"
    );

    console.log(
      "NOTIFICATION NOKASH"
    );

    console.log(
      JSON.stringify(
        data,
        null,
        2
      )
    );

    console.log(
      "======================================"
    );

    // ==================================================
    // 1. IDENTIFIANT PAIEMENT
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
        "Webhook NOKASH : orderId manquant"
      );

      return res.sendStatus(400);
    }

    console.log(
      "orderId reçu =",
      orderId
    );

    console.log(
      "status reçu =",
      status
    );

    // ==================================================
    // 2. RECHERCHE PAIEMENT CARTE FIDELITE
    // ==================================================

    const paymentSnapshot =
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
    // 3. SI PAIEMENT CARTE TROUVE
    // ==================================================

    if (!paymentSnapshot.empty) {

      const paymentDoc =
        paymentSnapshot.docs[0];

      const paymentData =
        paymentDoc.data();

      console.log(
        "Paiement carte fidélité trouvé :",
        paymentDoc.id
      );

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
      // ECHEC CARTE
      // ==================================================

      if (status !== "SUCCESS") {

        const reason =
          data.statusReason ||
          "UNKNOWN";

        await paymentDoc.ref.update({

          paymentStatus:
            "failed",

          status:
            "paiement_echoue",

          cardStatus:
            "inactive",

          statusReason:
            reason,

          updatedAt:
            admin.firestore.FieldValue.serverTimestamp()

        });

        console.log(
          "Paiement carte échoué :",
          paymentDoc.id
        );

        return res.sendStatus(200);
      }

      // ==================================================
      // USER ID
      // ==================================================

      const userId =
        paymentData.userId;

      if (!userId) {

        console.error(
          "Paiement SUCCESS mais userId manquant"
        );

        return res.sendStatus(200);
      }

      const userRef =
        db
          .collection("users")
          .doc(userId);

      const userDoc =
        await userRef.get();

      if (!userDoc.exists) {

        console.error(
          "Utilisateur introuvable :",
          userId
        );

        return res.sendStatus(200);
      }

      // ==================================================
      // NUMERO CARTE
      // ==================================================

      const cardNumber =
        paymentData.cardNumber ||
        await genererNumeroCarte();

      // ==================================================
      // PAIEMENT SUCCESS
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
      // ACTIVATION CARTE
      // ==================================================

      await userRef.update({

        hasFidelityCard:
          true,

        cardNumber,

        cardStatus:
          "active",

        supportTier:
          paymentData.formule,

        subscriptionActive:
          true,

        updatedAt:
          admin.firestore.FieldValue.serverTimestamp()

      });

      console.log(
        "Paiement SUCCESS - carte activée :",
        orderId
      );

      return res.sendStatus(200);
    }

    // ==================================================
    // ==================================================
    // RECHERCHE PAIEMENT SERVICE SPIRITUEL
    // ==================================================
    // ==================================================

    const serviceSnapshot =
      await db
        .collection("demandes_services")
        .where(
          "paymentReference",
          "==",
          orderId
        )
        .limit(1)
        .get();

    // ==================================================
    // PAIEMENT SERVICE INTROUVABLE
    // ==================================================

    if (serviceSnapshot.empty) {

      console.error(
        "Aucun paiement trouvé pour orderId :",
        orderId
      );

      return res.sendStatus(200);
    }

    // ==================================================
    // DEMANDE SERVICE
    // ==================================================

    const serviceDoc =
      serviceSnapshot.docs[0];

    const serviceData =
      serviceDoc.data();

    console.log(
      "Paiement service spirituel trouvé :",
      serviceDoc.id
    );

    // ==================================================
    // MISE A JOUR NOKASH
    // ==================================================

    await serviceDoc.ref.update({

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
// PAIEMENT SERVICE ECHEC
// ==================================================

if (status !== "SUCCESS") {

  const reason =
    data.statusReason ||
    "UNKNOWN";

  await serviceDoc.ref.update({

    paymentStatus:
      "failed",

    status:
      "payment_failed",

    statut:
      "payment_failed",

    nokashStatus:
      status || "FAILED",

    statusReason:
      reason,

    datePaiement:
      null,

    updatedAt:
      admin.firestore.FieldValue.serverTimestamp()

  });

  console.log(
    "Paiement service échoué :",
    serviceDoc.id,
    "raison :",
    reason
  );

  return res.sendStatus(200);
}
// ==================================================
// PAIEMENT SERVICE SUCCESS
// ==================================================

await serviceDoc.ref.update({

  paymentStatus:
    "success",

  status:
    "paye",

  statut:
    "paye",

  paymentStatusLabel:
    "Paiement confirmé",

  transactionId:
    data.id ||
    data.transaction_id ||
    null,

  datePaiement:
    admin.firestore.FieldValue.serverTimestamp(),

  updatedAt:
    admin.firestore.FieldValue.serverTimestamp()

});
  

    // ==================================================
    // NOTIFICATION UTILISATEUR
    // ==================================================

    if (serviceData.userId) {

      await db
        .collection("notifications")
        .add({

          userId:
            serviceData.userId,

          title:
            "Paiement confirmé",

          message:
            `Votre paiement pour le service "${serviceData.service}" a bien été confirmé.`,

          type:
            "paiement_service_confirme",

          demandeId:
            serviceDoc.id,

          isRead:
            false,

          dateCreation:
            admin.firestore.FieldValue.serverTimestamp()

        });

    }

    console.log(
      "Paiement SERVICE SUCCESS :",
      serviceDoc.id
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
// ==================================================
// CREATION DEMANDE SOUTIEN
// ==================================================
// ==================================================

app.post(
  "/create-support-request",
  async (req, res) => {

    try {

      const {
        nom,
        telephone,
        ville,
        formule,
        montant
      } = req.body;

      if (
        !nom ||
        !telephone ||
        !ville ||
        !formule ||
        !montant
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Informations incomplètes"

        });

      }

      const demande = {

        nom,

        telephone,

        ville,

        formule,

        montant:
          Number(montant),

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

        success: true,

        id: doc.id,

        message:
          "Demande enregistrée avec succès"

      });

    } catch (error) {

      console.error(
        "Erreur création demande :",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          "Erreur serveur"

      });

    }

  }
);

// ==================================================
// ==================================================
// GENERATION CARTE FIDELITE
// ==================================================
// ==================================================

async function genererNumeroCarte() {

  const anneeActuelle =
    new Date().getFullYear();

  const counterRef =
    db
      .collection("counters")
      .doc("cardNumber");

  const nouveauNumero =
    await db.runTransaction(
      async (transaction) => {

        const doc =
          await transaction.get(
            counterRef
          );

        let valeur = 1;

        if (doc.exists) {

          const data =
            doc.data();

          if (
            data.annee ===
            anneeActuelle
          ) {

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

      }
    );

  const numero =
    String(nouveauNumero)
      .padStart(6, "0");

  return `RM-${anneeActuelle}-${numero}`;
}

// ==================================================
// ==================================================
// PAIEMENT CARTE FIDELITE
// ==================================================
// ==================================================

app.post(
  "/create-payment-request",
  async (req, res) => {

    try {

      const {
        userId,
        nom,
        telephone,
        formule,
        montant,
        operateur
      } = req.body;

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

          message:
            "Informations incomplètes"

        });

      }

      // ==================================================
      // OPERATEUR
      // ==================================================

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

        paymentMethod =
          "MTN_MOMO";

      } else if (
        operateurNormalise === "orange" ||
        operateurNormalise === "orange money" ||
        operateurNormalise === "orange_money"
      ) {

        paymentMethod =
          "ORANGE_MONEY";

      } else {

        return res.status(400).json({

          success: false,

          message:
            "Opérateur de paiement non pris en charge"

        });

      }

      // ==================================================
      // REFERENCE
      // ==================================================

      const paymentReference =
        "RM-" + Date.now();

      const callbackUrl =
        "https://radio-maria-backend.onrender.com/nokash-webhook";

      // ==================================================
      // NOKASH
      // ==================================================

      const nokashResponse =
        await createPayment({

          amount:
            Number(montant),

          phone:
            String(telephone),

          description:
            formule,

          reference:
            paymentReference,

          paymentMethod,

          callbackUrl

        });

      // ==================================================
      // VERIFICATION NOKASH
      // ==================================================

      if (
        nokashResponse.status !==
        "REQUEST_OK"
      ) {

        return res.status(400).json({

          success: false,

          message:
            nokashResponse.message ||
            "NoKaSH a refusé le paiement",

          data:
            nokashResponse

        });

      }

      // ==================================================
      // ENREGISTREMENT
      // ==================================================

      const demande = {

        userId,

        nom,

        telephone:
          String(telephone),

        formule,

        montant:
          Number(montant),

        operateur,

        paymentMethod,

        status:
          "paiement_initie",

        paymentStatus:
          "pending",

        nokashStatus:
          nokashResponse.data?.status ||
          "PENDING",

        statusReason:
          null,

        cardStatus:
          "inactive",

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

      // ==================================================
      // UTILISATEUR
      // ==================================================

      await db
        .collection("users")
        .doc(userId)
        .update({

          supportTier:
            formule,

          subscriptionActive:
            false,

          cardStatus:
            "inactive",

          updatedAt:
            admin.firestore.FieldValue.serverTimestamp()

        });

      return res.json({

        success: true,

        id:
          doc.id,

        paymentReference,

        paymentMethod,

        data:
          nokashResponse,

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

  }
);

// ==================================================
// ==================================================
// CREATION DEMANDE SERVICE SPIRITUEL
// ==================================================
// ==================================================

app.post(
  "/create-service-request",
  async (req, res) => {

    try {

      const {
        userId,
        label,
        price,
        description,
        telephone,
        paymentMethod
      } = req.body;

      if (
        !label ||
        !description
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Informations incomplètes"

        });

      }

      // ==================================================
      // CONVERSION DU PRIX
      // ==================================================

      let montant = 0;

      if (
        price &&
        String(price)
          .toUpperCase() !==
          "GRATUIT"
      ) {

        montant =
          Number(
            String(price)
              .replace(/\s/g, "")
              .replace("FCFA", "")
              .trim()
          );

        if (
          !Number.isFinite(montant) ||
          montant <= 0
        ) {

          return res.status(400).json({

            success: false,

            message:
              "Montant du service invalide"

          });

        }

      }

      const estGratuit =
        String(price)
          .trim()
          .toUpperCase() ===
        "GRATUIT";

      // ==================================================
      // CREATION FIRESTORE
      // ==================================================

      const demandeData = {

        userId:
          userId || null,

        service:
          label,

        montant,

        prixAffiche:
          price,

        description,

        telephone:
          telephone || null,

        paymentMethod:
          paymentMethod || null,

        statut:
          estGratuit
            ? "en_attente"
            : "paiement_requis",

        paymentStatus:
          estGratuit
            ? "non_requis"
            : "non_demarre",

        paymentReference:
          null,

        nokashStatus:
          null,

        transactionId:
          null,

        statusReason:
          null,

        datePaiement:
          null,

        createdAt:
          admin.firestore.FieldValue.serverTimestamp(),

        updatedAt:
          admin.firestore.FieldValue.serverTimestamp()

      };

      const doc =
        await db
          .collection("demandes_services")
          .add(
            demandeData
          );

      console.log(
        "Demande service créée :",
        doc.id
      );

      // ==================================================
      // NOTIFICATION ADMIN
      // ==================================================

      if (userId) {

        await db
          .collection("admin_notifications")
          .add({

            title:
              "Nouvelle demande de service",

            message:
              `${label} - nouvelle demande reçue`,

            type:
              "nouvelle_demande_service",

            demandeId:
              doc.id,

            userId,

            isRead:
              false,

            dateCreation:
              admin.firestore.FieldValue.serverTimestamp()

          });

      }

      // ==================================================
      // NOTIFICATION UTILISATEUR
      // ==================================================

      if (userId) {

        await db
          .collection("notifications")
          .add({

            userId,

            title:
              "Demande créée",

            message:
              `Votre demande "${label}" a bien été enregistrée.`,

            type:
              "demande_service_creee",

            demandeId:
              doc.id,

            isRead:
              false,

            dateCreation:
              admin.firestore.FieldValue.serverTimestamp()

          });

      }

      return res.json({

        success: true,

        id:
          doc.id,

        message:
          "Demande de service créée avec succès"

      });

    } catch (error) {

      console.error(
        "Erreur create-service-request :",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          "Erreur serveur"

      });

    }

  }
);

// ==================================================
// INITIATION PAIEMENT SERVICE SPIRITUEL
// ==================================================

app.post(
  "/initiate-payment",
  async (req, res) => {

    try {

      const {
        demandeId,
        telephone,
        paymentMethod
      } = req.body;

      console.log("======================================");
      console.log("PAIEMENT SERVICE - REQUETE FLUTTER");
      console.log("demandeId =", demandeId);
      console.log("telephone =", telephone);
      console.log("paymentMethod =", paymentMethod);
      console.log("======================================");

      // ==================================================
      // VALIDATION
      // ==================================================

      if (!demandeId) {

        return res.status(400).json({
          success: false,
          message: "demandeId manquant"
        });

      }

      if (!telephone) {

        return res.status(400).json({
          success: false,
          message: "Numéro Mobile Money manquant"
        });

      }

      if (!paymentMethod) {

        return res.status(400).json({
          success: false,
          message: "Méthode de paiement manquante"
        });

      }

      // ==================================================
      // RECUPERATION DEMANDE
      // ==================================================

      const demandeRef =
        db
          .collection("demandes_services")
          .doc(demandeId);

      const demandeDoc =
        await demandeRef.get();

      if (!demandeDoc.exists) {

        return res.status(404).json({
          success: false,
          message: "Demande de service introuvable"
        });

      }

      const demande =
        demandeDoc.data();

      console.log(
        "Demande trouvée :",
        {
          service: demande.service,
          montant: demande.montant,
          userId: demande.userId,
          status: demande.status,
          paymentStatus: demande.paymentStatus
        }
      );

      // ==================================================
      // VERIFICATION DU STATUT
      // ==================================================

      if (
        demande.status !== "paiement_requis" &&
        demande.status !== "payment_pending"
      ) {

        console.log(
          "Statut actuel de la demande :",
          demande.status
        );

        return res.status(400).json({

          success: false,

          message:
            "Le paiement n'est pas disponible pour cette demande"

        });

      }

      // ==================================================
      // VERIFICATION PAIEMENT DEJA EFFECTUE
      // ==================================================

      if (
        demande.paymentStatus === "success" ||
        demande.paymentStatus === "paid"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Cette demande a déjà été payée"

        });

      }

      // ==================================================
      // MONTANT
      // ==================================================

      const montant =
        Number(demande.montant);

      if (
        !Number.isFinite(montant) ||
        montant <= 0
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Montant du service invalide"

        });

      }

      // ==================================================
      // OPERATEUR
      // ==================================================

      const operateur =
        String(paymentMethod)
          .trim()
          .toLowerCase();

      let nokashPaymentMethod;

      if (
        operateur === "mtn" ||
        operateur === "momo" ||
        operateur === "mtn momo" ||
        operateur === "mtn_momo" ||
        operateur === "mtn mobile money" ||
        operateur === "mtn_mobile_money"
      ) {

        nokashPaymentMethod =
          "MTN_MOMO";

      } else if (
        operateur === "orange" ||
        operateur === "orange money" ||
        operateur === "orange_money"
      ) {

        nokashPaymentMethod =
          "ORANGE_MONEY";

      } else {

        return res.status(400).json({

          success: false,

          message:
            "Méthode de paiement invalide"

        });

      }

      // ==================================================
      // REFERENCE UNIQUE
      // ==================================================

      const paymentReference =
        "RM-SERVICE-" +
        Date.now();

      const callbackUrl =
        "https://radio-maria-backend.onrender.com/nokash-webhook";

      // ==================================================
      // APPEL NOKASH
      // ==================================================

      console.log("======================================");
      console.log("INITIALISATION PAIEMENT SERVICE");
      console.log("demandeId =", demandeId);
      console.log("montant =", montant);
      console.log("telephone =", telephone);
      console.log(
        "paymentMethod =",
        nokashPaymentMethod
      );
      console.log(
        "paymentReference =",
        paymentReference
      );
      console.log("======================================");

      const nokashResponse =
        await createPayment({

          amount:
            montant,

          phone:
            String(telephone),

          description:
            demande.service,

          reference:
            paymentReference,

          paymentMethod:
            nokashPaymentMethod,

          callbackUrl

        });

      // ==================================================
      // REPONSE NOKASH
      // ==================================================

      console.log("======================================");
      console.log("NO KASH PAYMENT RESPONSE");
      console.log(
        JSON.stringify(
          nokashResponse,
          null,
          2
        )
      );
      console.log("======================================");

      // ==================================================
      // NOKASH REFUSE
      // ==================================================

      if (
        nokashResponse.status !==
        "REQUEST_OK"
      ) {

        await demandeRef.update({

          paymentStatus:
            "failed",

          status:
            "payment_failed",

          statut:
            "payment_failed",

          nokashStatus:
            nokashResponse.status ||
            "FAILED",

          statusReason:
            nokashResponse.message ||
            "NoKaSH a refusé le paiement",

          nokashResponse,

          updatedAt:
            admin.firestore.FieldValue.serverTimestamp()

        });

        return res.status(400).json({

          success: false,

          message:
            nokashResponse.message ||
            "NoKaSH a refusé le paiement",

          data:
            nokashResponse

        });

      }

      // ==================================================
      // ENREGISTREMENT FIRESTORE
      // ==================================================

      await demandeRef.update({

        paymentReference,

        paymentMethod:
          nokashPaymentMethod,

        telephone:
          String(telephone),

        paymentStatus:
          "pending",

        status:
          "payment_pending",

        statut:
          "payment_pending",

        nokashStatus:
          nokashResponse.data?.status ||
          "PENDING",

        statusReason:
          null,

        nokashResponse,

        updatedAt:
          admin.firestore.FieldValue.serverTimestamp()

      });

      console.log(
        "Paiement service enregistré dans Firestore :",
        demandeId
      );

      // ==================================================
      // REPONSE FLUTTER
      // ==================================================

      return res.json({

        success: true,

        demandeId,

        paymentReference,

        paymentMethod:
          nokashPaymentMethod,

        data:
          nokashResponse,

        message:
          "Paiement initié avec succès"

      });

    } catch (error) {

      console.error(
        "======================================"
      );

      console.error(
        "ERREUR INITIATE PAYMENT"
      );

      console.error(
        error.response?.data ||
        error.message ||
        error
      );

      console.error(
        "======================================"
      );

      return res.status(500).json({

        success: false,

        message:
          "Impossible d'initier le paiement",

        error:
          error.response?.data ||
          error.message ||
          "Erreur inconnue"

      });

    }

  }
);
// ==================================================
// SERVEUR
// ==================================================

const PORT =
  process.env.PORT || 10000;

app.listen(
  PORT,
  () => {

    console.log(
      `Serveur lancé sur le port ${PORT}`
    );

  }
);