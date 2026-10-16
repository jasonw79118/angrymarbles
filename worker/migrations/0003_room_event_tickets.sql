CREATE TABLE IF NOT EXISTS room_event_tickets (
  token_hash TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS room_event_ticket_expiry ON room_event_tickets(expires_at);
