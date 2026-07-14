require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { verifyAccessToken } = require('@reloop/shared');

const app = express();
app.use(cors());

const SERVICES = {
  auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
  products: process.env.PRODUCT_SERVICE_URL || 'http://product-service:3002',
  orders: process.env.ORDER_SERVICE_URL || 'http://order-service:3003',
  chat: process.env.CHAT_SERVICE_URL || 'http://chat-service:3004',
  reviews: process.env.REVIEW_SERVICE_URL || 'http://review-service:3005',
};

// Routes that don't require a valid access token (register/login/refresh, public feed reads).
const PUBLIC_PATHS = [/^\/api\/auth\/(register|login|refresh)/, /^\/api\/products\/feed/, /^\/api\/products\/search/];

function isPublic(path) {
  return PUBLIC_PATHS.some((re) => re.test(path));
}

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gateway' }));

app.use((req, res, next) => {
  if (isPublic(req.path)) return next();

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  try {
    const payload = verifyAccessToken(token);
    req.headers['x-user-id'] = payload.sub;
    req.headers['x-user-role'] = payload.role;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

app.use('/api/auth', createProxyMiddleware({ target: SERVICES.auth, changeOrigin: true }));
app.use('/api/products', createProxyMiddleware({ target: SERVICES.products, changeOrigin: true }));
app.use('/uploads', createProxyMiddleware({ target: SERVICES.products, changeOrigin: true }));
app.use('/api/orders', createProxyMiddleware({ target: SERVICES.orders, changeOrigin: true }));
app.use('/api/chat', createProxyMiddleware({ target: SERVICES.chat, changeOrigin: true, ws: true }));
app.use('/api/reviews', createProxyMiddleware({ target: SERVICES.reviews, changeOrigin: true }));

const PORT = process.env.GATEWAY_PORT || 8080;
const server = app.listen(PORT, () => console.log(`[gateway] listening on ${PORT}`));

// Proxy WebSocket upgrade requests (chat) through the gateway.
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/api/chat')) {
    createProxyMiddleware({ target: SERVICES.chat, changeOrigin: true, ws: true }).upgrade(req, socket, head);
  }
});
