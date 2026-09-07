use crate::helpers::AppError;
use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::config::{Credentials, Region, timeout::TimeoutConfig};
use aws_sdk_s3::primitives::ByteStream;
use axum::extract::Multipart;
use chrono::Utc;

fn build_client() -> Result<S3Client, AppError> {
    let account_id = std::env::var("CLOUDFLARE_R2_ACCOUNT_ID").unwrap_or_default();
    let access_key = std::env::var("CLOUDFLARE_R2_ACCESS_KEY_ID").unwrap_or_default();
    let secret_key = std::env::var("CLOUDFLARE_R2_SECRET_ACCESS_KEY").unwrap_or_default();

    if account_id.len() != 32 || !account_id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(AppError::internal(
            "CLOUDFLARE_R2_ACCOUNT_ID must contain 32 hexadecimal characters",
        ));
    }
    if access_key.trim().is_empty() || secret_key.trim().is_empty() {
        return Err(AppError::internal(
            "R2 access key and secret key must be configured",
        ));
    }

    let endpoint = resolve_endpoint(
        &account_id,
        std::env::var("CLOUDFLARE_R2_ENDPOINT").ok().as_deref(),
    )?;

    let creds = Credentials::new(access_key, secret_key, None, None, "r2");
    let cfg = aws_sdk_s3::Config::builder()
        .credentials_provider(creds)
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
    Ok(S3Client::from_conf(cfg))
}

pub struct UploadResult {
    pub url: String,
    pub key: String,
}

/// Upload the first file field from a multipart form to Cloudflare R2.
pub async fn upload_from_multipart(mut multipart: Multipart) -> Result<UploadResult, AppError> {
    let (bucket, pub_url) = upload_settings()?;
    let client = build_client()?;

    let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    else {
        return Err(AppError::BadRequest(
            "No file provided in multipart form".into(),
        ));
    };
    let file_name = field.file_name().unwrap_or("upload").to_string();
    let content_type = field
        .content_type()
        .unwrap_or("application/octet-stream")
        .to_string();
    let data = field
        .bytes()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    let key = format!("{}-{}", Utc::now().timestamp_millis(), file_name);

    client
        .put_object()
        .bucket(&bucket)
        .key(&key)
        .content_type(&content_type)
        .body(ByteStream::from(data))
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("R2 upload failed: {:?}", e)))?;

    let url = format!("{}/{}", pub_url.trim_end_matches('/'), key);
    Ok(UploadResult { url, key })
}

/// Upload PDF bytes directly to Cloudflare R2.
pub async fn upload_pdf_bytes(
    pdf_bytes: Vec<u8>,
    file_name: &str,
) -> Result<UploadResult, AppError> {
    let key = format!("tickets/{}-{}", Utc::now().timestamp_millis(), file_name);

    if std::env::var("APP_MODE").unwrap_or_default() == "test" {
        let pub_url = std::env::var("CLOUDFLARE_R2_PUBLIC_URL")
            .unwrap_or_else(|_| "https://example.com".into());
        let url = format!("{}/{}", pub_url.trim_end_matches('/'), key);
        return Ok(UploadResult { url, key });
    }

    let (bucket, pub_url) = upload_settings()?;
    let client = build_client()?;
    client
        .put_object()
        .bucket(&bucket)
        .key(&key)
        .content_type("application/pdf")
        .body(ByteStream::from(pdf_bytes))
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("R2 upload failed: {:?}", e)))?;

    let url = format!("{}/{}", pub_url.trim_end_matches('/'), key);
    Ok(UploadResult { url, key })
}

fn upload_settings() -> Result<(String, String), AppError> {
    let required = |name: &str| {
        std::env::var(name)
            .ok()
            .filter(|value| !value.trim().is_empty() && value != "\"\"" && value != "''")
            .ok_or_else(|| AppError::internal(format!("{name} must be configured")))
    };
    let bucket = required("CLOUDFLARE_R2_BUCKET")?;
    let public_url = required("CLOUDFLARE_R2_PUBLIC_URL")?;
    let valid = reqwest::Url::parse(&public_url).is_ok_and(|url| {
        matches!(url.scheme(), "http" | "https")
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none()
    });
    if !valid {
        return Err(AppError::internal(
            "CLOUDFLARE_R2_PUBLIC_URL must be an HTTP(S) public bucket URL",
        ));
    }
    Ok((bucket, public_url))
}

fn resolve_endpoint(account_id: &str, configured: Option<&str>) -> Result<String, AppError> {
    let expected = format!("https://{account_id}.r2.cloudflarestorage.com");
    match configured.map(str::trim) {
        None | Some("") | Some("\"\"") | Some("''") => Ok(expected),
        Some(value) if value.trim_end_matches('/') == expected => Ok(expected),
        _ => Err(AppError::internal(
            "CLOUDFLARE_R2_ENDPOINT must be the HTTPS R2 S3 endpoint for CLOUDFLARE_R2_ACCOUNT_ID; omit it to derive automatically",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn empty_endpoint_is_derived_and_invalid_hosts_are_rejected() {
        let account = "0123456789abcdef0123456789abcdef";
        let expected = format!("https://{account}.r2.cloudflarestorage.com");
        for value in [
            None,
            Some(""),
            Some("\"\""),
            Some("''"),
            Some(expected.as_str()),
        ] {
            assert_eq!(resolve_endpoint(account, value).unwrap(), expected);
        }
        for value in [
            "https://thepipe.shop",
            "https://\"\".r2.cloudflarestorage.com",
            "https://r2.cloudflarestorage.com.evil.example",
            "http://example.com",
        ] {
            assert!(resolve_endpoint(account, Some(value)).is_err());
        }
    }
}
