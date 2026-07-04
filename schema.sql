CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY,
  username TEXT,
  full_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
