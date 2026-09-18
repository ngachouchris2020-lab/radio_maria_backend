const axios = require("axios");
const crypto = require("crypto");

async function createPayment(data) {
  try {

    const url =
      `${process.env.NOKASH_API_URL}` +
      `/lapas-on-trans/trans/api-payin-request/407`;

    // ==========================================
    // NORMALISATION DU NUMÉRO CAMEROUNAIS
    // ==========================================

    let phone = String(data.phone).trim();

    // Supprimer espaces, +, tirets, etc.
    phone = phone.replace(/\D/g, "");

    // Exemple :
    // 654816356
    // devient :
    // 237654816356

    if (phone.length === 9) {
      phone = "237" + phone;
    }

    // Vérification finale
    if (!phone.startsWith("237") || phone.length !== 12) {

      throw new Error(
        `Numéro camerounais invalide : ${data.phone}`
      );

    }

    // ==========================================
    // SIGNATURE HMAC NOKASH V407
    // ==========================================

    const signaturePayload =
      `${data.reference}:${data.amount}:${phone}:${process.env.NOKASH_APPLICATION_KEY}`;

    const hmacSignature =
      crypto
        .createHmac(
          "sha256",
          process.env.NOKASH_INTEGRATOR_KEY
        )
        .update(signaturePayload)
        .digest("hex");

    console.log(
      "SIGNATURE PAYLOAD =",
      signaturePayload
    );

    console.log(
      "HMAC GENERATED =",
      !!hmacSignature
    );

    // ==========================================
    // PAYLOAD NOKASH
    // ==========================================

    const payload = {

      i_space_key:
        process.env.NOKASH_INTEGRATOR_KEY,

      app_space_key:
        process.env.NOKASH_APPLICATION_KEY,

      order_id:
        data.reference,

      amount:
        String(data.amount),

      country:
        "CM",

      payment_method:
        data.paymentMethod,

      payment_type:
        "CM_MOBILEMONEY",

      callback_url:
        data.callbackUrl,

      user_data: {

        user_phone:
          phone

      }

    };

    // ==========================================
    // LOGS
    // ==========================================

    console.log(
      "NOKASH REQUEST :",
      {
        ...payload,
        i_space_key: "***",
        app_space_key: "***"
      }
    );

    console.log("NOKASH CONFIG :", {
      apiUrl: process.env.NOKASH_API_URL,
      integratorPresent:
        !!process.env.NOKASH_INTEGRATOR_KEY,
      applicationPresent:
        !!process.env.NOKASH_APPLICATION_KEY,
      integratorLength:
        process.env.NOKASH_INTEGRATOR_KEY?.length,
      applicationLength:
        process.env.NOKASH_APPLICATION_KEY?.length,
    });

    // ==========================================
    // APPEL NOKASH
    // ==========================================

    const response =
      await axios.post(
        url,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            "hmac-signature": hmacSignature
          },
          timeout: 30000
        }
      );

    console.log(
      "NOKASH RESPONSE :",
      response.data
    );

    return response.data;

  } catch (error) {

    console.error(
      "NOKASH ERROR :",
      error.response?.data ||
      error.message
    );

    throw error;
  }
}

module.exports = {
  createPayment
};