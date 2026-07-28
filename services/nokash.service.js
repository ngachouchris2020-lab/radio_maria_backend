async function createPayment(data) {


    // =================================
    // MODE SIMULATION (avant les clés NOKASH)
    // =================================

    if (
        !process.env.NOKASH_API_KEY ||
        process.env.NOKASH_API_KEY === "test"
    ) {


        console.log(
            "NOKASH MODE SIMULATION"
        );


        return {


            success:true,


            transaction_id:
            "TEST-" + Date.now(),


            status:
            "pending",


            message:
            "Paiement simulé avec succès"


        };


    }



    // =================================
    // MODE REEL NOKASH
    // Activé quand les vraies clés arrivent
    // =================================


    const axios = require("axios");


    const response =
    await axios.post(

        `${process.env.NOKASH_API_URL}/payment`,

        {


            merchant_id:
            process.env.NOKASH_MERCHANT_ID,


            amount:
            data.amount,


            phone:
            data.phone,


            description:
            data.description,


            reference:
            data.reference


        },


        {


            headers:{


                Authorization:
                `Bearer ${process.env.NOKASH_API_KEY}`,


                "X-SECRET":
                process.env.NOKASH_SECRET,


                "Content-Type":
                "application/json"


            }


        }

    );


    return response.data;


}



module.exports = {

    createPayment

};