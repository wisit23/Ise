require('dotenv').config();
const app = require('./app');

const PORT = process.env.ORDER_PORT || 3003;
app.listen(PORT, () => console.log(`[order-service] listening on ${PORT}`));
