use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::config::{Credentials, Region, timeout::TimeoutConfig};
use aws_sdk_s3::primitives::ByteStream;
use chrono::Utc;
use printpdf::*;

pub struct TicketPdfRequest {
    pub order_id: String,
    pub show_name: String,
    pub show_time: String,
    pub place: String,
    pub venue: String,
    pub price: String,
    pub seat_numbers: Vec<String>,
}

/// Create and upload a ticket after the order event has committed. Keeping
/// this in Notification Worker removes the extra HTTP Server hop from the
/// durable notification workflow.
pub async fn generate_and_upload_ticket_pdf(request: &TicketPdfRequest) -> anyhow::Result<String> {
    let pdf_bytes = create_pdf_bytes(request)?;
    let (bucket, public_url) = upload_settings()?;
    let client = build_r2_client()?;
    let key = format!(
        "tickets/{}-ticket_{}.pdf",
        Utc::now().timestamp_millis(),
        request.order_id
    );

    client
        .put_object()
        .bucket(bucket)
        .key(&key)
        .content_type("application/pdf")
        .body(ByteStream::from(pdf_bytes))
        .send()
        .await
        .map_err(|error| anyhow::anyhow!("R2 ticket upload failed: {error:?}"))?;

    Ok(format!("{}/{}", public_url.trim_end_matches('/'), key))
}

fn create_pdf_bytes(request: &TicketPdfRequest) -> anyhow::Result<Vec<u8>> {
    let (doc, page, layer) = PdfDocument::new(
        format!("Ticket-{}", request.order_id),
        Mm(210.0),
        Mm(297.0),
        "Ticket",
    );
    let layer = doc.get_page(page).get_layer(layer);
    let font = doc.add_builtin_font(BuiltinFont::Helvetica)?;

    for (text, size, y) in [
        (
            format!("BookIt Official Ticket #{}", request.order_id),
            24.0,
            270.0,
        ),
        (format!("Show: {}", request.show_name), 16.0, 250.0),
        (format!("Time: {}", request.show_time), 14.0, 240.0),
        (
            format!("Venue: {}, {}", request.venue, request.place),
            14.0,
            230.0,
        ),
        (
            format!("Seats: {}", request.seat_numbers.join(", ")),
            14.0,
            220.0,
        ),
        (format!("Total Price: ₹{}", request.price), 14.0, 210.0),
        ("Status: ACTIVE".to_string(), 14.0, 200.0),
    ] {
        layer.use_text(text, size, Mm(20.0), Mm(y), &font);
    }

    let mut bytes = Vec::new();
    doc.save(&mut std::io::BufWriter::new(&mut bytes))?;
    Ok(bytes)
}

fn build_r2_client() -> anyhow::Result<S3Client> {
    let account_id = required("CLOUDFLARE_R2_ACCOUNT_ID")?;
    if account_id.len() != 32 || !account_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        anyhow::bail!("CLOUDFLARE_R2_ACCOUNT_ID must contain 32 hexadecimal characters");
    }
    let access_key_id = required("CLOUDFLARE_R2_ACCESS_KEY_ID")?;
    if access_key_id.len() != 32 || access_key_id.bytes().any(|byte| byte.is_ascii_whitespace()) {
        anyhow::bail!(
            "CLOUDFLARE_R2_ACCESS_KEY_ID must contain exactly 32 non-whitespace characters"
        );
    }
    let endpoint = resolve_endpoint(
        &account_id,
        std::env::var("CLOUDFLARE_R2_ENDPOINT").ok().as_deref(),
    )?;
    let config = aws_sdk_s3::Config::builder()
        .credentials_provider(Credentials::new(
            access_key_id,
            required("CLOUDFLARE_R2_SECRET_ACCESS_KEY")?,
            None,
            None,
            "r2",
        ))
        .region(Region::new("auto"))
        .endpoint_url(endpoint)
        .timeout_config(
            TimeoutConfig::builder()
                .connect_timeout(std::time::Duration::from_secs(10))
                .operation_timeout(std::time::Duration::from_secs(45))
                .build(),
        )
        .force_path_style(true)
        .build();
    Ok(S3Client::from_conf(config))
}

fn upload_settings() -> anyhow::Result<(String, String)> {
    let bucket = required("CLOUDFLARE_R2_BUCKET")?;
    let public_url = required("CLOUDFLARE_R2_PUBLIC_URL")?;
    let valid_public_url = reqwest::Url::parse(&public_url).is_ok_and(|url| {
        matches!(url.scheme(), "http" | "https")
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none()
    });
    if !valid_public_url {
        anyhow::bail!("CLOUDFLARE_R2_PUBLIC_URL must be an HTTP(S) public bucket URL");
    }
    Ok((bucket, public_url))
}

fn required(name: &str) -> anyhow::Result<String> {
    std::env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty() && value != "\"\"" && value != "''")
        .ok_or_else(|| anyhow::anyhow!("{name} must be configured"))
}

fn resolve_endpoint(account_id: &str, configured: Option<&str>) -> anyhow::Result<String> {
    let expected = format!("https://{account_id}.r2.cloudflarestorage.com");
    match configured.map(str::trim) {
        None | Some("") | Some("\"\"") | Some("''") => Ok(expected),
        Some(value) if value.trim_end_matches('/') == expected => Ok(expected),
        _ => anyhow::bail!("CLOUDFLARE_R2_ENDPOINT must match the R2 account endpoint"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_only_the_expected_r2_endpoint() {
        let account_id = "0123456789abcdef0123456789abcdef";
        assert!(resolve_endpoint(account_id, None).is_ok());
        assert!(resolve_endpoint(account_id, Some("https://wrong.example")).is_err());
    }
}
