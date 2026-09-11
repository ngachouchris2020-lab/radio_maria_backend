const axios = require("axios");

async function createPayment(data) {
  try {

    const url =
      `${process.env.NOKASH_API_URL}` +
      `/lapas-on-trans/api-payin-request/407`;

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
    // LOG
    // ==========================================

    console.log(
      "NOKASH REQUEST :",
      {
        ...payload,

        i_space_key: "***",

        app_space_key: "***"
      }
    );

    // ==========================================
    // APPEL NOKASH
    // ==========================================

    const response =
      await axios.post(
        url,
        payload,
        {
          headers: {
            "Content-Type":
              "application/json"
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