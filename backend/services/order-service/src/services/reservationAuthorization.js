const {
  badRequest,
  forbidden,
  restrictionsForStatus,
  CAPABILITY,
} = require("@reloop/shared");
const authClient = require("./authClient");

async function authorizeReservation(reservation) {
  const seller = await authClient.getUser(reservation.product.sellerId);
  if (!seller) throw badRequest("product seller account was not found");
  if (restrictionsForStatus(seller.status).includes(CAPABILITY.SELLER))
    throw forbidden("product seller's selling rights are restricted");
  if (seller.status !== "ACTIVE")
    throw forbidden("product seller account is not active");
}

module.exports = { authorizeReservation };
