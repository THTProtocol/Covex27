use rusqlite::{params, Connection};
use std::sync::Mutex;

pub fn open_db(path: &str) -> anyhow::Result<Mutex<Connection>> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS covenants (
            tx_id               TEXT PRIMARY KEY,
            address             TEXT NOT NULL,
            amount_kaspa        REAL NOT NULL DEFAULT 0,
            script_hash         TEXT NOT NULL DEFAULT '',
            script_hex          TEXT NOT NULL DEFAULT '',
            covenant_type       TEXT NOT NULL DEFAULT '',
            category            TEXT NOT NULL DEFAULT 'general',
            creator_addr        TEXT NOT NULL DEFAULT '',
            description         TEXT NOT NULL DEFAULT '',
            verified_tier       TEXT NOT NULL DEFAULT 'FREE',
            verified_payment_tx TEXT,
            verified_at         INTEGER,
            custom_ui_enabled   INTEGER NOT NULL DEFAULT 0,
            full_logic_summary  TEXT NOT NULL DEFAULT '',
            receiving_addresses TEXT NOT NULL DEFAULT '',
            is_active           INTEGER NOT NULL DEFAULT 1,
            block_daa_score     INTEGER NOT NULL DEFAULT 0,
            timestamp           INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_covenants_address ON covenants(address);
        CREATE INDEX IF NOT EXISTS idx_covenants_type ON covenants(covenant_type);
        CREATE INDEX IF NOT EXISTS idx_covenants_category ON covenants(category);
        CREATE INDEX IF NOT EXISTS idx_covenants_timestamp ON covenants(timestamp);
        CREATE INDEX IF NOT EXISTS idx_covenants_active ON covenants(is_active);
        CREATE INDEX IF NOT EXISTS idx_covenants_verified ON covenants(verified_tier);
        CREATE INDEX IF NOT EXISTS idx_covenants_creator ON covenants(creator_addr);

        CREATE TABLE IF NOT EXISTS payments (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            tx_id           TEXT NOT NULL UNIQUE,
            from_address    TEXT NOT NULL,
            to_address      TEXT NOT NULL,
            amount_sompi    INTEGER NOT NULL,
            amount_kaspa    REAL NOT NULL DEFAULT 0,
            tier            TEXT NOT NULL,
            confirmations   INTEGER NOT NULL DEFAULT 0,
            status          TEXT NOT NULL DEFAULT 'pending',
            covenant_id     TEXT,
            timestamp       INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_payments_tier ON payments(tier);
        CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
        CREATE INDEX IF NOT EXISTS idx_payments_from ON payments(from_address);

        CREATE TABLE IF NOT EXISTS accounts (
            address         TEXT PRIMARY KEY,
            tier            TEXT NOT NULL DEFAULT 'FREE',
            payment_tx_id   TEXT,
            paid_at         INTEGER,
            expires_at      INTEGER,
            is_active       INTEGER NOT NULL DEFAULT 1,
            created_at      INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_accounts_tier ON accounts(tier);

        CREATE TABLE IF NOT EXISTS generated_uis (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            covenant_id    TEXT NOT NULL,
            owner_address   TEXT NOT NULL,
            tier            TEXT NOT NULL,
            ui_html         TEXT NOT NULL DEFAULT '',
            ui_config       TEXT NOT NULL DEFAULT '{}',
            slug            TEXT NOT NULL UNIQUE,
            is_published    INTEGER NOT NULL DEFAULT 1,
            featured        INTEGER NOT NULL DEFAULT 0,
            ui_generated_at INTEGER NOT NULL DEFAULT (unixepoch()),
            created_at      INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_uis_covenant ON generated_uis(covenant_id);
        CREATE INDEX IF NOT EXISTS idx_uis_owner ON generated_uis(owner_address);
        CREATE INDEX IF NOT EXISTS idx_uis_featured ON generated_uis(featured);

        CREATE TABLE IF NOT EXISTS visibilities (
            covenant_id     TEXT PRIMARY KEY,
            tier            TEXT NOT NULL DEFAULT 'FREE',
            featured        INTEGER NOT NULL DEFAULT 0,
            priority        INTEGER NOT NULL DEFAULT 0,
            custom_domain   TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_vis_tier ON visibilities(tier);
        CREATE INDEX IF NOT EXISTS idx_vis_featured ON visibilities(featured);

        CREATE TABLE IF NOT EXISTS crawler_state (
            id            INTEGER PRIMARY KEY CHECK (id = 1),
            last_scanned_daa INTEGER NOT NULL DEFAULT 0
        );
        INSERT OR IGNORE INTO crawler_state (id, last_scanned_daa) VALUES (1, 0);
        ",
    )?;
    Ok(Mutex::new(conn))
}

pub fn insert_covenant(
    db: &Mutex<Connection>,
    tx_id: &str, address: &str, amount_sompi: u64,
    script_hash: &str, script_hex: &str,
    covenant_type: &str, category: &str,
    creator_addr: &str, description: &str,
    block_daa_score: u64,
) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    let amount = amount_sompi as f64 / 100_000_000.0;
    conn.execute(
        "INSERT OR REPLACE INTO covenants (tx_id, address, amount_kaspa, script_hash, script_hex, covenant_type, category, creator_addr, description, verified_tier, is_active, block_daa_score, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'FREE', 1, ?10, unixepoch())",
        params![tx_id, address, amount, script_hash, script_hex, covenant_type, category, creator_addr, description, block_daa_score],
    )?;
    Ok(())
}

#[derive(serde::Serialize, Debug, Clone)]
pub struct DbCovenant {
    pub tx_id: String,
    pub address: String,
    pub amount_kaspa: f64,
    pub amount_sompi: u64,
    pub script_hash: String,
    pub script_hex: String,
    pub covenant_type: String,
    pub category: String,
    pub creator_addr: String,
    pub description: String,
    pub verified_tier: String,
    pub verified_payment_tx: Option<String>,
    pub verified_at: Option<i64>,
    pub custom_ui_enabled: bool,
    pub full_logic_summary: String,
    pub receiving_addresses: String,
    pub is_active: bool,
    pub block_daa_score: u64,
    pub timestamp: i64,
}

fn row_to_covenant(row: &rusqlite::Row) -> rusqlite::Result<DbCovenant> {
    Ok(DbCovenant {
        tx_id: row.get(0)?,
        address: row.get(1)?,
        amount_kaspa: row.get(2)?,
        amount_sompi: (row.get::<_, f64>(2).unwrap_or(0.0) * 100_000_000.0) as u64,
        script_hash: row.get(3)?,
        script_hex: row.get(4)?,
        covenant_type: row.get(5)?,
        category: row.get(6)?,
        creator_addr: row.get(7)?,
        description: row.get(8)?,
        verified_tier: row.get(9)?,
        verified_payment_tx: row.get(10)?,
        verified_at: row.get(11)?,
        custom_ui_enabled: row.get::<_, i32>(12).unwrap_or(0) == 1,
        full_logic_summary: row.get(13)?,
        receiving_addresses: row.get(14)?,
        is_active: row.get(15)?,
        block_daa_score: row.get(16)?,
        timestamp: row.get(17)?,
    })
}

const COVENANT_SELECT: &str =
    "SELECT tx_id, address, amount_kaspa, script_hash, script_hex, covenant_type, category, creator_addr, description, verified_tier, verified_payment_tx, verified_at, custom_ui_enabled, full_logic_summary, receiving_addresses, is_active, block_daa_score, timestamp FROM covenants";

pub fn get_all_covenants(db: &Mutex<Connection>) -> anyhow::Result<Vec<DbCovenant>> {
    let conn = db.lock().unwrap();
    let sql = format!("{} WHERE is_active = 1 ORDER BY timestamp DESC", COVENANT_SELECT);
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |row| row_to_covenant(row))?;
    let mut result = Vec::new();
    for row in rows { result.push(row?); }
    Ok(result)
}

pub fn get_covenant_by_txid(db: &Mutex<Connection>, tx_id: &str) -> anyhow::Result<Option<DbCovenant>> {
    let conn = db.lock().unwrap();
    let sql = format!("{} WHERE tx_id = ?1", COVENANT_SELECT);
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query_map(params![tx_id], |row| row_to_covenant(row))?;
    Ok(rows.next().transpose()?)
}

pub fn get_covenants_by_creator(db: &Mutex<Connection>, creator_addr: &str) -> anyhow::Result<Vec<DbCovenant>> {
    let conn = db.lock().unwrap();
    let sql = format!("{} WHERE creator_addr = ?1 AND is_active = 1 ORDER BY timestamp DESC", COVENANT_SELECT);
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![creator_addr], |row| row_to_covenant(row))?;
    let mut result = Vec::new();
    for row in rows { result.push(row?); }
    Ok(result)
}

pub fn count_covenants(db: &Mutex<Connection>) -> anyhow::Result<i64> {
    let conn = db.lock().unwrap();
    Ok(conn.query_row("SELECT COUNT(*) FROM covenants WHERE is_active = 1", [], |r| r.get(0))?)
}

pub fn count_active_covenants(db: &Mutex<Connection>) -> anyhow::Result<i64> {
    let conn = db.lock().unwrap();
    Ok(conn.query_row("SELECT COUNT(*) FROM covenants WHERE is_active = 1 AND amount_kaspa > 0", [], |r| r.get(0))?)
}

pub fn count_verified_covenants(db: &Mutex<Connection>) -> anyhow::Result<i64> {
    let conn = db.lock().unwrap();
    Ok(conn.query_row("SELECT COUNT(*) FROM covenants WHERE is_active = 1 AND verified_tier != 'FREE'", [], |r| r.get(0))?)
}

// Upgrade a covenant record when payment is confirmed
pub fn upgrade_covenant_record(
    db: &Mutex<Connection>,
    covenant_id: &str,
    verified_tier: &str,
    verified_payment_tx: &str,
    full_logic_summary: &str,
    receiving_addresses: &str,
) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "UPDATE covenants SET verified_tier = ?2, verified_payment_tx = ?3, verified_at = unixepoch(), custom_ui_enabled = 1, full_logic_summary = ?4, receiving_addresses = ?5 WHERE tx_id = ?1",
        params![covenant_id, verified_tier, verified_payment_tx, full_logic_summary, receiving_addresses],
    )?;
    Ok(())
}

// Payment functions
pub fn insert_payment(db: &Mutex<Connection>, tx_id: &str, from_addr: &str, to_addr: &str, amount_sompi: u64, tier: &str, covenant_id: Option<&str>) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    let amount = amount_sompi as f64 / 100_000_000.0;
    conn.execute(
        "INSERT OR REPLACE INTO payments (tx_id, from_address, to_address, amount_sompi, amount_kaspa, tier, status, covenant_id, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, unixepoch())",
        params![tx_id, from_addr, to_addr, amount_sompi, amount, tier, covenant_id],
    )?;
    Ok(())
}

pub fn confirm_payment(db: &Mutex<Connection>, tx_id: &str, confirmations: i64) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute("UPDATE payments SET status = 'confirmed', confirmations = ?2 WHERE tx_id = ?1", params![tx_id, confirmations])?;
    Ok(())
}

pub fn upgrade_account(db: &Mutex<Connection>, address: &str, tier: &str, payment_tx_id: &str) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO accounts (address, tier, payment_tx_id, paid_at, is_active, created_at)
         VALUES (?1, ?2, ?3, unixepoch(), 1, unixepoch())",
        params![address, tier, payment_tx_id],
    )?;
    Ok(())
}

pub fn get_account_tier(db: &Mutex<Connection>, address: &str) -> anyhow::Result<String> {
    let conn = db.lock().unwrap();
    Ok(conn.query_row(
        "SELECT tier FROM accounts WHERE address = ?1 AND is_active = 1",
        params![address],
        |r| r.get(0),
    ).unwrap_or_else(|_| "FREE".to_string()))
}

// Generated UI functions
pub fn save_generated_ui(db: &Mutex<Connection>, covenant_id: &str, owner_address: &str, tier: &str, ui_html: &str, ui_config: &str, slug: &str, featured: bool) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO generated_uis (covenant_id, owner_address, tier, ui_html, ui_config, slug, is_published, featured, ui_generated_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, unixepoch(), unixepoch())",
        params![covenant_id, owner_address, tier, ui_html, ui_config, slug, featured as i32],
    )?;
    Ok(())
}

pub fn get_generated_ui_by_covenant(db: &Mutex<Connection>, covenant_id: &str) -> anyhow::Result<Option<serde_json::Value>> {
    let conn = db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT covenant_id, owner_address, tier, ui_html, ui_config, slug, is_published, featured, ui_generated_at, created_at FROM generated_uis WHERE covenant_id = ?1 ORDER BY ui_generated_at DESC LIMIT 1"
    )?;
    let mut rows = stmt.query_map(params![covenant_id], |row| {
        Ok(serde_json::json!({
            "covenant_id": row.get::<_, String>(0)?,
            "owner_address": row.get::<_, String>(1)?,
            "tier": row.get::<_, String>(2)?,
            "ui_html": row.get::<_, String>(3)?,
            "ui_config": row.get::<_, String>(4)?,
            "slug": row.get::<_, String>(5)?,
            "is_published": row.get::<_, i32>(6)? == 1,
            "featured": row.get::<_, i32>(7)? == 1,
            "ui_generated_at": row.get::<_, i64>(8)?,
            "created_at": row.get::<_, i64>(9)?,
        }))
    })?;
    Ok(rows.next().transpose()?)
}

pub fn get_generated_uis(db: &Mutex<Connection>, owner_address: Option<&str>) -> anyhow::Result<Vec<serde_json::Value>> {
    let conn = db.lock().unwrap();
    let sql = if let Some(addr) = owner_address {
        format!("SELECT covenant_id, owner_address, tier, ui_html, ui_config, slug, is_published, featured, ui_generated_at, created_at FROM generated_uis WHERE owner_address = '{}' ORDER BY featured DESC, ui_generated_at DESC", addr)
    } else {
        "SELECT covenant_id, owner_address, tier, ui_html, ui_config, slug, is_published, featured, ui_generated_at, created_at FROM generated_uis WHERE is_published = 1 ORDER BY featured DESC, ui_generated_at DESC".to_string()
    };
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "covenant_id": row.get::<_, String>(0)?,
            "owner_address": row.get::<_, String>(1)?,
            "tier": row.get::<_, String>(2)?,
            "ui_html": row.get::<_, String>(3)?,
            "ui_config": row.get::<_, String>(4)?,
            "slug": row.get::<_, String>(5)?,
            "is_published": row.get::<_, i32>(6)? == 1,
            "featured": row.get::<_, i32>(7)? == 1,
            "ui_generated_at": row.get::<_, i64>(8)?,
            "created_at": row.get::<_, i64>(9)?,
        }))
    })?;
    let mut result = Vec::new();
    for row in rows { result.push(row?); }
    Ok(result)
}

// Visibility functions
pub fn set_visibility(db: &Mutex<Connection>, covenant_id: &str, tier: &str, featured: bool, priority: i32, custom_domain: Option<&str>) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO visibilities (covenant_id, tier, featured, priority, custom_domain) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![covenant_id, tier, featured as i32, priority, custom_domain],
    )?;
    Ok(())
}

pub fn get_visibilities(db: &Mutex<Connection>) -> anyhow::Result<Vec<serde_json::Value>> {
    let conn = db.lock().unwrap();
    let mut stmt = conn.prepare("SELECT covenant_id, tier, featured, priority, custom_domain FROM visibilities ORDER BY priority DESC, featured DESC")?;
    let rows = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "covenant_id": row.get::<_, String>(0)?,
            "tier": row.get::<_, String>(1)?,
            "featured": row.get::<_, i32>(2)? == 1,
            "priority": row.get::<_, i32>(3)?,
            "custom_domain": row.get::<_, Option<String>>(4)?,
        }))
    })?;
    let mut result = Vec::new();
    for row in rows { result.push(row?); }
    Ok(result)
}

// ─── Crawler State ─────────────────────────────────────────────

pub fn get_last_scanned_daa(db: &Mutex<Connection>) -> anyhow::Result<u64> {
    let conn = db.lock().unwrap();
    let daa: i64 = conn
        .query_row(
            "SELECT last_scanned_daa FROM crawler_state WHERE id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(daa as u64)
}

pub fn update_last_scanned_daa(db: &Mutex<Connection>, daa: u64) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "UPDATE crawler_state SET last_scanned_daa = ?1 WHERE id = 1",
        rusqlite::params![daa as i64],
    )?;
    Ok(())
}
