use std::env;

pub async fn send_email_notification(
    recipient_email: &str,
    subject: &str,
    body_text: &str,
) -> Result<(), anyhow::Error> {
    if env::var("GMAIL_USER").unwrap_or_default().is_empty()
        || env::var("GMAIL_APP_PASSWORD").unwrap_or_default().is_empty()
    {
        println!(
            "[Test/Mock Email] To: {} | Subject: {} | Body:\n{}",
            recipient_email, subject, body_text
        );
        return Ok(());
    }

    use lettre::message::header::ContentType;
    use lettre::transport::smtp::authentication::Credentials;
    use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

    let gmail_user = env::var("GMAIL_USER")?;
    let gmail_pass = env::var("GMAIL_APP_PASSWORD")?;

    let email = Message::builder()
        .from(gmail_user.parse()?)
        .to(recipient_email.parse()?)
        .subject(subject)
        .header(ContentType::TEXT_PLAIN)
        .body(body_text.to_string())?;

    let creds = Credentials::new(gmail_user.clone(), gmail_pass);

    let mailer: AsyncSmtpTransport<Tokio1Executor> =
        AsyncSmtpTransport::<Tokio1Executor>::relay("smtp.gmail.com")?
            .credentials(creds)
            .build();

    mailer
        .send(email)
        .await
        .map_err(|e| anyhow::anyhow!("SMTP send error: {}", e))?;

    println!("Email sent successfully to {}", recipient_email);
    Ok(())
}
