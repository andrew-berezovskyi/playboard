CREATE TABLE account_devices (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_hash text NOT NULL CHECK (device_hash ~ '^[a-f0-9]{64}$'),
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_hash)
);
CREATE INDEX account_devices_hash_idx ON account_devices(device_hash, seen_at);
