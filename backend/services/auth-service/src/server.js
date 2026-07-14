require('dotenv').config();
const app = require('./app');

const PORT = process.env.AUTH_PORT || 3001;
app.listen(PORT, () => console.log(`[auth-service] listening on ${PORT}`));
