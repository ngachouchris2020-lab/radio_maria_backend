const { onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

exports.createSupportRequest = onCall(async (request) => {

  const {
    nom,
    telephone,
    ville,
    formule,
    montant
  } = request.data;

  const doc = await db.collection("demandes_soutien").add({
    nom,
    telephone,
    ville,
    formule,
    montant,
    statut: "en_attente",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    id: doc.id,
  };
});