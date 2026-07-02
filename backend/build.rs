// Bakes the source commit into the binary at BUILD time as COVEX_BUILD_GIT_COMMIT.
//
// Why this exists (infra-02): the running backend reports /status.git_commit for deploy
// verification and covex-watch. The old runtime fallback shelled `git rev-parse` in the
// shared runtime dir, which fe_deploy/hard_deploy hard-reset on every deploy, so /status
// could report a commit the running binary was NOT built from (observed: /status showed
// aa157dc3 while the binary was built at ff6e5833). Capturing the commit here, at compile
// time, ties the reported value to the actual binary and is immune to later dir resets.
//
// Resolution order, all at build time:
//   1. GIT_COMMIT env passed by the build/deploy script (authoritative when set)
//   2. `git rev-parse --short=8 HEAD` in the crate dir being compiled
//   3. "unknown" (never fail the build over provenance)
// The value is emitted as a rustc env so `env!("COVEX_BUILD_GIT_COMMIT")` reads it.

use std::process::Command;

fn main() {
    let commit = std::env::var("GIT_COMMIT")
        .ok()
        .filter(|c| !c.is_empty() && c != "unknown")
        .or_else(|| {
            Command::new("git")
                .args(["rev-parse", "--short=8", "HEAD"])
                .output()
                .ok()
                .filter(|o| o.status.success())
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        })
        .unwrap_or_else(|| "unknown".to_string());

    println!("cargo:rustc-env=COVEX_BUILD_GIT_COMMIT={commit}");
    // Rebuild the provenance stamp whenever HEAD moves, so an incremental rebuild after a
    // deploy reset does not keep a stale baked-in commit.
    println!("cargo:rerun-if-changed=.git/HEAD");
    println!("cargo:rerun-if-changed=.git/refs/heads");
    println!("cargo:rerun-if-env-changed=GIT_COMMIT");
}
