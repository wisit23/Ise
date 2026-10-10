-- Keep case ownership separate from the verified CS customer responder.
ALTER TABLE support_tickets ADD COLUMN chat_responder_id TEXT;
CREATE INDEX support_tickets_chat_responder_idx ON support_tickets(chat_responder_id);
