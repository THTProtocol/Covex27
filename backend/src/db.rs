use rusqlite::{Connection, params};
use std::sync::Mutex;

pub fn open_db(path: &str) -> anyhow::Result<Mutex<Connection>> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS covenants (
            tx_id        TEXT PRIMARY KEY,
            address      TEXT NOT NULL,
            amount_kaspa REAL NOT NULL DEFAULT 0,
            script_hash  TEXT NOT NULL DEFAULT '',
            description  TEXT NOT NULL DEFAULT '',
            timestamp    INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_covenants_address ON covenants(address);
        CREATE INDEX IF NOT EXISTS idx_covenants_timestamp ON covenants(timestamp);
        "
    )?;
    Ok(Mutex::new(conn))
}

pub fn insert_covenant(
    db: &Mutex<Connection>,
    tx_id: &str,
    address: &str,
    amount_sompi: u64,
    script_hash: &str,
    description: &str,
) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    let amount = amount_sompi as f64 / 100_000_000.0;
    conn.execute(
        "INSERT OR REPLACE INTO covenants (tx_id, address, amount_kaspa, script_hash, description, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5, unixepoch())",
        params![tx_id, address, amount, script_hash, description],
    )?;
    Ok(())
}

#[derive(serde::Serialize, Debug, Clone)]
pub struct DbUtxo {
    pub tx_id: String,
    pub address: String,
    pub amount_kaspa: f64,
    pub script_hash: String,
    pub description: String,
    pub timestamp: i64,
}

pub fn get_all_covenants(db: &Mutex<Connection>) -> anyhow::Result<Vec<DbUtxo>> {
    let conn = db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT tx_id, address, amount_kaspa, script_hash, description, timestamp FROM covenants ORDER BY timestamp DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DbUtxo {
            tx_id: row.get(0)?,
            address: row.get(1)?,
            amount_kaspa: row.get(2)?,
            script_hash: row.get(3)?,
            description: row.get(4)?,
            timestamp: row.get(5)?,
        })
    })?;
    let mut result = Vec::new();
    for row in rows { result.push(row?); }
    Ok(result)
}
