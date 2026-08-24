use crate::helpers::AppError;
use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::config::{Credentials, Region};
use aws_sdk_s3::primitives::ByteStream;
use axum::extract::Multipart;
use chrono::Utc;

fn build_client() -> S3Client {
    let account_id = std::env::var("CLOUDFLARE_R2_ACCOUNT_ID").unwrap_or_default();
    let access_key = std::env::var("CLOUDFLARE_R2_ACCESS_KEY_ID").unwrap_or_default();
    let secret_key = std::env::var("CLOUDFLARE_R2_SECRET_ACCESS_KEY").unwrap_or_default();
    let endpoint = format!("https://{account_id}.r2.cloudflarestorage.com");

    let creds = Credentials::new(access_key, secret_key, None, None, "r2");
    let cfg = aws_sdk_s3::Config::builder()
        .credentials_provider(creds)
        .region(Region::new("auto"))
        .endpoint_url(endpoint)
        .force_path_style(true)
        .build();
    S3Client::from_conf(cfg)
}

pub struct UploadResult {
    pub url: String,
    pub key: String,
}

/// Upload the first file field from a multipart form to Cloudflare R2.
pub async fn upload_from_multipart(mut multipart: Multipart) -> Result<UploadResult, AppError> {
    let bucket = std::env::var("CLOUDFLARE_R2_BUCKET").unwrap_or_else(|_| "zerocopy".into());
    let pub_url = std::env::var("CLOUDFLARE_R2_PUBLIC_URL").unwrap_or_default();
    let client = build_client();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
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
            .map_err(|e| AppError::Internal(anyhow::anyhow!("R2 upload failed: {}", e)))?;

        let url = format!("{}/{}", pub_url.trim_end_matches('/'), key);
        return Ok(UploadResult { url, key });
    }

    Err(AppError::BadRequest(
        "No file provided in multipart form".into(),
    ))
}

/// Upload PDF bytes directly to Cloudflare R2.
pub async fn upload_pdf_bytes(
    pdf_bytes: Vec<u8>,
    file_name: &str,
) -> Result<UploadResult, AppError> {
    let bucket = std::env::var("CLOUDFLARE_R2_BUCKET").unwrap_or_else(|_| "zerocopy".into());
    let pub_url =
        std::env::var("CLOUDFLARE_R2_PUBLIC_URL").unwrap_or_else(|_| "https://thepipe.shop".into());

    let key = format!("tickets/{}-{}", Utc::now().timestamp_millis(), file_name);

    if std::env::var("APP_MODE").unwrap_or_default() == "test"
        || std::env::var("CLOUDFLARE_R2_ACCESS_KEY_ID")
            .unwrap_or_default()
            .is_empty()
    {
        // In test mode or when R2 is unconfigured, return simulated R2 URL
        let url = format!("{}/{}", pub_url.trim_end_matches('/'), key);
        return Ok(UploadResult { url, key });
    }

    let client = build_client();
    client
        .put_object()
        .bucket(&bucket)
        .key(&key)
        .content_type("application/pdf")
        .body(ByteStream::from(pdf_bytes))
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("R2 upload failed: {}", e)))?;

    let url = format!("{}/{}", pub_url.trim_end_matches('/'), key);
    Ok(UploadResult { url, key })
}
