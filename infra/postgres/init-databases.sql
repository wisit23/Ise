-- RE-LOOP: database-per-service on a single Postgres instance
-- chat-service deliberately does NOT get a database here — it uses MongoDB
-- (DATABASE_URL_CHAT, see .env.example and docker-compose.yml's `mongo`
-- service) instead of Postgres. See docs/featureplan/chat/plan.md for why.
CREATE DATABASE reloop_auth;
CREATE DATABASE reloop_product;
CREATE DATABASE reloop_order;
CREATE DATABASE reloop_review;
CREATE DATABASE reloop_support;
