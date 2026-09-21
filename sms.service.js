const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Envoie un SMS via Twilio
 *
 * @param {string} phone Numéro du destinataire
 * @param {string} message Message à envoyer
 */
async function envoyerSMS(phone, message) {
  try {
    if (!phone) {
      throw new Error("Numéro de téléphone manquant");
    }

    if (!message) {
      throw new Error("Message SMS manquant");
    }

    // Normalisation du numéro camerounais
    let numero = String(phone).trim();

    numero = numero.replace(/\D/g, "");

    if (numero.length === 9) {
      numero = "237" + numero;
    }

    if (!numero.startsWith("237") || numero.length !== 12) {
      throw new Error(
        `Numéro camerounais invalide : ${phone}`
      );
    }

    const numeroInternational = `+${numero}`;

    console.log(
      "📱 Envoi SMS Twilio vers :",
      numeroInternational
    );

    const messageTwilio = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: numeroInternational,
    });

    console.log(
      "✅ SMS Twilio envoyé :",
      messageTwilio.sid
    );

    return {
      success: true,
      sid: messageTwilio.sid,
      status: messageTwilio.status,
    };
  } catch (error) {
    console.error(
      "❌ Erreur envoi SMS Twilio :",
      error.message
    );

    throw error;
  }
}

module.exports = {
  envoyerSMS,
};