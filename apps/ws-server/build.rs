fn main() -> Result<(), Box<dyn std::error::Error>> {
    unsafe {
        std::env::set_var("PROTOC", protoc_bin_vendored::protoc_bin_path().unwrap());
    }
    tonic_build::configure()
        // Tonic's generated client returns `tonic::Status`, whose size is
        // outside the generated API's control on newer Clippy versions.
        .client_mod_attribute(
            ".",
            "#[allow(clippy::mixed_attributes_style, clippy::result_large_err)]",
        )
        .compile_protos(
            &["../gateway-keeper/proto/locking.proto"],
            &["../gateway-keeper/proto"],
        )?;
    Ok(())
}
