fn main() -> Result<(), Box<dyn std::error::Error>> {
    unsafe {
        std::env::set_var("PROTOC", protoc_bin_vendored::protoc_bin_path().unwrap());
    }
    tonic_build::configure()
        // Tonic client methods return `tonic::Status`; its size is outside this
        // generated API's control and triggers `result_large_err` on newer Clippy.
        .client_mod_attribute(
            ".",
            "#[allow(clippy::mixed_attributes_style, clippy::result_large_err)]",
        )
        .compile_protos(&["proto/search.proto"], &["proto"])?;
    Ok(())
}
