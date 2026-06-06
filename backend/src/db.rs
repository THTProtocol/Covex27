use rusqlite::{params, Connection};
use std::sync::Mutex;

pub fn open_db(path: &str) -> anyhow::Result<Mutex<Connection>> {
    let conn = Connection::open(path)?;
    // WAL mode allows concurrent reads during writes — critical with 6 background tasks
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")?;
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
            max_deployments INTEGER NOT NULL DEFAULT 1,
            deployments_used INTEGER NOT NULL DEFAULT 0,
            is_active       INTEGER NOT NULL DEFAULT 1,
            created_at      INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_accounts_tier ON accounts(tier);

        -- Migration: add deployment columns if missing (existing DBs from before auth)
        CREATE TABLE IF NOT EXISTS auth_tokens (
            token           TEXT PRIMARY KEY,
            address         TEXT NOT NULL,
            network         TEXT NOT NULL,
            tier            TEXT NOT NULL,
            used_for_deploy INTEGER NOT NULL DEFAULT 0,
            created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
            expires_at      INTEGER NOT NULL DEFAULT (unixepoch() + 3600)
        );
        CREATE INDEX IF NOT EXISTS idx_auth_tokens_addr_net ON auth_tokens(address, network);
        CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);

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

        CREATE TABLE IF NOT EXISTS custom_ui_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            covenant_id TEXT NOT NULL UNIQUE,
            owner_address TEXT NOT NULL,
            tier TEXT NOT NULL,
            config_json TEXT NOT NULL DEFAULT '{}',
            config_version INTEGER NOT NULL DEFAULT 1,
            is_published INTEGER NOT NULL DEFAULT 1,
            updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
            created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_custom_ui_covenant ON custom_ui_configs(covenant_id);
        CREATE INDEX IF NOT EXISTS idx_custom_ui_owner ON custom_ui_configs(owner_address);

        CREATE TABLE IF NOT EXISTS crawler_state (
            id            INTEGER NOT NULL DEFAULT 1,
            network       TEXT NOT NULL DEFAULT 'testnet-12',
            last_scanned_daa INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (id, network)
        );

        CREATE TABLE IF NOT EXISTS skill_games (
            covenant_id     TEXT PRIMARY KEY,
            game_type       TEXT NOT NULL DEFAULT 'chess',
            pot_amount_kas  REAL NOT NULL DEFAULT 0,
            player1         TEXT NOT NULL DEFAULT '',
            player2         TEXT NOT NULL DEFAULT '',
            moves           TEXT NOT NULL DEFAULT '[]',
            current_turn    TEXT NOT NULL DEFAULT 'white',
            winner          TEXT,
            status          TEXT NOT NULL DEFAULT 'waiting',
            created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_skill_games_status ON skill_games(status);
        ",
    )?;

    // ── Migration: add 'network' column to covenants if missing ──
    // Run this after the table is created/verified so existing databases get the column.
    let has_network: bool = conn
        .prepare("SELECT network FROM covenants LIMIT 1")
        .is_ok();
    if !has_network {
        conn.execute_batch(
            "ALTER TABLE covenants ADD COLUMN network TEXT NOT NULL DEFAULT 'testnet-12';
             CREATE INDEX IF NOT EXISTS idx_covenants_network ON covenants(network);"
        )?;
    }

    // ── Migration: add 'network' column to payments if missing ──
    let has_payments_network: bool = conn
        .prepare("SELECT network FROM payments LIMIT 1")
        .is_ok();
    if !has_payments_network {
        conn.execute_batch(
            "ALTER TABLE payments ADD COLUMN network TEXT NOT NULL DEFAULT 'testnet-12';
             CREATE INDEX IF NOT EXISTS idx_payments_network ON payments(network);"
        )?;
    }

    // ── Migration: add 'network' column to accounts if missing ──
    let has_accounts_network: bool = conn
        .prepare("SELECT network FROM accounts LIMIT 1")
        .is_ok();
    if !has_accounts_network {
        conn.execute_batch(
            "ALTER TABLE accounts ADD COLUMN network TEXT NOT NULL DEFAULT 'testnet-12';
             CREATE INDEX IF NOT EXISTS idx_accounts_network ON accounts(network);"
        )?;
    }

    // ── Migration: add deployment columns to accounts if missing ──
    let has_max_deploy: bool = conn
        .prepare("SELECT max_deployments FROM accounts LIMIT 1")
        .is_ok();
    if !has_max_deploy {
        conn.execute_batch(
            "ALTER TABLE accounts ADD COLUMN max_deployments INTEGER NOT NULL DEFAULT 1;
             ALTER TABLE accounts ADD COLUMN deployments_used INTEGER NOT NULL DEFAULT 0;"
        )?;
        // Set deployment counts based on existing tiers
        conn.execute("UPDATE accounts SET max_deployments = 3 WHERE tier = 'MAX'", [])?;
        conn.execute("UPDATE accounts SET max_deployments = 2 WHERE tier = 'PRO'", [])?;
    }

    // ── Migration: upgrade crawler_state to network-aware (per-network scan progress) ──
    // Try selecting network column; if it fails, table needs migration
    let has_crawler_network: bool = conn
        .execute("SELECT network FROM crawler_state LIMIT 0", [])
        .is_ok();
    if !has_crawler_network {
        // Drop old single-row table and recreate with composite PK + per-network rows
        // Losing scan positions is fine — crawlers restart from config start_daa
        conn.execute_batch("DROP TABLE IF EXISTS crawler_state;")?;
        conn.execute_batch(
            "CREATE TABLE crawler_state (
                id            INTEGER NOT NULL DEFAULT 1,
                network       TEXT NOT NULL DEFAULT 'testnet-12',
                last_scanned_daa INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (id, network)
            );
            INSERT OR IGNORE INTO crawler_state (id, network, last_scanned_daa) VALUES (1, 'testnet-12', 0);
            INSERT OR IGNORE INTO crawler_state (id, network, last_scanned_daa) VALUES (1, 'testnet-10', 0);
            INSERT OR IGNORE INTO crawler_state (id, network, last_scanned_daa) VALUES (1, 'mainnet', 0);"
        )?;
    }

    Ok(Mutex::new(conn))
}

pub fn insert_covenant(
    db: &Mutex<Connection>,
    tx_id: &str,
    address: &str,
    amount_sompi: u64,
    script_hash: &str,
    script_hex: &str,
    covenant_type: &str,
    category: &str,
    creator_addr: &str,
    description: &str,
    block_daa_score: u64,
    verified_tier: &str,
    full_logic_summary: &str,
    receiving_addresses: &str,
    network: &str,
) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    let amount = amount_sompi as f64 / 100_000_000.0;
    conn.execute(
        "INSERT OR REPLACE INTO covenants (tx_id, address, amount_kaspa, script_hash, script_hex, covenant_type, category, creator_addr, description, verified_tier, is_active, block_daa_score, timestamp, full_logic_summary, receiving_addresses, network)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11, unixepoch(), ?12, ?13, ?14)",
        params![tx_id, address, amount, script_hash, script_hex, covenant_type, category, creator_addr, description, verified_tier, block_daa_score, full_logic_summary, receiving_addresses, network],
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
    pub network: String,
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
        network: row.get(18).unwrap_or_else(|_| "testnet-12".to_string()),
    })
}

const COVENANT_SELECT: &str =
    "SELECT tx_id, address, amount_kaspa, script_hash, script_hex, covenant_type, category, creator_addr, description, verified_tier, verified_payment_tx, verified_at, custom_ui_enabled, full_logic_summary, receiving_addresses, is_active, block_daa_score, timestamp, network FROM covenants";

pub fn get_all_covenants(
    db: &Mutex<Connection>,
    network: Option<&str>,
) -> anyhow::Result<Vec<DbCovenant>> {
    let conn = db.lock().unwrap();
    let sql = if let Some(net) = network {
        format!(
            "{} WHERE is_active = 1 AND network = ?1 ORDER BY CASE verified_tier WHEN 'MAX' THEN 100 WHEN 'PRO' THEN 50 WHEN 'BUILDER' THEN 10 ELSE 0 END DESC, amount_kaspa DESC, timestamp DESC",
            COVENANT_SELECT
        )
    } else {
        format!(
            "{} WHERE is_active = 1 ORDER BY CASE verified_tier WHEN 'MAX' THEN 100 WHEN 'PRO' THEN 50 WHEN 'BUILDER' THEN 10 ELSE 0 END DESC, amount_kaspa DESC, timestamp DESC",
            COVENANT_SELECT
        )
    };
    let mut stmt = conn.prepare(&sql)?;
    let mut result = Vec::new();
    if let Some(net) = network {
        let rows = stmt.query_map(params![net], |row| row_to_covenant(row))?;
        for r in rows {
            result.push(r?);
        }
    } else {
        let rows = stmt.query_map([], |row| row_to_covenant(row))?;
        for r in rows {
            result.push(r?);
        }
    }
    Ok(result)
}

/// Resolve ui_config for a tier: glow + expanded for PRO/MAX, basic for others
pub fn ui_config_for_tier(tier: &str) -> serde_json::Value {
    match tier {
        "MAX" => {
            serde_json::json!({"glow": true, "expanded": true, "priority": 100, "label": "MAX"})
        }
        "PRO" => {
            serde_json::json!({"glow": true, "expanded": false, "priority": 50, "label": "PRO"})
        }
        "BUILDER" => {
            serde_json::json!({"glow": false, "expanded": false, "priority": 10, "label": "BUILDER"})
        }
        _ => serde_json::json!({"glow": false, "expanded": false, "priority": 0, "label": "FREE"}),
    }
}

pub fn get_covenant_by_txid(
    db: &Mutex<Connection>,
    tx_id: &str,
) -> anyhow::Result<Option<DbCovenant>> {
    let conn = db.lock().unwrap();
    let sql = format!("{} WHERE tx_id = ?1", COVENANT_SELECT);
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query_map(params![tx_id], |row| row_to_covenant(row))?;
    Ok(rows.next().transpose()?)
}

pub fn get_covenants_by_creator(
    db: &Mutex<Connection>,
    creator_addr: &str,
    network: Option<&str>,
) -> anyhow::Result<Vec<DbCovenant>> {
    let conn = db.lock().unwrap();
    let sql = if let Some(net) = network {
        format!(
            "{} WHERE creator_addr = ?1 AND is_active = 1 AND network = ?2 ORDER BY timestamp DESC",
            COVENANT_SELECT
        )
    } else {
        format!(
            "{} WHERE creator_addr = ?1 AND is_active = 1 ORDER BY timestamp DESC",
            COVENANT_SELECT
        )
    };
    let mut stmt = conn.prepare(&sql)?;
    let mut result = Vec::new();
    if let Some(net) = network {
        let rows = stmt.query_map(params![creator_addr, net], |row| {
            row_to_covenant(row)
        })?;
        for r in rows {
            result.push(r?);
        }
    } else {
        let rows = stmt.query_map(params![creator_addr], |row| row_to_covenant(row))?;
        for r in rows {
            result.push(r?);
        }
    }
    Ok(result)
}

pub fn count_covenants(db: &Mutex<Connection>) -> anyhow::Result<i64> {
    let conn = db.lock().unwrap();
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM covenants WHERE is_active = 1",
        [],
        |r| r.get(0),
    )?)
}

pub fn count_active_covenants(db: &Mutex<Connection>) -> anyhow::Result<i64> {
    let conn = db.lock().unwrap();
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM covenants WHERE is_active = 1 AND amount_kaspa > 0",
        [],
        |r| r.get(0),
    )?)
}

pub fn count_verified_covenants(db: &Mutex<Connection>) -> anyhow::Result<i64> {
    let conn = db.lock().unwrap();
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM covenants WHERE is_active = 1 AND verified_tier != 'FREE'",
        [],
        |r| r.get(0),
    )?)
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
pub fn insert_payment(
    db: &Mutex<Connection>,
    tx_id: &str,
    from_addr: &str,
    to_addr: &str,
    amount_sompi: u64,
    tier: &str,
    covenant_id: Option<&str>,
    network: &str,
) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    let amount = amount_sompi as f64 / 100_000_000.0;
    conn.execute(
        "INSERT OR REPLACE INTO payments (tx_id, from_address, to_address, amount_sompi, amount_kaspa, tier, status, covenant_id, network, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?8, unixepoch())",
        params![tx_id, from_addr, to_addr, amount_sompi, amount, tier, covenant_id, network],
    )?;
    Ok(())
}

pub fn confirm_payment(
    db: &Mutex<Connection>,
    tx_id: &str,
    confirmations: i64,
) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "UPDATE payments SET status = 'confirmed', confirmations = ?2 WHERE tx_id = ?1",
        params![tx_id, confirmations],
    )?;
    Ok(())
}

/// Returns the highest tier this address has ever successfully paid for (by amount),
/// filtered to a specific network so TN10 payments don't leak into TN12 and vice versa.
pub fn get_highest_paid_tier_for_address(
    db: &Mutex<Connection>,
    address: &str,
    network: &str,
) -> anyhow::Result<Option<String>> {
    let conn = db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT tier FROM payments 
         WHERE from_address = ?1 AND status = 'confirmed' AND network = ?2
         ORDER BY amount_sompi DESC LIMIT 1",
    )?;
    let mut rows = stmt.query_map(params![address, network], |row| row.get::<_, String>(0))?;
    Ok(rows.next().transpose()?)
}

pub fn upgrade_account(
    db: &Mutex<Connection>,
    address: &str,
    tier: &str,
    payment_tx_id: &str,
    network: &str,
) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    // Set deployment quotas based on tier
    let max_deploy: i32 = match tier {
        "MAX" => 3,
        "PRO" => 2,
        _ => 1, // BUILDER or default
    };
    conn.execute(
        "INSERT INTO accounts (address, tier, payment_tx_id, network, max_deployments, deployments_used, paid_at, is_active, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, unixepoch(), 1, unixepoch())
         ON CONFLICT(address) DO UPDATE SET tier = excluded.tier, payment_tx_id = excluded.payment_tx_id,
         max_deployments = excluded.max_deployments, paid_at = unixepoch(), is_active = 1",
        params![address, tier, payment_tx_id, network, max_deploy],
    )?;
    Ok(())
}

pub fn get_account_tier(db: &Mutex<Connection>, address: &str, network: &str) -> anyhow::Result<String> {
    let conn = db.lock().unwrap();
    Ok(conn
        .query_row(
            "SELECT tier FROM accounts WHERE address = ?1 AND network = ?2 AND is_active = 1",
            params![address, network],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "FREE".to_string()))
}

// Generated UI functions
pub fn save_generated_ui(
    db: &Mutex<Connection>,
    covenant_id: &str,
    owner_address: &str,
    tier: &str,
    ui_html: &str,
    ui_config: &str,
    slug: &str,
    featured: bool,
) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO generated_uis (covenant_id, owner_address, tier, ui_html, ui_config, slug, is_published, featured, ui_generated_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, unixepoch(), unixepoch())",
        params![covenant_id, owner_address, tier, ui_html, ui_config, slug, featured as i32],
    )?;
    Ok(())
}

/// Save trust-verification UI config (verified_source_url, developer_notes, interaction_schema, custom_category).
/// Caller MUST validate that wallet_addr == on-chain creator_addr before calling.
pub fn save_ui_trust_config(
    db: &Mutex<Connection>,
    covenant_id: &str,
    owner_address: &str,
    verified_source_url: &str,
    developer_notes: &str,
    interaction_schema: &str,
    custom_category: &str,
) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    let ui_config = serde_json::json!({
        "verified_source_url": verified_source_url,
        "developer_notes": developer_notes,
        "interaction_schema": interaction_schema,
        "custom_category": custom_category,
        "trust_configured_at": chrono::Utc::now().timestamp(),
    });
    conn.execute(
        "INSERT OR REPLACE INTO generated_uis (covenant_id, owner_address, tier, ui_html, ui_config, slug, is_published, featured, ui_generated_at, created_at)
         VALUES (?1, ?2, 'TRUSTED', '', ?3, ?4, 1, 0, unixepoch(), unixepoch())",
        params![covenant_id, owner_address, ui_config.to_string(), format!("trust-{}", covenant_id)],
    )?;
    // If custom_category is set, update the covenants table too
    if !custom_category.is_empty() {
        conn.execute(
            "UPDATE covenants SET category = ?1 WHERE tx_id = ?2",
            params![custom_category, covenant_id],
        )?;
    }
    Ok(())
}

/// Retrieve the trust-verification config for a covenant.
pub fn get_ui_trust_config(
    db: &Mutex<Connection>,
    covenant_id: &str,
) -> anyhow::Result<Option<serde_json::Value>> {
    let conn = db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT ui_config FROM generated_uis WHERE covenant_id = ?1 AND tier = 'TRUSTED' ORDER BY ui_generated_at DESC LIMIT 1"
    )?;
    let mut rows = stmt.query_map(params![covenant_id], |row| {
        let cfg_str: String = row.get(0)?;
        Ok(serde_json::from_str(&cfg_str).unwrap_or(serde_json::json!({})))
    })?;
    Ok(rows.next().transpose()?)
}

pub fn get_generated_ui_by_covenant(
    db: &Mutex<Connection>,
    covenant_id: &str,
) -> anyhow::Result<Option<serde_json::Value>> {
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

/// Batch lookup: returns a HashMap mapping covenant_id → (ui_html, ui_config) for all published UIs.
/// Used to enrich the covenants list endpoint with custom UI data.
pub fn get_all_generated_uis_map(
    db: &Mutex<Connection>,
) -> anyhow::Result<std::collections::HashMap<String, (String, String)>> {
    let conn = db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT covenant_id, ui_html, ui_config FROM generated_uis WHERE is_published = 1 ORDER BY ui_generated_at DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    let mut map = std::collections::HashMap::new();
    for row in rows {
        let (cid, html, cfg) = row?;
        // Only keep first (most recent) per covenant_id
        map.entry(cid).or_insert((html, cfg));
    }
    Ok(map)
}

pub fn get_generated_uis(
    db: &Mutex<Connection>,
    owner: Option<&str>,
) -> anyhow::Result<Vec<serde_json::Value>> {
    let conn = db.lock().unwrap();
    let sql = if let Some(owner_addr) = owner {
        format!(
            "SELECT covenant_id, owner_address, tier, ui_html, ui_config, slug, is_published, featured, ui_generated_at, created_at FROM generated_uis WHERE owner_address = ?1 ORDER BY ui_generated_at DESC"
        )
    } else {
        "SELECT covenant_id, owner_address, tier, ui_html, ui_config, slug, is_published, featured, ui_generated_at, created_at FROM generated_uis ORDER BY ui_generated_at DESC".to_string()
    };
    let mut stmt = conn.prepare(&sql)?;
    let mut result = Vec::new();
    if let Some(o) = owner {
        let rows = stmt.query_map(params![o], |row| {
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
        for r in rows {
            result.push(r?);
        }
    } else {
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
    }
    Ok(result)
}

pub fn set_visibility(
    db: &Mutex<Connection>,
    covenant_id: &str,
    tier: &str,
    featured: bool,
    priority: i32,
    custom_domain: Option<&str>,
) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO visibilities (covenant_id, tier, featured, priority, custom_domain)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![covenant_id, tier, featured as i32, priority, custom_domain],
    )?;
    Ok(())
}

pub fn get_last_scanned_daa(db: &Mutex<Connection>, network: &str) -> anyhow::Result<u64> {
    let conn = db.lock().unwrap();
    Ok(conn
        .query_row(
            "SELECT last_scanned_daa FROM crawler_state WHERE id = 1 AND network = ?1",
            params![network],
            |r| r.get(0),
        )
        .unwrap_or(0))
}

pub fn update_last_scanned_daa(db: &Mutex<Connection>, daa: u64, network: &str) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "UPDATE crawler_state SET last_scanned_daa = ?1 WHERE id = 1 AND network = ?2",
        params![daa, network],
    )?;
    Ok(())
}

// ── Auth Token Management ─────────────────────────────────────

use sha2::{Sha256, Digest};

/// Create a one-time auth token for a paying address on a specific network.
/// Token is SHA256(address + network + timestamp + random salt).
pub fn create_auth_token(
    db: &Mutex<Connection>,
    address: &str,
    network: &str,
    tier: &str,
) -> anyhow::Result<String> {
    let conn = db.lock().unwrap();
    let salt = rand::random::<u64>();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let mut hasher = Sha256::new();
    hasher.update(address.as_bytes());
    hasher.update(network.as_bytes());
    hasher.update(&now.to_le_bytes());
    hasher.update(&salt.to_le_bytes());
    let token = hex::encode(hasher.finalize());

    conn.execute(
        "INSERT INTO auth_tokens (token, address, network, tier, created_at, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5 + 3600)",
        params![token, address, network, tier, now],
    )?;
    // Clean expired tokens
    conn.execute("DELETE FROM auth_tokens WHERE expires_at < ?1", params![now])?;
    Ok(token)
}

/// Validate an auth token and return (address, tier, network) if valid + unconsumed.
pub fn validate_auth_token(
    db: &Mutex<Connection>,
    token: &str,
    address: &str,
    network: &str,
) -> anyhow::Result<Option<(String, String)>> {
    let conn = db.lock().unwrap();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let mut stmt = conn.prepare(
        "SELECT address, tier, network FROM auth_tokens
         WHERE token = ?1 AND address = ?2 AND network = ?3
         AND used_for_deploy = 0 AND expires_at > ?4",
    )?;
    let mut rows = stmt.query_map(params![token, address, network, now], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
        ))
    })?;
    Ok(rows.next().transpose()?.map(|(addr, tier)| (addr, tier)))
}

/// Consume an auth token (mark as used for deployment). Returns tokens_remaining.
pub fn consume_auth_token(
    db: &Mutex<Connection>,
    token: &str,
    address: &str,
    network: &str,
) -> anyhow::Result<i32> {
    let conn = db.lock().unwrap();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    // Mark token used
    let updated = conn.execute(
        "UPDATE auth_tokens SET used_for_deploy = 1
         WHERE token = ?1 AND address = ?2 AND network = ?3
         AND used_for_deploy = 0 AND expires_at > ?4",
        params![token, address, network, now],
    )?;

    if updated == 0 {
        return Ok(0); // No valid token consumed
    }

    // Increment deployment counter
    conn.execute(
        "UPDATE accounts SET deployments_used = deployments_used + 1
         WHERE address = ?1 AND network = ?2",
        params![address, network],
    )?;

    // Return remaining deployments
    let remaining: i32 = conn.query_row(
        "SELECT max_deployments - deployments_used FROM accounts
         WHERE address = ?1 AND network = ?2",
        params![address, network],
        |r| r.get(0),
    ).unwrap_or(0);

    Ok(remaining.max(0))
}

/// Check if address can deploy on this network.
pub fn can_deploy(
    db: &Mutex<Connection>,
    address: &str,
    network: &str,
) -> anyhow::Result<bool> {
    let conn = db.lock().unwrap();
    let remaining: i32 = conn.query_row(
        "SELECT COALESCE(max_deployments, 0) - COALESCE(deployments_used, 0)
         FROM accounts WHERE address = ?1 AND network = ?2 AND is_active = 1",
        params![address, network],
        |r| r.get(0),
    ).unwrap_or(0);
    Ok(remaining > 0)
}
