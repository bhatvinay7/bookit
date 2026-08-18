use serde_json::json;
use std::env;

pub async fn process_razorpay_refund(
    payment_id: &str,
    amount_paise: i64,
) -> Result<(), anyhow::Error> {
    if env::var("APP_MODE").unwrap_or_default() == "test"
        || env::var("RAZORPAY_KEY_ID").unwrap_or_default().is_empty()
    {
        println!(
            "[Test/Mock Mode] Simulating Razorpay refund for payment_id: {} (amount: {} paise)",
            payment_id, amount_paise
        );
        return Ok(());
    }

    let key_id = env::var("RAZORPAY_KEY_ID")?;
    let key_secret = env::var("RAZORPAY_KEY_SECRET")?;

    let url = format!("https://api.razorpay.com/v1/payments/{}/refund", payment_id);
    let client = reqwest::Client::new();
    let res = client
        .post(&url)
        .basic_auth(key_id, Some(key_secret))
        .json(&json!({ "amount": amount_paise }))
        .send()
        .await?;

    if res.status().is_success() {
        Ok(())
    } else {
        let err_text = res.text().await.unwrap_or_else(|_| "unknown".into());
        Err(anyhow::anyhow!("Razorpay refund API error: {}", err_text))
    }
}
