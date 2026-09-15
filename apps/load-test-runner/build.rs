use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR")?);
    let proto_dir = manifest_dir.join("../gateway-keeper/proto");
    let proto = proto_dir.join("locking.proto");
    println!("cargo:rerun-if-changed={}", proto.display());
    unsafe {
        std::env::set_var("PROTOC", protoc_bin_vendored::protoc_bin_path()?);
    }
    tonic_build::configure()
        .client_mod_attribute(
            ".",
            "#[allow(clippy::mixed_attributes_style, clippy::result_large_err)]",
        )
        .compile_protos(&[proto], &[proto_dir])?;
    Ok(())
}
