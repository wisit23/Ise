ALTER TABLE support_tickets
  ADD COLUMN closed_at TIMESTAMPTZ(3),
  ADD COLUMN archived_at TIMESTAMPTZ(3),
  ADD COLUMN deleted_at TIMESTAMPTZ(3),
  ADD COLUMN retention_until TIMESTAMPTZ(3);

UPDATE support_tickets t SET closed_at = history.closed_at
FROM (
  SELECT h.ticket_id, max(h.created_at) AS closed_at
  FROM ticket_status_history h
  JOIN ticket_statuses s ON s.ticket_status_id = h.to_status_id
  WHERE s.code = 'CLOSED' GROUP BY h.ticket_id
) history
WHERE history.ticket_id = t.ticket_id
  AND t.current_status_id IN (SELECT ticket_status_id FROM ticket_statuses WHERE code = 'CLOSED');

CREATE INDEX support_tickets_archived_at_deleted_at_closed_at_idx
  ON support_tickets(archived_at, deleted_at, closed_at);
