fn main() -> Result<(), Box<dyn std::error::Error>> {
    unsafe {
        std::env::set_var("PROTOC", protoc_bin_vendored::protoc_bin_path().unwrap());
    }
    tonic_build::configure()
        // Generated Tonic APIs return `tonic::Status`, which triggers
        // `result_large_err` on newer Clippy versions.
        .client_mod_attribute(
            ".",
            "#[allow(clippy::mixed_attributes_style, clippy::result_large_err)]",
        )
        .server_mod_attribute(
            ".",
            "#[allow(clippy::mixed_attributes_style, clippy::result_large_err)]",
        )
        .compile_protos(&["proto/locking.proto"], &["proto"])?;
    Ok(())
}
