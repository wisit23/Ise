CREATE TABLE customer_satisfaction (
  case_id TEXT NOT NULL REFERENCES support_tickets(ticket_id) ON DELETE CASCADE,
  respondent_id TEXT NOT NULL,
  respondent_side TEXT NOT NULL CHECK (respondent_side IN ('REQUESTER','BUYER','SELLER')),
  agent_id TEXT,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '' CHECK (char_length(comment) <= 1000),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id, respondent_id)
);
CREATE INDEX customer_satisfaction_agent_id_created_at_idx ON customer_satisfaction(agent_id, created_at);
