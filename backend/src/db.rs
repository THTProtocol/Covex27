use rusqlite::{params, Connection};
use r2d2_sqlite::SqliteConnectionManager;

/// A connection checked out of the pool. Derefs to rusqlite::Connection
/// (Deref + DerefMut), so every existing `conn.execute / prepare / query_row /
/// transaction` call works on it unchanged.
pub type DbConn = r2d2::PooledConnection<SqliteConnectionManager>;

/// Cheaply-cloneable handle to the shared SQLite connection pool. This replaces
/// the old `Arc<Mutex<Connection>>`. The `lock()` method name is kept so the
/// ~109 `let conn = db.lock().unwrap();` call sites compile UNCHANGED: instead of
/// taking a mutex guard, `lock()` now checks a connection out of the pool. The
/// returned `DbConn` derefs to `Connection`, so the bodies are identical.
#[derive(Clone)]
pub struct Db {
    pool: r2d2::Pool<SqliteConnectionManager>,
}

impl Db {
    /// Check a connection out of the pool. Named `lock` purely so the migration
    /// is a type-only change (`db.lock().unwrap()` is unchanged at every call site).
    pub fn lock(&self) -> Result<DbConn, r2d2::Error> {
        self.pool.get()
    }
}

/// Run a synchronous SQLite read on a blocking thread so it never stalls a Tokio
/// worker. The closure receives a borrowed `&Connection` checked out of the pool.
/// Use this for the hottest GET read handlers. Do NOT use it for the money-path
/// writes or any multi-statement transaction that must stay on one connection
/// for atomicity — those keep calling `db.lock()` directly.
pub async fn blocking<F, T>(db: &Db, f: F) -> T
where
    F: FnOnce(&rusqlite::Connection) -> T + Send + 'static,
    T: Send + 'static,
{
    let db = db.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().unwrap();
        f(&conn)
    })
    .await
    .unwrap()
}

pub fn open_db(path: &str) -> anyhow::Result<Db> {
    // Per-connection setup: WAL lets readers proceed during a write (critical with
    // ~9 background workers + request handlers sharing one file), busy_timeout makes
    // a writer wait for the lock instead of erroring with SQLITE_BUSY, and
    // foreign_keys enforces referential integrity. Runs on EVERY pooled connection.
    let manager = SqliteConnectionManager::file(path).with_init(|c| {
        c.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;",
        )
    });
    let pool = r2d2::Pool::builder()
        // Raised from 8 -> 16 for more concurrent reads. WAL lets readers proceed during
        // a write, and the per-connection busy_timeout (above) absorbs lock contention, so
        // a deeper pool serves the hot read handlers (/covenants, /balance) without
        // serializing them behind 8 slots.
        .max_size(16)
        .build(manager)
        .map_err(|e| anyhow::anyhow!("failed to build SQLite pool: {e}"))?;

    // Run the schema migrations once at startup on a single pooled connection.
    let conn = pool.get()?;
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
            timestamp           INTEGER NOT NULL DEFAULT (unixepoch()),
            tier_rank           INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_covenants_address ON covenants(address);
        CREATE INDEX IF NOT EXISTS idx_covenants_type ON covenants(covenant_type);
        CREATE INDEX IF NOT EXISTS idx_covenants_category ON covenants(category);
        CREATE INDEX IF NOT EXISTS idx_covenants_timestamp ON covenants(timestamp);
        CREATE INDEX IF NOT EXISTS idx_covenants_active ON covenants(is_active);
        CREATE INDEX IF NOT EXISTS idx_covenants_verified ON covenants(verified_tier);
        CREATE INDEX IF NOT EXISTS idx_covenants_creator ON covenants(creator_addr);
        -- NOTE: the (network, script_hex) dedup index is intentionally NOT created here.
        -- On a fresh DB the covenants table above has no `network` column yet — it is added
        -- by the migration further down. Creating the index inside this batch would fail with
        -- a no-such-column error and the process would never bind. It is created right
        -- after the network-column migration instead (see below).

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

        CREATE TABLE IF NOT EXISTS events (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type    TEXT NOT NULL,
            covenant_id   TEXT NOT NULL DEFAULT '',
            network       TEXT NOT NULL DEFAULT 'testnet-12',
            amount_kaspa  REAL NOT NULL DEFAULT 0,
            detail        TEXT NOT NULL DEFAULT '',
            timestamp     INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_events_time ON events(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_events_network ON events(network);
        CREATE INDEX IF NOT EXISTS idx_events_covenant ON events(covenant_id);

        CREATE TABLE IF NOT EXISTS mixer_leaves (
            covenant_id   TEXT NOT NULL,
            leaf_index    INTEGER NOT NULL,
            leaf_hash     TEXT NOT NULL,
            created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
            PRIMARY KEY (covenant_id, leaf_index)
        );
        CREATE INDEX IF NOT EXISTS idx_mixer_leaves_covenant ON mixer_leaves(covenant_id);

        CREATE TABLE IF NOT EXISTS mixer_roots (
            covenant_id   TEXT PRIMARY KEY,
            merkle_root   TEXT NOT NULL DEFAULT '0',
            leaf_count    INTEGER NOT NULL DEFAULT 0,
            updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS mixer_nullifiers (
            nullifier     TEXT PRIMARY KEY,
            covenant_id   TEXT NOT NULL,
            spent_at      INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_mixer_nullifiers_covenant ON mixer_nullifiers(covenant_id);

        -- Real multiplayer poker (oracle-dealt, commitment-verifiable; poker.rs)
        CREATE TABLE IF NOT EXISTS poker_matches (
            covenant_id  TEXT PRIMARY KEY,
            chips1       INTEGER NOT NULL,
            chips2       INTEGER NOT NULL,
            hand_no      INTEGER NOT NULL DEFAULT 1,
            button       INTEGER NOT NULL DEFAULT 0,
            status       TEXT NOT NULL DEFAULT 'active',
            created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE TABLE IF NOT EXISTS poker_hands (
            covenant_id  TEXT NOT NULL,
            hand_no      INTEGER NOT NULL,
            seed         TEXT NOT NULL,
            commitment   TEXT NOT NULL,
            phase        TEXT NOT NULL DEFAULT 'preflop',
            actions      TEXT NOT NULL DEFAULT '[]',
            result       TEXT,
            chips1_start INTEGER NOT NULL,
            chips2_start INTEGER NOT NULL,
            button       INTEGER NOT NULL DEFAULT 0,
            created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
            PRIMARY KEY (covenant_id, hand_no)
        );
        CREATE TABLE IF NOT EXISTS poker_sessions (
            token        TEXT PRIMARY KEY,
            covenant_id  TEXT NOT NULL,
            address      TEXT NOT NULL,
            expires      INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_poker_sessions_cov ON poker_sessions(covenant_id);
        CREATE TABLE IF NOT EXISTS poker_nonces (
            nonce        TEXT PRIMARY KEY,
            covenant_id  TEXT NOT NULL,
            address      TEXT NOT NULL,
            expires      INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS p2sh_covenants (
            tx_id             TEXT PRIMARY KEY,
            network           TEXT NOT NULL,
            p2sh_address      TEXT NOT NULL,
            redeem_script_hex TEXT NOT NULL,
            redeem_kind       TEXT NOT NULL,
            amount_sompi      INTEGER NOT NULL,
            outpoint_index    INTEGER NOT NULL,
            owner_addr        TEXT NOT NULL,
            spent_tx_id       TEXT,
            created_at        INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_p2sh_address ON p2sh_covenants(p2sh_address);
        -- Non-custodial oracle co-sign payout sessions, persisted so a backend restart between
        -- PREPARE and SUBMIT cannot orphan a winner who already received the prepare response.
        -- Every field is what submit needs to reconstruct the EXACT same PendingOraclePayout the
        -- oracle co-signed at prepare, so the stored BIP340 oracle signature still matches the
        -- reconstructed sighash. unsigned_tx_json + entry_json are serde_json of the kaspa
        -- consensus Transaction / UtxoEntry (both derive Serialize/Deserialize and round-trip to
        -- value-identical structs, hence an identical sighash). Byte fields are stored as hex.
        -- Single-use: the row is deleted on consume (success or refusal); a TTL cleanup deletes
        -- rows older than the 10-minute session lifetime.
        CREATE TABLE IF NOT EXISTS oracle_payout_sessions (
            session_id           TEXT PRIMARY KEY,
            network              TEXT NOT NULL,
            unsigned_tx_json     TEXT NOT NULL,
            entry_json           TEXT NOT NULL,
            redeem_hex           TEXT NOT NULL,
            deploy_tx_id         TEXT NOT NULL,
            kind_base            TEXT NOT NULL,
            oracle_sig_hex       TEXT NOT NULL,
            member_pubkeys_json  TEXT NOT NULL,
            winner_is_a          INTEGER NOT NULL,
            winner_xonly_hex     TEXT NOT NULL,
            committed_txid       TEXT NOT NULL,
            committed_index      INTEGER NOT NULL,
            committed_amount     INTEGER NOT NULL,
            committed_p2sh_hex   TEXT NOT NULL,
            p2sh_address         TEXT NOT NULL,
            created_at           INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_oracle_payout_created ON oracle_payout_sessions(created_at);
        CREATE TABLE IF NOT EXISTS bundle_markets (
            market_id        TEXT PRIMARY KEY,
            network          TEXT NOT NULL,
            question         TEXT NOT NULL,
            outcome_a        TEXT NOT NULL,
            outcome_b        TEXT NOT NULL,
            h_a              TEXT NOT NULL,
            h_b              TEXT NOT NULL,
            secret_a         TEXT NOT NULL,
            secret_b         TEXT NOT NULL,
            kickoff_utc      TEXT,
            source_url       TEXT,
            revealed_outcome INTEGER,
            revealed_secret  TEXT,
            created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
            resolved_at      INTEGER,
            fee_bps          INTEGER NOT NULL DEFAULT 3000,
            rebate_bps       INTEGER NOT NULL DEFAULT 5000,
            creator_address  TEXT
        );
        CREATE TABLE IF NOT EXISTS market_orders (
            order_id      TEXT PRIMARY KEY,
            market_id     TEXT NOT NULL,
            side          INTEGER NOT NULL,
            stake_sompi   INTEGER NOT NULL,
            bettor_addr   TEXT NOT NULL,
            bettor_pubkey TEXT NOT NULL,
            status        TEXT NOT NULL DEFAULT 'open',
            bundle_tx     TEXT,
            created_at    INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_orders_market ON market_orders(market_id, side, status);
        CREATE TABLE IF NOT EXISTS market_bundles (
            bundle_tx   TEXT PRIMARY KEY,
            market_id   TEXT NOT NULL,
            a_addr      TEXT NOT NULL,
            b_addr      TEXT NOT NULL,
            legs_json   TEXT NOT NULL,
            created_at  INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_bundles_market ON market_bundles(market_id);
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
    // Fast dedup lookup: a covenant is its (network, script) pair; re-deposits to the same
    // P2SH share the script and must not be counted as new covenants. Created here — AFTER the
    // network column is guaranteed to exist (just added above, or already present on an
    // already-migrated DB) — so a fresh-DB cold start does not fail with "no such column".
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_covenants_net_scripthex ON covenants(network, script_hex);"
    )?;

    // ── Migration: add 'block_hash' + 'reorged' columns for finality/reorg handling ──
    // block_hash: the selected-chain block that the crawler discovered this covenant in.
    // Lets the reorg reconciler match a covenant against the node's removed_chain_block_hashes
    // delta. reorged: set when a covenant's funding tx left the selected chain before finality
    // (and was not re-accepted). Hidden from the explorer via is_active=0; the flag drives the
    // detail-page banner and is cleared automatically on re-discovery. Never hard-deleted.
    let has_block_hash: bool = conn
        .prepare("SELECT block_hash FROM covenants LIMIT 1")
        .is_ok();
    if !has_block_hash {
        conn.execute_batch(
            "ALTER TABLE covenants ADD COLUMN block_hash TEXT NOT NULL DEFAULT '';
             ALTER TABLE covenants ADD COLUMN reorged INTEGER NOT NULL DEFAULT 0;
             CREATE INDEX IF NOT EXISTS idx_covenants_block_hash ON covenants(block_hash);",
        )?;
    }

    // ── Migration: add 'tier_rank' column + composite index for the list sort ──
    // The covenant-list ORDER BY used to be a CASE expression on verified_tier, which
    // SQLite cannot satisfy from an index, forcing a full scan + filesort of every
    // is_active row on every /covenants request. tier_rank stores the SAME integer the
    // CASE produced (MAX=100, PRO=50, BUILDER=10, else 0) as a real column so the sort
    // becomes ORDER BY tier_rank DESC, amount_kaspa DESC, timestamp DESC and is served
    // directly by idx_covenants_rank (no filesort). Backfill existing rows once; new and
    // re-discovered rows keep it correct via insert_covenant. Identical ordering to before.
    let has_tier_rank: bool = conn
        .prepare("SELECT tier_rank FROM covenants LIMIT 1")
        .is_ok();
    if !has_tier_rank {
        conn.execute_batch(
            "ALTER TABLE covenants ADD COLUMN tier_rank INTEGER NOT NULL DEFAULT 0;
             UPDATE covenants SET tier_rank = CASE verified_tier WHEN 'MAX' THEN 100 WHEN 'PRO' THEN 50 WHEN 'BUILDER' THEN 10 ELSE 0 END;",
        )?;
    }
    // Created unconditionally (idempotent). Composite index ordered exactly like the sort
    // so SQLite walks it in reverse for ORDER BY ... DESC + LIMIT without a filesort.
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_covenants_rank ON covenants(is_active, tier_rank DESC, amount_kaspa DESC, timestamp DESC);"
    )?;

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

    // ── Migration: customizable economics columns on bundle_markets (idempotent) ──
    for ddl in [
        "ALTER TABLE bundle_markets ADD COLUMN fee_bps INTEGER NOT NULL DEFAULT 3000",
        "ALTER TABLE bundle_markets ADD COLUMN rebate_bps INTEGER NOT NULL DEFAULT 5000",
        "ALTER TABLE bundle_markets ADD COLUMN creator_address TEXT",
    ] {
        let _ = conn.execute(ddl, []); // duplicate-column errors expected on already-migrated DBs
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

    // Migration: production skill_games tables created before the current
    // schema lack newer columns; CREATE TABLE IF NOT EXISTS never alters.
    for ddl in [
        "ALTER TABLE skill_games ADD COLUMN game_type TEXT NOT NULL DEFAULT 'chess'",
        "ALTER TABLE skill_games ADD COLUMN pot_amount_kas REAL NOT NULL DEFAULT 0",
        "ALTER TABLE skill_games ADD COLUMN player1 TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE skill_games ADD COLUMN player2 TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE skill_games ADD COLUMN moves TEXT NOT NULL DEFAULT '[]'",
        "ALTER TABLE skill_games ADD COLUMN current_turn TEXT NOT NULL DEFAULT 'white'",
        "ALTER TABLE skill_games ADD COLUMN winner TEXT",
        "ALTER TABLE skill_games ADD COLUMN status TEXT NOT NULL DEFAULT 'waiting'",
        "ALTER TABLE skill_games ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE skill_games ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0",
    ] {
        let _ = conn.execute(ddl, []); // duplicate-column errors are expected
    }

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

    // ── Migration: game-pot covenant columns (oracle_escrow integration) ──
    // The pot covenant a match locks into, and the payout tx that released it to the
    // winner. Unconditional + idempotent (duplicate-column errors are expected).
    for ddl in [
        "ALTER TABLE skill_games ADD COLUMN pot_tx TEXT",
        "ALTER TABLE skill_games ADD COLUMN pot_payout_tx TEXT",
    ] {
        let _ = conn.execute(ddl, []);
    }

    // ── Migration: server-authoritative clocks + end reason ──
    // p1_time_ms/p2_time_ms are each player's remaining time budget (written ONLY by
    // the server). turn_started_at (unix seconds) is when the current turn began, so
    // elapsed = now - turn_started_at is deducted from the mover. end_reason records
    // HOW a finished match ended (board | resign | timeout | abandon | draw) so the
    // pot gate can trust server-decided timeouts while staying strict on board wins.
    for ddl in [
        "ALTER TABLE skill_games ADD COLUMN p1_time_ms INTEGER NOT NULL DEFAULT 300000",
        "ALTER TABLE skill_games ADD COLUMN p2_time_ms INTEGER NOT NULL DEFAULT 300000",
        "ALTER TABLE skill_games ADD COLUMN turn_started_at INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE skill_games ADD COLUMN end_reason TEXT",
    ] {
        let _ = conn.execute(ddl, []);
    }

    // ── Migration: per-seat move tokens (P0.4 move authentication) ──
    // p1_token/p2_token are secrets issued ONLY to each seated client at
    // create/join. Every move/resign must carry the mover's token, so the
    // opponent (who knows only the public player addresses) can no longer forge
    // the victim's moves to steer the engine-replayed board to their own win.
    // Legacy rows created before this migration have NULL tokens and fall back
    // to turn-only checks (testnet demos; new games are always tokenised).
    for ddl in [
        "ALTER TABLE skill_games ADD COLUMN p1_token TEXT",
        "ALTER TABLE skill_games ADD COLUMN p2_token TEXT",
    ] {
        let _ = conn.execute(ddl, []);
    }

    drop(conn);
    Ok(Db { pool })
}

pub fn insert_covenant(
    db: &Db,
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
    let already: bool = conn
        .query_row(
            "SELECT 1 FROM covenants WHERE tx_id = ?1",
            params![tx_id],
            |_| Ok(true),
        )
        .unwrap_or(false);
    // DEDUP BY (network, script_hex): a popular P2SH address funded by thousands of deposit
    // txs would otherwise get one covenant row PER deposit and inflate the count by its
    // deposit count (e.g. one TN10 address counted 224k times). When this is a NEW tx_id but
    // a covenant with this exact non-empty script already exists on this network, skip the
    // insert - the address is already indexed.
    //
    // SAFETY: this guard ONLY collapses crawler-discovered FREE/EXPLORER re-deposits. A PAID
    // covenant (BUILDER/PRO/MAX) is ALWAYS inserted, never skipped - paid deploys can legally
    // share a script with a crawled row (e.g. decorative self-pay deploys reuse the creator's
    // address), and an over-eager dedup once wrongly deleted real paid covenants. Never again.
    let is_paid = matches!(verified_tier, "BUILDER" | "PRO" | "MAX");
    if !already && !is_paid && script_hex.len() > 10 {
        let dup: bool = conn
            .query_row(
                "SELECT 1 FROM covenants WHERE network = ?1 AND script_hex = ?2 LIMIT 1",
                params![network, script_hex],
                |_| Ok(true),
            )
            .unwrap_or(false);
        if dup {
            return Ok(());
        }
    }
    // tier_rank mirrors verified_tier (see tier_rank_for) so the list sort can use an index.
    let tier_rank = tier_rank_for(verified_tier);
    conn.execute(
        "INSERT INTO covenants (tx_id, address, amount_kaspa, script_hash, script_hex, covenant_type, category, creator_addr, description, verified_tier, is_active, block_daa_score, timestamp, full_logic_summary, receiving_addresses, network, tier_rank)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11, unixepoch(), ?12, ?13, ?14, ?15)
         ON CONFLICT(tx_id) DO UPDATE SET
           address = excluded.address,
           amount_kaspa = excluded.amount_kaspa,
           script_hash = excluded.script_hash,
           script_hex = excluded.script_hex,
           is_active = 1,
           block_daa_score = excluded.block_daa_score,
           network = excluded.network,
           -- Recompute from the PRESERVED verified_tier (not excluded) so tier_rank stays
           -- consistent with the tier this row keeps. Re-discovery never downgrades a paid
           -- covenant, so its rank must not drop to the incoming FREE crawl value either.
           tier_rank = CASE verified_tier WHEN 'MAX' THEN 100 WHEN 'PRO' THEN 50 WHEN 'BUILDER' THEN 10 ELSE 0 END
           -- verified_tier, verified_payment_tx, descriptions and custom metadata
           -- are intentionally preserved: re-discovery must never downgrade a paid
           -- covenant or erase creator edits.",
        params![tx_id, address, amount, script_hash, script_hex, covenant_type, category, creator_addr, description, verified_tier, block_daa_score, full_logic_summary, receiving_addresses, network, tier_rank],
    )?;
    if !already {
        record_event(
            &conn,
            "covenant_discovered",
            tx_id,
            network,
            amount,
            covenant_type,
        );
    }
    Ok(())
}

/// Record the selected-chain block a covenant was discovered in, and clear any prior reorg
/// flag (re-discovery proves it is back on the chain). Called by the crawler right after a
/// successful insert. No-op if the row does not exist (e.g. a deduped re-deposit).
pub fn mark_covenant_seen_in_block(db: &Db, tx_id: &str, block_hash: &str) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "UPDATE covenants SET block_hash = ?2, reorged = 0, is_active = 1 WHERE tx_id = ?1",
        params![tx_id, block_hash],
    )?;
    Ok(())
}

/// Flag covenants whose discovery block left the selected chain (a reorg) and whose funding
/// tx was NOT re-accepted by the new chain blocks, as long as they are still pre-finality.
/// Flagged rows are hidden from the explorer (is_active = 0) but never deleted; the `reorged`
/// flag drives an honest detail-page banner and is cleared automatically on re-discovery.
/// `reaccepted_txids` are the base tx ids accepted by the added chain blocks this delta.
/// Returns the number of covenants newly flagged.
pub fn flag_reorged_covenants(
    db: &Db,
    network: &str,
    removed_block_hashes: &[String],
    reaccepted_txids: &std::collections::HashSet<String>,
    virtual_daa: u64,
    finality_depth: u64,
) -> anyhow::Result<usize> {
    if removed_block_hashes.is_empty() {
        return Ok(0);
    }
    let conn = db.lock().unwrap();
    // Pull only the (few) candidates whose discovery block is in the removed set, on this
    // network, still flagged active and not already reorged.
    let placeholders = removed_block_hashes
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT tx_id, block_daa_score, amount_kaspa, covenant_type FROM covenants \
         WHERE network = ? AND reorged = 0 AND is_active = 1 AND block_hash IN ({})",
        placeholders
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut bind: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(removed_block_hashes.len() + 1);
    bind.push(&network);
    for h in removed_block_hashes {
        bind.push(h);
    }
    let candidates: Vec<(String, u64, f64, String)> = stmt
        .query_map(bind.as_slice(), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, u64>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();

    let mut flagged = 0usize;
    for (tx_id, block_daa, amount, ctype) in candidates {
        // Never touch a finalized covenant (defensive: finalized blocks cannot be removed).
        if virtual_daa.saturating_sub(block_daa) >= finality_depth {
            continue;
        }
        // The DB tx_id is "<txid>:<index>"; re-acceptance is keyed by the base txid.
        let base_txid = tx_id.split(':').next().unwrap_or(&tx_id);
        if reaccepted_txids.contains(base_txid) {
            // Re-included in the new selected chain; still valid, do not flag.
            continue;
        }
        conn.execute(
            "UPDATE covenants SET reorged = 1, is_active = 0 WHERE tx_id = ?1",
            params![tx_id],
        )?;
        record_event(&conn, "covenant_reorged", &tx_id, network, amount, &ctype);
        flagged += 1;
    }
    Ok(flagged)
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
    /// Selected-chain block the crawler discovered this covenant in (for reorg matching).
    #[serde(default)]
    pub block_hash: String,
    /// True if the funding tx left the selected chain before finality and was not re-accepted.
    #[serde(default)]
    pub reorged: bool,
    /// Derived (not stored): confirmation depth against the live node tip. None when the
    /// tip is unknown or the covenant has no on-chain DAA yet (block_daa_score == 0).
    #[serde(default)]
    pub confirmations: Option<u64>,
    /// Derived honesty label: "final" (>= finality depth, consensus-irreversible),
    /// "confirming" (seen on-chain, not yet final), "pending" (no on-chain DAA yet),
    /// or "unknown" (node tip unavailable). Never claims more certainty than we have.
    #[serde(default)]
    pub finality: String,
    /// Derived: approximate seconds until finality while "confirming" (None otherwise).
    #[serde(default)]
    pub finality_eta_secs: Option<u64>,
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
        block_hash: row.get::<_, String>(19).unwrap_or_default(),
        reorged: row.get::<_, i64>(20).unwrap_or(0) == 1,
        // Derived fields: defaulted here, filled by annotate_finality() against the live tip.
        confirmations: None,
        finality: String::new(),
        finality_eta_secs: None,
    })
}

const COVENANT_SELECT: &str =
    "SELECT tx_id, address, amount_kaspa, script_hash, script_hex, covenant_type, category, creator_addr, description, verified_tier, verified_payment_tx, verified_at, custom_ui_enabled, full_logic_summary, receiving_addresses, is_active, block_daa_score, timestamp, network, block_hash, reorged FROM covenants";

/// Mainnet finality depth (DAA). Past this depth a chain block cannot be reorged, so the
/// covenant is consensus-final. Same conservative bound applied on testnet (only makes the
/// "confirming" window longer there, never shorter). Mirrors kaspa params finality_depth.
pub const FINALITY_DEPTH_DAA: u64 = 86_400;
/// Post-Crescendo blocks-per-second, for the "~N min to finality" ETA only.
const BLOCKS_PER_SECOND: u64 = 10;

/// Fill the derived confirmation/finality fields against the live node tip. Caches the tip
/// per network so a large list does one node_status lookup per network, not one per row.
/// Honest by construction: unknown tip -> "unknown"; no on-chain DAA -> "pending"; never
/// claims "final" without real depth >= FINALITY_DEPTH_DAA.
pub fn annotate_finality(covs: &mut [DbCovenant]) {
    use std::collections::HashMap;
    let mut tips: HashMap<String, Option<u64>> = HashMap::new();
    for c in covs.iter_mut() {
        let tip = *tips
            .entry(c.network.clone())
            .or_insert_with(|| crate::node_status::tip_daa(&c.network));
        if c.block_daa_score == 0 {
            // Inserted by a self-deploy path before the crawler confirmed it on-chain.
            c.finality = "pending".to_string();
            c.confirmations = None;
            continue;
        }
        match tip {
            None => {
                c.finality = "unknown".to_string();
                c.confirmations = None;
            }
            Some(t) => {
                let conf = t.saturating_sub(c.block_daa_score);
                c.confirmations = Some(conf);
                if conf >= FINALITY_DEPTH_DAA {
                    c.finality = "final".to_string();
                    c.finality_eta_secs = None;
                } else {
                    c.finality = "confirming".to_string();
                    c.finality_eta_secs =
                        Some((FINALITY_DEPTH_DAA - conf) / BLOCKS_PER_SECOND.max(1));
                }
            }
        }
    }
}

pub fn get_all_covenants(
    db: &Db,
    network: Option<&str>,
) -> anyhow::Result<Vec<DbCovenant>> {
    let conn = db.lock().unwrap();
    let sql = if let Some(_net) = network {
        format!(
            "{} WHERE is_active = 1 AND network = ?1 ORDER BY tier_rank DESC, amount_kaspa DESC, timestamp DESC",
            COVENANT_SELECT
        )
    } else {
        format!(
            "{} WHERE is_active = 1 ORDER BY tier_rank DESC, amount_kaspa DESC, timestamp DESC",
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
    annotate_finality(&mut result);
    Ok(result)
}

/// Append an activity event (discovery, tier upgrade, resolution, deploy).
/// The caller passes a connection already checked out of the pool (via db.lock()).
pub fn record_event(
    conn: &Connection,
    event_type: &str,
    covenant_id: &str,
    network: &str,
    amount_kaspa: f64,
    detail: &str,
) {
    let _ = conn.execute(
        "INSERT INTO events (event_type, covenant_id, network, amount_kaspa, detail) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![event_type, covenant_id, network, amount_kaspa, detail],
    );
    crate::live::publish(
        event_type,
        serde_json::json!({
            "event_type": event_type,
            "covenant_id": covenant_id,
            "network": network,
            "amount_kaspa": amount_kaspa,
            "detail": detail,
            "timestamp": chrono::Utc::now().timestamp(),
        }),
    );
    // Bound the table: keep the most recent 5000 events
    let _ = conn.execute(
        "DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT 5000)",
        [],
    );
}

/// Record an event only once per (event_type, covenant_id). Used for
/// idempotent loops like the payment guardian that re-scan history.
pub fn record_event_once(
    conn: &Connection,
    event_type: &str,
    covenant_id: &str,
    network: &str,
    amount_kaspa: f64,
    detail: &str,
) {
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM events WHERE event_type = ?1 AND covenant_id = ?2 LIMIT 1",
            params![event_type, covenant_id],
            |_| Ok(true),
        )
        .unwrap_or(false);
    if !exists {
        record_event(conn, event_type, covenant_id, network, amount_kaspa, detail);
    }
}

#[derive(serde::Serialize)]
pub struct EventRow {
    pub id: i64,
    pub event_type: String,
    pub covenant_id: String,
    pub network: String,
    pub amount_kaspa: f64,
    pub detail: String,
    pub timestamp: i64,
}

pub fn get_events(
    db: &Db,
    network: Option<&str>,
    limit: i64,
) -> anyhow::Result<Vec<EventRow>> {
    let conn = db.lock().unwrap();
    get_events_conn(&conn, network, limit)
}

/// Connection-borrowing core of `get_events`, for use inside `db::blocking`.
pub fn get_events_conn(
    conn: &Connection,
    network: Option<&str>,
    limit: i64,
) -> anyhow::Result<Vec<EventRow>> {
    let limit = limit.clamp(1, 200);
    let mut out = Vec::new();
    let map = |row: &rusqlite::Row| -> rusqlite::Result<EventRow> {
        Ok(EventRow {
            id: row.get(0)?,
            event_type: row.get(1)?,
            covenant_id: row.get(2)?,
            network: row.get(3)?,
            amount_kaspa: row.get(4)?,
            detail: row.get(5)?,
            timestamp: row.get(6)?,
        })
    };
    if let Some(net) = network {
        let mut stmt = conn.prepare("SELECT id, event_type, covenant_id, network, amount_kaspa, detail, timestamp FROM events WHERE network = ?1 ORDER BY id DESC LIMIT ?2")?;
        for r in stmt.query_map(params![net, limit], map)? { out.push(r?); }
    } else {
        let mut stmt = conn.prepare("SELECT id, event_type, covenant_id, network, amount_kaspa, detail, timestamp FROM events ORDER BY id DESC LIMIT ?1")?;
        for r in stmt.query_map(params![limit], map)? { out.push(r?); }
    }
    Ok(out)
}

/// Paginated, filterable covenant query. Returns (page, total_matching).
/// q matches name/type, description, category, tx_id and address (prefix or substring).
pub fn query_covenants(
    db: &Db,
    network: Option<&str>,
    creator: Option<&str>,
    q: Option<&str>,
    category: Option<&str>,
    limit: i64,
    offset: i64,
    genuine_only: bool,
) -> anyhow::Result<(Vec<DbCovenant>, i64)> {
    let conn = db.lock().unwrap();
    query_covenants_conn(&conn, network, creator, q, category, limit, offset, genuine_only)
}

/// Connection-borrowing core of `query_covenants`, for use inside `db::blocking`.
#[allow(clippy::too_many_arguments)]
pub fn query_covenants_conn(
    conn: &Connection,
    network: Option<&str>,
    creator: Option<&str>,
    q: Option<&str>,
    category: Option<&str>,
    limit: i64,
    offset: i64,
    genuine_only: bool,
) -> anyhow::Result<(Vec<DbCovenant>, i64)> {
    let mut where_clauses: Vec<String> = vec!["is_active = 1".to_string()];
    let mut args: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    // Curated default: show covenants Covex can say something REAL about — a paid tier, a genuine
    // creator/builder description, OR anything discovered in the last 24h so the explorer always
    // shows live on-chain activity (new covenants) instead of looking frozen. Older bare crawled
    // P2SH commitments (opaque until spend, empty description) sit behind the "Show all" toggle.
    if genuine_only {
        where_clauses.push(
            "(verified_tier IN ('BUILDER','PRO','MAX') OR (TRIM(description) <> '' AND description <> 'unknown') OR timestamp > (unixepoch() - 86400))"
                .to_string(),
        );
    }
    if let Some(net) = network {
        args.push(Box::new(net.to_string()));
        where_clauses.push(format!("network = ?{}", args.len()));
    }
    if let Some(c) = creator {
        args.push(Box::new(c.to_string()));
        where_clauses.push(format!("creator_addr = ?{}", args.len()));
    }
    if let Some(cat) = category {
        args.push(Box::new(cat.to_string()));
        where_clauses.push(format!("category = ?{}", args.len()));
    }
    if let Some(term) = q {
        // Pipe-separated terms act as OR alternatives (used by category filters):
        // q=chess|fide matches covenants containing either term in any text field.
        let mut alts: Vec<String> = Vec::new();
        for t in term.split('|').map(str::trim).filter(|t| !t.is_empty()).take(8) {
            // Escape the LIKE wildcards (_ and %) so a literal term like "binary_oracle_select"
            // matches by underscore instead of treating _ as "any char" (or being stripped).
            let like = format!("%{}%", t.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
            args.push(Box::new(like));
            let i = args.len();
            alts.push(format!(
                "covenant_type LIKE ?{i} ESCAPE '\\' OR description LIKE ?{i} ESCAPE '\\' OR category LIKE ?{i} ESCAPE '\\' OR tx_id LIKE ?{i} ESCAPE '\\' OR address LIKE ?{i} ESCAPE '\\'"
            ));
        }
        if !alts.is_empty() {
            where_clauses.push(format!("({})", alts.join(" OR ")));
        }
    }
    let where_sql = where_clauses.join(" AND ");
    let count_sql = format!("SELECT COUNT(*) FROM covenants WHERE {}", where_sql);
    let params_ref: Vec<&dyn rusqlite::types::ToSql> = args.iter().map(|b| b.as_ref()).collect();
    let total: i64 = conn.query_row(&count_sql, params_ref.as_slice(), |r| r.get(0))?;

    let sql = format!(
        "{} WHERE {} ORDER BY tier_rank DESC, amount_kaspa DESC, timestamp DESC LIMIT {} OFFSET {}",
        COVENANT_SELECT, where_sql, limit.clamp(1, 200), offset.max(0)
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_ref.as_slice(), |row| row_to_covenant(row))?;
    let mut result = Vec::new();
    for r in rows {
        result.push(r?);
    }
    annotate_finality(&mut result);
    Ok((result, total))
}

/// Network-scoped aggregates for the explorer header: (total, paid, tvl_kas).
pub fn covenant_stats(
    db: &Db,
    network: Option<&str>,
) -> anyhow::Result<(i64, i64, f64)> {
    let conn = db.lock().unwrap();
    covenant_stats_conn(&conn, network)
}

/// Connection-borrowing core of `covenant_stats`, for use inside `db::blocking`.
pub fn covenant_stats_conn(
    conn: &Connection,
    network: Option<&str>,
) -> anyhow::Result<(i64, i64, f64)> {
    let sql_base = "SELECT COUNT(*), COALESCE(SUM(CASE WHEN verified_tier IN ('BUILDER','PRO','MAX') THEN 1 ELSE 0 END), 0), COALESCE(SUM(amount_kaspa), 0) FROM covenants WHERE is_active = 1";
    let row = if let Some(net) = network {
        conn.query_row(
            &format!("{} AND network = ?1", sql_base),
            params![net],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, f64>(2)?)),
        )?
    } else {
        conn.query_row(sql_base, [], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, f64>(2)?))
        })?
    };
    Ok(row)
}

/// Aggregate platform stats for the public /stats page. All figures are
/// computed live from the covenants, payments, and events tables. The events
/// timeline reflects only the rolling window the events table retains (capped
/// at the most recent 5000 events), so it is labelled as recent activity, not
/// full history. Network is optional; None aggregates across all networks.
pub fn platform_stats(
    db: &Db,
    network: Option<&str>,
) -> anyhow::Result<serde_json::Value> {
    use serde_json::json;
    let conn = db.lock().unwrap();

    // helper: build the optional "AND network = ?" clause + bind value
    let net_clause = if network.is_some() { " AND network = ?1" } else { "" };

    // ── Per-network summary (always all networks, ignores the filter) ──
    let mut by_network = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT network, COUNT(*), \
             COALESCE(SUM(CASE WHEN verified_tier IN ('BUILDER','PRO','MAX') THEN 1 ELSE 0 END), 0), \
             COALESCE(SUM(amount_kaspa), 0) \
             FROM covenants WHERE is_active = 1 GROUP BY network ORDER BY COUNT(*) DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(json!({
                "network": r.get::<_, String>(0)?,
                "covenants": r.get::<_, i64>(1)?,
                "paid": r.get::<_, i64>(2)?,
                "tvl_kas": (r.get::<_, f64>(3)? * 100.0).round() / 100.0,
            }))
        })?;
        for r in rows {
            by_network.push(r?);
        }
    }

    // ── Tier breakdown (network-filtered) ──
    let by_tier: Vec<serde_json::Value> = {
        let sql = format!(
            "SELECT verified_tier, COUNT(*), COALESCE(SUM(amount_kaspa), 0) \
             FROM covenants WHERE is_active = 1{} GROUP BY verified_tier",
            net_clause
        );
        let mut stmt = conn.prepare(&sql)?;
        let map = |r: &rusqlite::Row| -> rusqlite::Result<serde_json::Value> {
            Ok(json!({
                "tier": r.get::<_, String>(0)?,
                "count": r.get::<_, i64>(1)?,
                "tvl_kas": (r.get::<_, f64>(2)? * 100.0).round() / 100.0,
            }))
        };
        if let Some(net) = network {
            stmt.query_map(params![net], map)?.collect::<Result<Vec<_>, _>>()?
        } else {
            stmt.query_map([], map)?.collect::<Result<Vec<_>, _>>()?
        }
    };

    // ── Category breakdown (top 12, network-filtered) ──
    let by_category: Vec<serde_json::Value> = {
        let sql = format!(
            "SELECT CASE WHEN category IS NULL OR category = '' THEN 'uncategorized' ELSE category END AS cat, \
             COUNT(*), COALESCE(SUM(amount_kaspa), 0) \
             FROM covenants WHERE is_active = 1{} GROUP BY cat ORDER BY COUNT(*) DESC LIMIT 12",
            net_clause
        );
        let mut stmt = conn.prepare(&sql)?;
        let map = |r: &rusqlite::Row| -> rusqlite::Result<serde_json::Value> {
            Ok(json!({
                "category": r.get::<_, String>(0)?,
                "count": r.get::<_, i64>(1)?,
                "tvl_kas": (r.get::<_, f64>(2)? * 100.0).round() / 100.0,
            }))
        };
        if let Some(net) = network {
            stmt.query_map(params![net], map)?.collect::<Result<Vec<_>, _>>()?
        } else {
            stmt.query_map([], map)?.collect::<Result<Vec<_>, _>>()?
        }
    };

    // ── Event type totals (over the retained event window, network-filtered) ──
    let mut event_totals = serde_json::Map::new();
    {
        let sql = format!(
            "SELECT event_type, COUNT(*) FROM events WHERE 1=1{} GROUP BY event_type",
            net_clause
        );
        let mut stmt = conn.prepare(&sql)?;
        let map = |r: &rusqlite::Row| -> rusqlite::Result<(String, i64)> {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        };
        let rows = if let Some(net) = network {
            stmt.query_map(params![net], map)?.collect::<Result<Vec<_>, _>>()?
        } else {
            stmt.query_map([], map)?.collect::<Result<Vec<_>, _>>()?
        };
        for (k, v) in rows {
            event_totals.insert(k, json!(v));
        }
    }

    // ── Daily activity timeline over the retained event window ──
    // One row per (day, event_type); the frontend pivots into stacked series.
    let timeline: Vec<serde_json::Value> = {
        let sql = format!(
            "SELECT date(timestamp, 'unixepoch') AS day, event_type, COUNT(*), COALESCE(SUM(amount_kaspa), 0) \
             FROM events WHERE 1=1{} GROUP BY day, event_type ORDER BY day",
            net_clause
        );
        let mut stmt = conn.prepare(&sql)?;
        let map = |r: &rusqlite::Row| -> rusqlite::Result<serde_json::Value> {
            Ok(json!({
                "day": r.get::<_, String>(0)?,
                "event_type": r.get::<_, String>(1)?,
                "count": r.get::<_, i64>(2)?,
                "amount_kaspa": (r.get::<_, f64>(3)? * 100.0).round() / 100.0,
            }))
        };
        if let Some(net) = network {
            stmt.query_map(params![net], map)?.collect::<Result<Vec<_>, _>>()?
        } else {
            stmt.query_map([], map)?.collect::<Result<Vec<_>, _>>()?
        }
    };

    // ── Confirmed payments summary (network-filtered) ──
    let (payment_count, payment_total): (i64, f64) = {
        let sql = format!(
            "SELECT COUNT(*), COALESCE(SUM(amount_kaspa), 0) FROM payments \
             WHERE status = 'confirmed'{}",
            net_clause
        );
        if let Some(net) = network {
            conn.query_row(&sql, params![net], |r| Ok((r.get(0)?, r.get(1)?)))?
        } else {
            conn.query_row(&sql, [], |r| Ok((r.get(0)?, r.get(1)?)))?
        }
    };

    // ── Filtered totals (respect the network filter) ──
    let sql_totals = format!(
        "SELECT COUNT(*), \
         COALESCE(SUM(CASE WHEN verified_tier IN ('BUILDER','PRO','MAX') THEN 1 ELSE 0 END), 0), \
         COALESCE(SUM(amount_kaspa), 0), \
         COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0) \
         FROM covenants WHERE 1=1{}",
        net_clause
    );
    let (total, paid, tvl, active): (i64, i64, f64, i64) = if let Some(net) = network {
        conn.query_row(&sql_totals, params![net], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
        })?
    } else {
        conn.query_row(&sql_totals, [], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
        })?
    };

    Ok(json!({
        "network": network.unwrap_or("all"),
        "summary": {
            "total_covenants": total,
            "active_covenants": active,
            "paid_covenants": paid,
            "tvl_kas": (tvl * 100.0).round() / 100.0,
            "confirmed_payments": payment_count,
            "treasury_inflow_kas": (payment_total * 100.0).round() / 100.0,
        },
        "by_network": by_network,
        "by_tier": by_tier,
        "by_category": by_category,
        "event_totals": event_totals,
        "timeline": timeline,
        "timeline_note": "Activity reflects the most recent 5000 indexed events, not full history.",
    }))
}

/// Custom UI lookup for a single covenant (html, config, source_tier) without
/// loading the full map. `source_tier` is the `tier` column of the row that
/// supplied the html: "TERMINAL" marks a genuine creator-published UI (saved via
/// the protected terminal-config endpoint), whereas "FREE"/"EXPLORER"/"PRO"/... mark
/// an auto-generated blob. Callers use it to reserve the iframe for real creator UIs.
pub fn get_generated_ui_for(
    db: &Db,
    covenant_id: &str,
) -> anyhow::Result<Option<(String, String, String)>> {
    let conn = db.lock().unwrap();
    // Exclude the TRUSTED trust-config rows (written by save_ui_trust_config with an EMPTY
    // ui_html): they are config-only and read separately by get_ui_trust_config. Without
    // this, a newer trust row wins the ORDER BY and BLANKS the published page for visitors.
    let mut stmt = conn.prepare(
        "SELECT ui_html, ui_config, tier FROM generated_uis WHERE covenant_id = ?1 AND NOT (tier = 'TRUSTED' AND ui_html = '') ORDER BY ui_generated_at DESC LIMIT 1",
    )?;
    let mut rows = stmt.query_map(params![covenant_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    Ok(rows.next().transpose()?)
}

/// Set of covenant_ids that have a custom UI (cheap badge lookup for list pages).
pub fn get_custom_ui_id_set(
    db: &Db,
) -> anyhow::Result<std::collections::HashSet<String>> {
    let conn = db.lock().unwrap();
    get_custom_ui_id_set_conn(&conn)
}

/// Connection-borrowing core of `get_custom_ui_id_set`, for use inside `db::blocking`.
pub fn get_custom_ui_id_set_conn(
    conn: &Connection,
) -> anyhow::Result<std::collections::HashSet<String>> {
    let mut stmt = conn.prepare("SELECT DISTINCT covenant_id FROM generated_uis")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    let mut set = std::collections::HashSet::new();
    for r in rows {
        set.insert(r?);
    }
    Ok(set)
}

/// Time-to-live for the custom-UI id-set cache. This set drives only a cosmetic
/// "has custom UI" badge in the explorer list, and it changes slowly (a publish is
/// rare relative to list reads), so a few seconds of staleness is harmless. It saves
/// a full `SELECT DISTINCT covenant_id FROM generated_uis` scan on every /covenants
/// request under load.
const CUSTOM_UI_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(15);

// `fetched_at` is None until the first successful DB load, so the very first read
// always refreshes (no fragile Instant-underflow seeding needed).
#[allow(clippy::type_complexity)]
static CUSTOM_UI_CACHE: std::sync::OnceLock<
    std::sync::Mutex<(Option<std::time::Instant>, std::collections::HashSet<String>)>,
> = std::sync::OnceLock::new();

/// Cached variant of `get_custom_ui_id_set_conn`. Returns a clone of the cached set
/// when it was loaded within CUSTOM_UI_CACHE_TTL, otherwise refreshes from the DB once
/// and serves subsequent callers from memory. On a DB error during refresh, falls back
/// to the (possibly stale) cached value rather than failing the request; before the
/// first successful load this is an empty set. Honest: it is a badge hint, never a
/// money-path gate.
pub fn get_custom_ui_id_set_cached_conn(
    conn: &Connection,
) -> std::collections::HashSet<String> {
    let now = std::time::Instant::now();
    let cell = CUSTOM_UI_CACHE
        .get_or_init(|| std::sync::Mutex::new((None, std::collections::HashSet::new())));
    let mut guard = cell.lock().unwrap_or_else(|p| p.into_inner());
    let fresh = matches!(guard.0, Some(at) if now.duration_since(at) < CUSTOM_UI_CACHE_TTL);
    if fresh {
        return guard.1.clone();
    }
    match get_custom_ui_id_set_conn(conn) {
        Ok(set) => {
            guard.0 = Some(now);
            guard.1 = set;
            guard.1.clone()
        }
        // Keep serving the last good set on a transient DB error; retry next call.
        Err(_) => guard.1.clone(),
    }
}

/// Sort weight for a verified tier. The SINGLE source of truth for the `tier_rank`
/// column: the migration backfill, `insert_covenant`, and the list ORDER BY all agree
/// on these exact values (MAX=100, PRO=50, BUILDER=10, else 0), which are identical to
/// the old `CASE verified_tier ...` expression so the returned ordering is unchanged.
pub fn tier_rank_for(verified_tier: &str) -> i64 {
    match verified_tier {
        "MAX" => 100,
        "PRO" => 50,
        "BUILDER" => 10,
        _ => 0,
    }
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
    db: &Db,
    tx_id: &str,
) -> anyhow::Result<Option<DbCovenant>> {
    let conn = db.lock().unwrap();
    let sql = format!("{} WHERE tx_id = ?1", COVENANT_SELECT);
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query_map(params![tx_id], |row| row_to_covenant(row))?;
    let mut one: Option<DbCovenant> = rows.next().transpose()?;
    if let Some(c) = one.as_mut() {
        annotate_finality(std::slice::from_mut(c));
    }
    Ok(one)
}

pub fn get_covenants_by_creator(
    db: &Db,
    creator_addr: &str,
    network: Option<&str>,
) -> anyhow::Result<Vec<DbCovenant>> {
    let conn = db.lock().unwrap();
    let sql = if let Some(_net) = network {
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
    annotate_finality(&mut result);
    Ok(result)
}

pub fn count_covenants(db: &Db) -> anyhow::Result<i64> {
    let conn = db.lock().unwrap();
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM covenants WHERE is_active = 1",
        [],
        |r| r.get(0),
    )?)
}

pub fn count_active_covenants(db: &Db) -> anyhow::Result<i64> {
    let conn = db.lock().unwrap();
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM covenants WHERE is_active = 1 AND amount_kaspa > 0",
        [],
        |r| r.get(0),
    )?)
}

pub fn count_verified_covenants(db: &Db) -> anyhow::Result<i64> {
    let conn = db.lock().unwrap();
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM covenants WHERE is_active = 1 AND verified_tier != 'FREE'",
        [],
        |r| r.get(0),
    )?)
}

// Upgrade a covenant record when payment is confirmed
pub fn upgrade_covenant_record(
    db: &Db,
    covenant_id: &str,
    verified_tier: &str,
    verified_payment_tx: &str,
    full_logic_summary: &str,
    receiving_addresses: &str,
) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        // Keep tier_rank in lockstep with verified_tier (?2) so the indexed list sort
        // reflects the upgraded tier. Derived from the same value being written; pure
        // ordering metadata, no fund flow.
        "UPDATE covenants SET verified_tier = ?2, tier_rank = CASE ?2 WHEN 'MAX' THEN 100 WHEN 'PRO' THEN 50 WHEN 'BUILDER' THEN 10 ELSE 0 END, verified_payment_tx = ?3, verified_at = unixepoch(), custom_ui_enabled = 1, full_logic_summary = ?4, receiving_addresses = ?5 WHERE tx_id = ?1 AND (verified_payment_tx IS NULL OR verified_payment_tx != ?3)",
        params![covenant_id, verified_tier, verified_payment_tx, full_logic_summary, receiving_addresses],
    )?;
    Ok(())
}

// Payment functions
pub fn insert_payment(
    db: &Db,
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
        "INSERT OR IGNORE INTO payments (tx_id, from_address, to_address, amount_sompi, amount_kaspa, tier, status, covenant_id, network, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?8, unixepoch())",
        params![tx_id, from_addr, to_addr, amount_sompi, amount, tier, covenant_id, network],
    )?;
    Ok(())
}

pub fn confirm_payment(
    db: &Db,
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

/// True if this payment has already been confirmed. Used by the verifier loop
/// to do the expensive upgrade + UI-regen work ONCE on the pending->confirmed
/// transition, instead of every 15s cycle for every never-swept treasury UTXO.
pub fn is_payment_confirmed(db: &Db, tx_id: &str) -> bool {
    let conn = db.lock().unwrap();
    conn.query_row(
        "SELECT 1 FROM payments WHERE tx_id = ?1 AND status = 'confirmed'",
        params![tx_id],
        |_| Ok(true),
    )
    .unwrap_or(false)
}

/// Returns the highest tier this address has ever successfully paid for (by amount),
/// filtered to a specific network so TN10 payments don't leak into TN12 and vice versa.
/// Checks the accounts table (directly credited by signer on broadcast) first,
/// then falls back to the payments table for externally-detected payments.
pub fn get_highest_paid_tier_for_address(
    db: &Db,
    address: &str,
    network: &str,
) -> anyhow::Result<Option<String>> {
    let conn = db.lock().unwrap();
    // Check accounts table first (signer credits this immediately on broadcast)
    let account_tier: Option<String> = conn
        .query_row(
            "SELECT tier FROM accounts WHERE address = ?1 AND network = ?2 AND is_active = 1",
            params![address, network],
            |r| r.get(0),
        )
        .ok();
    if let Some(ref tier) = account_tier {
        if tier != "FREE" {
            return Ok(account_tier);
        }
    }
    // Fall back to payments table
    let mut stmt = conn.prepare(
        "SELECT tier FROM payments 
         WHERE from_address = ?1 AND status = 'confirmed' AND network = ?2
         ORDER BY amount_sompi DESC LIMIT 1",
    )?;
    let mut rows = stmt.query_map(params![address, network], |row| row.get::<_, String>(0))?;
    Ok(rows.next().transpose()?)
}

pub fn upgrade_account(
    db: &Db,
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

pub fn get_account_tier(db: &Db, address: &str, network: &str) -> anyhow::Result<String> {
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
    db: &Db,
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
    db: &Db,
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
    db: &Db,
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
    db: &Db,
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
    db: &Db,
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
    db: &Db,
    owner: Option<&str>,
) -> anyhow::Result<Vec<serde_json::Value>> {
    let conn = db.lock().unwrap();
    let sql = if let Some(_owner_addr) = owner {
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
        let _rows = stmt.query_map([], |row| {
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
    db: &Db,
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

// ── P2SH covenants (real script-locked custody, roadmap B3) ──────────

/// A persisted P2SH covenant: the redeem script + funded outpoint needed to later
/// build a spend transaction that redeems the locked funds.
pub struct P2shCovenant {
    pub tx_id: String,
    pub network: String,
    pub p2sh_address: String,
    pub redeem_script_hex: String,
    pub redeem_kind: String,
    pub amount_sompi: u64,
    pub outpoint_index: u32,
    pub owner_addr: String,
    pub spent_tx_id: Option<String>,
}

#[allow(clippy::too_many_arguments)]
pub fn insert_p2sh_covenant(
    db: &Db,
    tx_id: &str,
    network: &str,
    p2sh_address: &str,
    redeem_script_hex: &str,
    redeem_kind: &str,
    amount_sompi: u64,
    outpoint_index: u32,
    owner_addr: &str,
) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO p2sh_covenants
         (tx_id, network, p2sh_address, redeem_script_hex, redeem_kind, amount_sompi, outpoint_index, owner_addr, spent_tx_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, unixepoch())",
        params![tx_id, network, p2sh_address, redeem_script_hex, redeem_kind, amount_sompi, outpoint_index, owner_addr],
    )?;
    Ok(())
}

/// Attach creator-supplied metadata to a covenant being CLAIMED (an elsewhere-created covenant
/// whose redeem script the claimer has just proven). Makes it display + filter as a real covenant.
pub fn set_claimed_metadata(
    db: &Db,
    covenant_id: &str,
    description: &str,
    covenant_type: &str,
) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "UPDATE covenants SET description = ?2, full_logic_summary = ?2, covenant_type = ?3, category = 'Claimed Covenants', is_active = 1 WHERE tx_id = ?1",
        params![covenant_id, description, covenant_type],
    )?;
    Ok(())
}

pub fn get_p2sh_covenant(db: &Db, tx_id: &str) -> Option<P2shCovenant> {
    let conn = db.lock().unwrap();
    conn.query_row(
        "SELECT tx_id, network, p2sh_address, redeem_script_hex, redeem_kind, amount_sompi, outpoint_index, owner_addr, spent_tx_id
         FROM p2sh_covenants WHERE tx_id = ?1",
        params![tx_id],
        |r| {
            Ok(P2shCovenant {
                tx_id: r.get(0)?,
                network: r.get(1)?,
                p2sh_address: r.get(2)?,
                redeem_script_hex: r.get(3)?,
                redeem_kind: r.get(4)?,
                amount_sompi: r.get(5)?,
                outpoint_index: r.get(6)?,
                owner_addr: r.get(7)?,
                spent_tx_id: r.get(8)?,
            })
        },
    )
    .ok()
}

pub fn mark_p2sh_spent(db: &Db, tx_id: &str, spent_tx_id: &str) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "UPDATE p2sh_covenants SET spent_tx_id = ?2 WHERE tx_id = ?1",
        params![tx_id, spent_tx_id],
    )?;
    Ok(())
}

// ── Non-custodial oracle co-sign payout sessions (restart-durable, fail-closed) ──
// These persist the PREPARE-time PendingOraclePayout so a backend restart before SUBMIT does
// not orphan a winner who already received the prepare response. The stored fields are exactly
// what submit needs to reconstruct a value-identical PendingOraclePayout (hence an identical
// reconstructed sighash, so the stored oracle BIP340 signature still verifies). The kaspa
// consensus types are kept out of db.rs: covenant_builder.rs serializes the unsigned
// Transaction + UtxoEntry to JSON and the byte fields to hex before calling, and reverses that
// on load. db.rs only moves opaque strings/ints. A DB error here makes the caller FAIL CLOSED.

/// One persisted oracle-payout session row, as raw stored columns. covenant_builder.rs does the
/// typed (de)serialization (serde_json for unsigned_tx_json/entry_json, hex for the byte fields).
#[derive(Clone, Debug)]
pub struct PersistedOraclePayout {
    pub session_id: String,
    pub network: String,
    pub unsigned_tx_json: String,
    pub entry_json: String,
    pub redeem_hex: String,
    pub deploy_tx_id: String,
    pub kind_base: String,
    pub oracle_sig_hex: String,
    pub member_pubkeys_json: String,
    pub winner_is_a: bool,
    pub winner_xonly_hex: String,
    pub committed_txid: String,
    pub committed_index: u32,
    pub committed_amount: u64,
    pub committed_p2sh_hex: String,
    pub p2sh_address: String,
    pub created_at: i64,
}

/// Persist a prepared oracle-payout session. INSERT OR REPLACE keyed by session_id so a re-run
/// with the same uuid is idempotent (uuids are unique in practice). Returns Err on any DB
/// failure so the caller can fail closed (refuse to co-sign rather than risk an unrecoverable
/// session after a restart).
pub fn insert_oracle_payout_session(db: &Db, s: &PersistedOraclePayout) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO oracle_payout_sessions
         (session_id, network, unsigned_tx_json, entry_json, redeem_hex, deploy_tx_id, kind_base,
          oracle_sig_hex, member_pubkeys_json, winner_is_a, winner_xonly_hex, committed_txid,
          committed_index, committed_amount, committed_p2sh_hex, p2sh_address, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        params![
            s.session_id, s.network, s.unsigned_tx_json, s.entry_json, s.redeem_hex,
            s.deploy_tx_id, s.kind_base, s.oracle_sig_hex, s.member_pubkeys_json,
            s.winner_is_a as i64, s.winner_xonly_hex, s.committed_txid, s.committed_index,
            s.committed_amount as i64, s.committed_p2sh_hex, s.p2sh_address, s.created_at,
        ],
    )?;
    Ok(())
}

/// Load a persisted oracle-payout session by id (used at submit after a restart drops the
/// in-memory map). Returns Ok(None) when the row is absent. Err only on a real DB error, so the
/// caller can distinguish unknown-session (refuse) from DB-down (refuse, fail closed).
pub fn get_oracle_payout_session(db: &Db, session_id: &str) -> anyhow::Result<Option<PersistedOraclePayout>> {
    let conn = db.lock().unwrap();
    let row = conn.query_row(
        "SELECT session_id, network, unsigned_tx_json, entry_json, redeem_hex, deploy_tx_id,
                kind_base, oracle_sig_hex, member_pubkeys_json, winner_is_a, winner_xonly_hex,
                committed_txid, committed_index, committed_amount, committed_p2sh_hex,
                p2sh_address, created_at
         FROM oracle_payout_sessions WHERE session_id = ?1",
        params![session_id],
        |r| {
            Ok(PersistedOraclePayout {
                session_id: r.get(0)?,
                network: r.get(1)?,
                unsigned_tx_json: r.get(2)?,
                entry_json: r.get(3)?,
                redeem_hex: r.get(4)?,
                deploy_tx_id: r.get(5)?,
                kind_base: r.get(6)?,
                oracle_sig_hex: r.get(7)?,
                member_pubkeys_json: r.get(8)?,
                winner_is_a: r.get::<_, i64>(9)? != 0,
                winner_xonly_hex: r.get(10)?,
                committed_txid: r.get(11)?,
                committed_index: r.get::<_, i64>(12)? as u32,
                committed_amount: r.get::<_, i64>(13)? as u64,
                committed_p2sh_hex: r.get(14)?,
                p2sh_address: r.get(15)?,
                created_at: r.get(16)?,
            })
        },
    );
    // Distinguish unknown-session (no row -> Ok(None), the caller refuses) from a real DB error
    // (-> Err, the caller also refuses but fails closed loudly). Never silently treat a DB error
    // as "no session" - that could hide a real failure on the fund path.
    match row {
        Ok(s) => Ok(Some(s)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Single-use: delete a session row on consume (success or refusal) so it can never be replayed.
pub fn delete_oracle_payout_session(db: &Db, session_id: &str) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "DELETE FROM oracle_payout_sessions WHERE session_id = ?1",
        params![session_id],
    )?;
    Ok(())
}

/// TTL cleanup: delete sessions older than `cutoff_ts` (the 10-minute session lifetime), matching
/// the in-memory map's retain(). Best-effort; called from prepare so it piggybacks on the write.
pub fn cleanup_oracle_payout_sessions(db: &Db, cutoff_ts: i64) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "DELETE FROM oracle_payout_sessions WHERE created_at <= ?1",
        params![cutoff_ts],
    )?;
    Ok(())
}

/// A binary prediction market's outcome commitment (the P3 commit/reveal oracle). The two
/// secrets are committed as H_A/H_B at creation; exactly ONE is revealed at resolution.
#[derive(Clone, Debug)]
pub struct BundleMarket {
    pub market_id: String,
    pub network: String,
    pub question: String,
    pub outcome_a: String,
    pub outcome_b: String,
    pub h_a: String,
    pub h_b: String,
    pub secret_a: String,
    pub secret_b: String,
    pub kickoff_utc: Option<String>,
    pub source_url: Option<String>,
    pub revealed_outcome: Option<i64>,
    pub revealed_secret: Option<String>,
    pub resolved_at: Option<i64>,
    pub fee_bps: i64,
    pub rebate_bps: i64,
}

#[allow(clippy::too_many_arguments)]
pub fn insert_bundle_market(
    db: &Db,
    market_id: &str, network: &str, question: &str, outcome_a: &str, outcome_b: &str,
    h_a: &str, h_b: &str, secret_a: &str, secret_b: &str,
    kickoff_utc: Option<&str>, source_url: Option<&str>,
    fee_bps: i64, rebate_bps: i64,
) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO bundle_markets
         (market_id, network, question, outcome_a, outcome_b, h_a, h_b, secret_a, secret_b, kickoff_utc, source_url, revealed_outcome, revealed_secret, created_at, resolved_at, fee_bps, rebate_bps)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11, NULL, NULL, unixepoch(), NULL, ?12, ?13)",
        params![market_id, network, question, outcome_a, outcome_b, h_a, h_b, secret_a, secret_b, kickoff_utc, source_url, fee_bps, rebate_bps],
    )?;
    Ok(())
}

/// Bind a market to its on-chain creator address. Called immediately after
/// insert_bundle_market so the creator can be authorised for privileged market
/// actions (e.g. resolution) without changing insert_bundle_market's signature.
pub fn set_bundle_market_creator(db: &Db, market_id: &str, creator: &str) -> rusqlite::Result<usize> {
    let conn = db.lock().unwrap();
    conn.execute(
        "UPDATE bundle_markets SET creator_address = ?2 WHERE market_id = ?1",
        params![market_id, creator],
    )
}

/// The on-chain creator bound to a market, if one has been recorded.
pub fn get_bundle_market_creator(db: &Db, market_id: &str) -> Option<String> {
    let conn = db.lock().unwrap();
    conn.query_row(
        "SELECT creator_address FROM bundle_markets WHERE market_id = ?1",
        params![market_id],
        |r| r.get::<_, Option<String>>(0),
    )
    .ok()
    .flatten()
}

pub fn get_bundle_market(db: &Db, market_id: &str) -> Option<BundleMarket> {
    let conn = db.lock().unwrap();
    conn.query_row(
        "SELECT market_id, network, question, outcome_a, outcome_b, h_a, h_b, secret_a, secret_b, kickoff_utc, source_url, revealed_outcome, revealed_secret, resolved_at, fee_bps, rebate_bps
         FROM bundle_markets WHERE market_id = ?1",
        params![market_id],
        |r| Ok(BundleMarket {
            market_id: r.get(0)?, network: r.get(1)?, question: r.get(2)?, outcome_a: r.get(3)?, outcome_b: r.get(4)?,
            h_a: r.get(5)?, h_b: r.get(6)?, secret_a: r.get(7)?, secret_b: r.get(8)?,
            kickoff_utc: r.get(9)?, source_url: r.get(10)?, revealed_outcome: r.get(11)?, revealed_secret: r.get(12)?, resolved_at: r.get(13)?, fee_bps: r.get(14)?, rebate_bps: r.get(15)?,
        }),
    ).ok()
}

fn row_to_market(r: &rusqlite::Row) -> rusqlite::Result<BundleMarket> {
    Ok(BundleMarket {
        market_id: r.get(0)?, network: r.get(1)?, question: r.get(2)?, outcome_a: r.get(3)?, outcome_b: r.get(4)?,
        h_a: r.get(5)?, h_b: r.get(6)?, secret_a: r.get(7)?, secret_b: r.get(8)?,
        kickoff_utc: r.get(9)?, source_url: r.get(10)?, revealed_outcome: r.get(11)?, revealed_secret: r.get(12)?, resolved_at: r.get(13)?, fee_bps: r.get(14)?, rebate_bps: r.get(15)?,
    })
}

const MARKET_COLS: &str = "market_id, network, question, outcome_a, outcome_b, h_a, h_b, secret_a, secret_b, kickoff_utc, source_url, revealed_outcome, revealed_secret, resolved_at, fee_bps, rebate_bps";

pub fn list_bundle_markets(db: &Db, network: Option<&str>, limit: i64) -> Vec<BundleMarket> {
    let conn = db.lock().unwrap();
    let mut out = Vec::new();
    if let Some(net) = network {
        let sql = format!("SELECT {MARKET_COLS} FROM bundle_markets WHERE network = ?1 ORDER BY created_at DESC LIMIT ?2");
        if let Ok(mut stmt) = conn.prepare(&sql) {
            if let Ok(rows) = stmt.query_map(params![net, limit], row_to_market) { out.extend(rows.flatten()); }
        }
    } else {
        let sql = format!("SELECT {MARKET_COLS} FROM bundle_markets ORDER BY created_at DESC LIMIT ?1");
        if let Ok(mut stmt) = conn.prepare(&sql) {
            if let Ok(rows) = stmt.query_map(params![limit], row_to_market) { out.extend(rows.flatten()); }
        }
    }
    out
}

/// Reveal exactly ONE outcome's secret (single-secret policy: the WHERE clause only updates
/// when the market is unresolved or already resolved to the SAME outcome).
pub fn resolve_bundle_market(db: &Db, market_id: &str, outcome: i64, secret: &str) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "UPDATE bundle_markets SET revealed_outcome = ?2, revealed_secret = ?3, resolved_at = unixepoch()
         WHERE market_id = ?1 AND (revealed_outcome IS NULL OR revealed_outcome = ?2)",
        params![market_id, outcome, secret],
    )?;
    Ok(())
}

/// A YES(side 0)/NO(side 1) order placed on a market's order book.
#[derive(Clone, Debug)]
pub struct MarketOrder {
    pub order_id: String,
    pub market_id: String,
    pub side: i64,
    pub stake_sompi: i64,
    pub bettor_addr: String,
    pub bettor_pubkey: String,
    pub status: String,
    pub bundle_tx: Option<String>,
}

fn row_to_order(r: &rusqlite::Row) -> rusqlite::Result<MarketOrder> {
    Ok(MarketOrder {
        order_id: r.get(0)?, market_id: r.get(1)?, side: r.get(2)?, stake_sompi: r.get(3)?,
        bettor_addr: r.get(4)?, bettor_pubkey: r.get(5)?, status: r.get(6)?, bundle_tx: r.get(7)?,
    })
}

const ORDER_COLS: &str = "order_id, market_id, side, stake_sompi, bettor_addr, bettor_pubkey, status, bundle_tx";

pub fn insert_market_order(db: &Db, order_id: &str, market_id: &str, side: i64, stake_sompi: i64, bettor_addr: &str, bettor_pubkey: &str) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO market_orders (order_id, market_id, side, stake_sompi, bettor_addr, bettor_pubkey, status, bundle_tx, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,'open',NULL,unixepoch())",
        params![order_id, market_id, side, stake_sompi, bettor_addr, bettor_pubkey],
    )?;
    Ok(())
}

pub fn list_market_orders(db: &Db, market_id: &str) -> Vec<MarketOrder> {
    let conn = db.lock().unwrap();
    let sql = format!("SELECT {ORDER_COLS} FROM market_orders WHERE market_id = ?1 ORDER BY created_at ASC");
    let mut out = Vec::new();
    if let Ok(mut stmt) = conn.prepare(&sql) {
        if let Ok(rows) = stmt.query_map(params![market_id], row_to_order) {
            out.extend(rows.flatten());
        }
    }
    out
}

pub fn list_open_orders_side(db: &Db, market_id: &str, side: i64) -> Vec<MarketOrder> {
    let conn = db.lock().unwrap();
    let sql = format!("SELECT {ORDER_COLS} FROM market_orders WHERE market_id = ?1 AND side = ?2 AND status = 'open' ORDER BY created_at ASC");
    let mut out = Vec::new();
    if let Ok(mut stmt) = conn.prepare(&sql) {
        if let Ok(rows) = stmt.query_map(params![market_id, side], row_to_order) {
            out.extend(rows.flatten());
        }
    }
    out
}

pub fn mark_order_funded(db: &Db, order_id: &str, bundle_tx: &str) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute("UPDATE market_orders SET status='funded', bundle_tx=?2 WHERE order_id=?1", params![order_id, bundle_tx])?;
    Ok(())
}

/// A funded conjoined bundle (one matched mini-pool) with its carved legs stored for settlement.
#[derive(Clone, Debug)]
pub struct MarketBundle {
    pub bundle_tx: String,
    pub a_addr: String,
    pub b_addr: String,
    pub legs_json: String,
}

pub fn insert_market_bundle(db: &Db, bundle_tx: &str, market_id: &str, a_addr: &str, b_addr: &str, legs_json: &str) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO market_bundles (bundle_tx, market_id, a_addr, b_addr, legs_json, created_at) VALUES (?1,?2,?3,?4,?5,unixepoch())",
        params![bundle_tx, market_id, a_addr, b_addr, legs_json],
    )?;
    Ok(())
}

pub fn list_market_bundles(db: &Db, market_id: &str) -> Vec<MarketBundle> {
    let conn = db.lock().unwrap();
    let mut out = Vec::new();
    if let Ok(mut stmt) = conn.prepare("SELECT bundle_tx, a_addr, b_addr, legs_json FROM market_bundles WHERE market_id = ?1 ORDER BY created_at ASC") {
        if let Ok(rows) = stmt.query_map(params![market_id], |r| Ok(MarketBundle {
            bundle_tx: r.get(0)?, a_addr: r.get(1)?, b_addr: r.get(2)?, legs_json: r.get(3)?,
        })) {
            out.extend(rows.flatten());
        }
    }
    out
}

pub fn get_last_scanned_daa(db: &Db, network: &str) -> anyhow::Result<u64> {
    let conn = db.lock().unwrap();
    Ok(conn
        .query_row(
            "SELECT last_scanned_daa FROM crawler_state WHERE id = 1 AND network = ?1",
            params![network],
            |r| r.get(0),
        )
        .unwrap_or(0))
}

pub fn update_last_scanned_daa(db: &Db, daa: u64, network: &str) -> anyhow::Result<()> {
    let conn = db.lock().unwrap();
    conn.execute(
        "UPDATE crawler_state SET last_scanned_daa = ?1 WHERE id = 1 AND network = ?2",
        params![daa, network],
    )?;
    Ok(())
}

// ── Auth Token Management ─────────────────────────────────────

/// Create a one-time auth token for a paying address on a specific network.
/// Token is 32 cryptographically-random bytes (256 bits of entropy), hex-encoded.
/// Deriving it from low-entropy fields (address/network/second-resolution timestamp)
/// plus a 64-bit salt was guessable; an unguessable random token is required because
/// possession of the token authorises a paid deployment.
pub fn create_auth_token(
    db: &Db,
    address: &str,
    network: &str,
    tier: &str,
) -> anyhow::Result<String> {
    let conn = db.lock().unwrap();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let token = hex::encode(rand::random::<[u8; 32]>());

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
    db: &Db,
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
    db: &Db,
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
    db: &Db,
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

// ── Privacy Mixer ─────────────────────────────────────────────────────────

pub fn mixer_add_leaf(
    db: &Db,
    covenant_id: &str,
    leaf_hash: &str,
) -> anyhow::Result<(i64, String)> {
    let conn = db.lock().unwrap();
    let leaf_index: i64 = conn.query_row(
        "SELECT COALESCE(MAX(leaf_index), -1) + 1 FROM mixer_leaves WHERE covenant_id = ?1",
        params![covenant_id],
        |r| r.get(0),
    ).unwrap_or(0);

    conn.execute(
        "INSERT INTO mixer_leaves (covenant_id, leaf_index, leaf_hash) VALUES (?1, ?2, ?3)",
        params![covenant_id, leaf_index, leaf_hash],
    )?;

    let leaves: Vec<String> = {
        let mut stmt = conn.prepare(
            "SELECT leaf_hash FROM mixer_leaves WHERE covenant_id = ?1 ORDER BY leaf_index ASC",
        )?;
        let rows = stmt.query_map(params![covenant_id], |row| row.get::<_, String>(0))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let root = compute_mixer_root(&leaves)?;
    let count = leaves.len() as i64;

    conn.execute(
        "INSERT INTO mixer_roots (covenant_id, merkle_root, leaf_count, updated_at)
         VALUES (?1, ?2, ?3, unixepoch())
         ON CONFLICT(covenant_id) DO UPDATE SET
           merkle_root = excluded.merkle_root,
           leaf_count = excluded.leaf_count,
           updated_at = unixepoch()",
        params![covenant_id, root, count],
    )?;

    Ok((leaf_index, root))
}

pub fn mixer_get_root(db: &Db, covenant_id: &str) -> anyhow::Result<(String, i64)> {
    let conn = db.lock().unwrap();
    conn.query_row(
        "SELECT merkle_root, leaf_count FROM mixer_roots WHERE covenant_id = ?1",
        params![covenant_id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)),
    )
    .or_else(|_| Ok(("0".to_string(), 0)))
}

pub fn mixer_nullifier_spent(db: &Db, nullifier: &str) -> anyhow::Result<bool> {
    let conn = db.lock().unwrap();
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM mixer_nullifiers WHERE nullifier = ?1",
        params![nullifier],
        |r| r.get(0),
    )?;
    Ok(count > 0)
}

/// Atomically record a nullifier as spent. `nullifier` is the PRIMARY KEY of
/// mixer_nullifiers (UNIQUE), so the INSERT OR IGNORE inserts exactly one row the
/// first time a nullifier is seen and ZERO rows on any reuse. Returns the number
/// of rows inserted so the caller can detect a double-spend (0 == already spent).
pub fn mixer_record_nullifier(
    db: &Db,
    nullifier: &str,
    covenant_id: &str,
) -> rusqlite::Result<usize> {
    let conn = db.lock().unwrap();
    conn.execute(
        "INSERT OR IGNORE INTO mixer_nullifiers (nullifier, covenant_id) VALUES (?1, ?2)",
        params![nullifier, covenant_id],
    )
}

fn compute_mixer_root(leaves: &[String]) -> anyhow::Result<String> {
    use std::process::Command;

    // Robust multi-candidate path resolution for release/prod vs dev builds.
    // CARGO_MANIFEST_DIR is baked at compile time and can be wrong for deployed binaries
    // or when cwd != source tree. We try env, manifest, exe-relative walk, and prod fallbacks.
    let mut candidates: Vec<std::path::PathBuf> = vec![];

    if let Ok(p) = std::env::var("COVEX_MIXER_COMPUTE_ROOT") {
        candidates.push(std::path::PathBuf::from(p));
    }

    // Baked at build (works for `cargo run` / build inside full source checkout)
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    candidates.push(manifest.join("../zk/privacy_mixer/lib/compute_root.js"));

    // Walk up from current executable (good for copied binaries or service deploys)
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf());
        for _ in 0..6 {
            if let Some(d) = &dir {
                let cand = d.join("zk/privacy_mixer/lib/compute_root.js");
                if !candidates.iter().any(|c| c == &cand) {
                    candidates.push(cand);
                }
                dir = d.parent().map(|p| p.to_path_buf());
            } else {
                break;
            }
        }
    }

    // Common prod locations (Hetzner /root checkout + legacy volume)
    candidates.push(std::path::PathBuf::from("/root/Covex27/zk/privacy_mixer/lib/compute_root.js"));
    candidates.push(std::path::PathBuf::from("/mnt/HC_Volume_105579109/Covex27/zk/privacy_mixer/lib/compute_root.js"));

    let node = if std::path::Path::new("/usr/bin/node").exists() {
        "/usr/bin/node"
    } else {
        "node"
    };

    let input = serde_json::to_string(leaves)?;

    let mut last_err = String::new();
    for script in &candidates {
        if !script.exists() {
            last_err = format!("script not found at {}", script.display());
            continue;
        }
        // Run with cwd set to the script's directory so sibling require("./tree") resolves reliably.
        let script_dir = script.parent().unwrap_or(std::path::Path::new("."));
        let output_res = Command::new(node)
            .arg(script)
            .current_dir(script_dir)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .and_then(|mut child| {
                use std::io::Write;
                if let Some(stdin) = child.stdin.as_mut() {
                    stdin.write_all(input.as_bytes())?;
                }
                child.wait_with_output()
            });

        match output_res {
            Ok(output) => {
                if output.status.success() {
                    let root = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !root.is_empty() {
                        return Ok(root);
                    }
                    last_err = "empty root output".to_string();
                } else {
                    last_err = format!(
                        "exit {} stderr: {}",
                        output.status,
                        String::from_utf8_lossy(&output.stderr)
                    );
                }
            }
            Err(e) => {
                last_err = format!("spawn error for {}: {}", script.display(), e);
            }
        }
    }

    anyhow::bail!(
        "compute_root.js failed for all candidates (last: {}). Tried: {:?}",
        last_err,
        candidates.iter().map(|p| p.display().to_string()).collect::<Vec<_>>()
    )
}

#[cfg(test)]
mod perf_sort_tests {
    use super::*;
    use rusqlite::Connection;

    // tier_rank must use EXACTLY the values the old CASE expression produced, otherwise
    // the indexed sort would reorder the list. This is the single source of truth shared
    // by the migration backfill, insert_covenant, and upgrade_covenant_record.
    #[test]
    fn tier_rank_matches_legacy_case_values() {
        assert_eq!(tier_rank_for("MAX"), 100);
        assert_eq!(tier_rank_for("PRO"), 50);
        assert_eq!(tier_rank_for("BUILDER"), 10);
        assert_eq!(tier_rank_for("FREE"), 0);
        assert_eq!(tier_rank_for("EXPLORER"), 0);
        assert_eq!(tier_rank_for(""), 0);
        assert_eq!(tier_rank_for("anything-else"), 0);
    }

    /// Build a minimal covenants table (just the columns the sort touches), populate
    /// tier_rank from verified_tier exactly as the migration/insert do, create the
    /// composite index, then assert that the NEW indexed ORDER BY returns rows in the
    /// IDENTICAL order to the OLD CASE-expression ORDER BY, and that the index exists.
    #[test]
    fn indexed_sort_matches_legacy_case_order_and_index_exists() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE covenants (
                tx_id         TEXT PRIMARY KEY,
                amount_kaspa  REAL NOT NULL DEFAULT 0,
                verified_tier TEXT NOT NULL DEFAULT 'FREE',
                is_active     INTEGER NOT NULL DEFAULT 1,
                timestamp     INTEGER NOT NULL DEFAULT 0,
                tier_rank     INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX idx_covenants_rank ON covenants(is_active, tier_rank DESC, amount_kaspa DESC, timestamp DESC);",
        )
        .unwrap();

        // (tx_id, tier, amount, timestamp) chosen to exercise every tier and every tie-break:
        // same-tier-different-amount, same-tier-same-amount-different-timestamp.
        let rows = [
            ("a_max_hi", "MAX", 500.0_f64, 10_i64),
            ("b_max_lo", "MAX", 100.0, 20),
            ("c_pro_hi", "PRO", 900.0, 30),
            ("d_pro_tieA", "PRO", 100.0, 40),
            ("e_pro_tieB", "PRO", 100.0, 35),
            ("f_builder", "BUILDER", 300.0, 50),
            ("g_free_hi", "FREE", 800.0, 60),
            ("h_free_lo", "FREE", 50.0, 70),
            ("i_explorer", "EXPLORER", 800.0, 65),
        ];
        for (id, tier, amt, ts) in rows {
            conn.execute(
                "INSERT INTO covenants (tx_id, verified_tier, amount_kaspa, timestamp, is_active, tier_rank)
                 VALUES (?1, ?2, ?3, ?4, 1, ?5)",
                params![id, tier, amt, ts, tier_rank_for(tier)],
            )
            .unwrap();
        }

        let order = |sql: &str| -> Vec<String> {
            let mut stmt = conn.prepare(sql).unwrap();
            stmt.query_map([], |r| r.get::<_, String>(0))
                .unwrap()
                .map(|r| r.unwrap())
                .collect()
        };

        let legacy = order(
            "SELECT tx_id FROM covenants WHERE is_active = 1 \
             ORDER BY CASE verified_tier WHEN 'MAX' THEN 100 WHEN 'PRO' THEN 50 WHEN 'BUILDER' THEN 10 ELSE 0 END DESC, \
             amount_kaspa DESC, timestamp DESC",
        );
        let indexed = order(
            "SELECT tx_id FROM covenants WHERE is_active = 1 \
             ORDER BY tier_rank DESC, amount_kaspa DESC, timestamp DESC",
        );

        assert_eq!(
            legacy, indexed,
            "indexed tier_rank sort must reproduce the legacy CASE-expression order exactly"
        );

        // Sanity: the documented tier-then-amount-then-timestamp order.
        assert_eq!(
            indexed,
            vec![
                "a_max_hi",   // MAX 500
                "b_max_lo",   // MAX 100
                "c_pro_hi",   // PRO 900
                "d_pro_tieA", // PRO 100 ts40 (newer wins tie)
                "e_pro_tieB", // PRO 100 ts35
                "f_builder",  // BUILDER 300
                // rank-0 group sorted by amount DESC then timestamp DESC:
                "i_explorer", // EXPLORER(=0) 800 ts65 (amount tie w/ g, newer ts wins)
                "g_free_hi",  // FREE(=0) 800 ts60
                "h_free_lo",  // FREE(=0) 50
            ]
        );

        // The composite index that serves the sort must exist.
        let idx_exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_covenants_rank'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(idx_exists, 1, "idx_covenants_rank must exist");
    }
}
