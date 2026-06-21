// Compile the guest crate(s) into a RISC-V ELF + image id and write methods.rs into OUT_DIR.
// risc0-build reads [package.metadata.risc0] (methods = ["games-guest"]) to find the guest.
fn main() {
    risc0_build::embed_methods();
}
