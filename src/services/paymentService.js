const payos = require("../config/payos");
exports.createPayosPayment = async ({ orderCode, amount, ticket, paymentType }) => {

  const FE = process.env.FRONTEND_URL || "http://localhost:3000";

  let description = "";
  if (paymentType === "SURVEY_DEPOSIT") {
    description = `Dat coc KS ${ticket.code}`;
  }
  if (paymentType === "MOVING_DEPOSIT") {
    description = `Dat coc don ${ticket.code}`;
  }
  const body = {
    orderCode,
    amount: 2000, //Number(amount) 
    description: description.substring(0, 25),
    returnUrl: `${FE}/payment/success?ticketId=${ticket._id}`,
    cancelUrl: `${FE}/payment/cancel?ticketId=${ticket._id}`
  };

  const paymentLink = await payos.paymentRequests.create(body);

  return paymentLink.checkoutUrl;
};


exports.verifyWebhook = (payload) => {
  try {

    if (payload.code === "00" && payload.success) {
      return payload.data;
    }

    return null;

  } catch (error) {
    console.log("Webhook verify error:", error.message);
    return null;
  }
};
