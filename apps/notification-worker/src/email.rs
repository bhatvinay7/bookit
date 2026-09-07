use handlebars::Handlebars;
use lettre::message::{Mailbox, MultiPart, SinglePart, header::ContentType};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use serde::Serialize;
use std::env;

const BOOKING_HTML: &str = include_str!("../templates/booking_confirmation.hbs");
const BOOKING_TEXT: &str = include_str!("../templates/booking_confirmation.txt.hbs");
const CANCELLATION_HTML: &str = include_str!("../templates/ticket_cancelled.hbs");
const CANCELLATION_TEXT: &str = include_str!("../templates/ticket_cancelled.txt.hbs");

#[derive(Debug, Serialize)]
pub struct BookingEmailData {
    pub order_id: String,
    pub venue: String,
    pub show_time: String,
    pub seats: Vec<String>,
    pub seat_count: usize,
    pub amount: String,
    pub ticket_url: String,
    pub support_email: String,
}

#[derive(Debug, Serialize)]
pub struct CancellationEmailData {
    pub order_id: String,
    pub seats: Vec<String>,
    pub seat_count: usize,
    pub refund_amount: String,
    pub support_email: String,
}

pub async fn send_booking_confirmation(
    recipient_email: &str,
    data: &BookingEmailData,
) -> Result<(), anyhow::Error> {
    send_rendered_email(
        recipient_email,
        &format!("Your BookIt booking is confirmed — {}", data.order_id),
        "booking_html",
        BOOKING_HTML,
        "booking_text",
        BOOKING_TEXT,
        data,
    )
    .await
}

pub async fn send_cancellation_confirmation(
    recipient_email: &str,
    data: &CancellationEmailData,
) -> Result<(), anyhow::Error> {
    send_rendered_email(
        recipient_email,
        &format!("BookIt cancellation confirmed — {}", data.order_id),
        "cancellation_html",
        CANCELLATION_HTML,
        "cancellation_text",
        CANCELLATION_TEXT,
        data,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn send_rendered_email<T: Serialize>(
    recipient_email: &str,
    subject: &str,
    html_name: &str,
    html_template: &str,
    text_name: &str,
    text_template: &str,
    data: &T,
) -> Result<(), anyhow::Error> {
    let (html_body, text_body) =
        render_templates(html_name, html_template, text_name, text_template, data)?;

    if env::var("APP_MODE").as_deref() == Ok("test") {
        return Ok(());
    }
    let config = SmtpConfig::from_lookup(|key| env::var(key).ok())?;
    let sender = Mailbox::new(Some("BookIt Tickets".to_string()), config.from.parse()?);
    let email = Message::builder()
        .from(sender)
        .to(recipient_email.parse()?)
        .subject(subject)
        .multipart(
            MultiPart::alternative()
                .singlepart(
                    SinglePart::builder()
                        .header(ContentType::TEXT_PLAIN)
                        .body(text_body),
                )
                .singlepart(
                    SinglePart::builder()
                        .header(ContentType::TEXT_HTML)
                        .body(html_body),
                ),
        )?;

    let creds = Credentials::new(config.user, config.password);
    let builder = if config.secure {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&config.host)?
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.host)?
    };
    let mailer = builder
        .port(config.port)
        .timeout(Some(std::time::Duration::from_secs(15)))
        .credentials(creds)
        .build();
    tokio::time::timeout(std::time::Duration::from_secs(60), mailer.send(email))
        .await
        .map_err(|_| anyhow::anyhow!("SMTP delivery timed out at {}:{}", config.host, config.port))?
        .map_err(|error| {
            anyhow::anyhow!(
                "SMTP send failed at {}:{}: {}. Check pod DNS and outbound SMTP connectivity",
                config.host,
                config.port,
                error
            )
        })?;

    println!("Email sent successfully to {}", recipient_email);
    Ok(())
}

pub fn render_templates<T: Serialize>(
    html_name: &str,
    html_template: &str,
    text_name: &str,
    text_template: &str,
    data: &T,
) -> Result<(String, String), anyhow::Error> {
    let mut handlebars = Handlebars::new();
    handlebars.set_strict_mode(true);
    handlebars.register_template_string(html_name, html_template)?;
    handlebars.register_template_string(text_name, text_template)?;
    let html_body = handlebars.render(html_name, data)?;
    let text_body = handlebars.render(text_name, data)?;
    Ok((html_body, text_body))
}

struct SmtpConfig {
    host: String,
    port: u16,
    secure: bool,
    user: String,
    password: String,
    from: String,
}

impl SmtpConfig {
    fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Result<Self, anyhow::Error> {
        let value =
            |key: &str| lookup(key).filter(|v| !v.trim().is_empty() && v != "\"\"" && v != "''");
        let smtp_user = value("SMTP_USER");
        let smtp_pass = value("SMTP_PASS");
        let (user, password) = match (smtp_user, smtp_pass) {
            (Some(user), Some(pass)) => (user, pass),
            (None, None) => (
                value("GMAIL_USER")
                    .ok_or_else(|| anyhow::anyhow!("SMTP_USER or GMAIL_USER is required"))?,
                value("GMAIL_APP_PASSWORD").ok_or_else(|| {
                    anyhow::anyhow!("SMTP_PASS or GMAIL_APP_PASSWORD is required")
                })?,
            ),
            _ => anyhow::bail!("SMTP_USER and SMTP_PASS must be configured together"),
        };
        let host = value("SMTP_HOST").unwrap_or_else(|| "smtp.gmail.com".into());
        let port = value("SMTP_PORT")
            .unwrap_or_else(|| "465".into())
            .parse::<u16>()
            .map_err(|_| anyhow::anyhow!("SMTP_PORT must be a valid port"))?;
        anyhow::ensure!(port != 0, "SMTP_PORT must be nonzero");
        let secure = match value("SMTP_SECURE").as_deref() {
            None => port == 465,
            Some("true") => true,
            Some("false") => false,
            _ => anyhow::bail!("SMTP_SECURE must be true or false"),
        };
        anyhow::ensure!(
            port != 465 || secure,
            "SMTP port 465 requires SMTP_SECURE=true"
        );
        anyhow::ensure!(
            port != 587 || !secure,
            "SMTP port 587 requires SMTP_SECURE=false (STARTTLS)"
        );
        let from = value("SMTP_FROM").unwrap_or_else(|| user.clone());
        Ok(Self {
            host,
            port,
            secure,
            user,
            password,
            from,
        })
    }
}

#[cfg(test)]
mod config_tests {
    use super::*;
    fn config(pairs: &[(&str, &str)]) -> Result<SmtpConfig, anyhow::Error> {
        SmtpConfig::from_lookup(|key| {
            pairs
                .iter()
                .find(|(k, _)| *k == key)
                .map(|(_, v)| v.to_string())
        })
    }
    #[test]
    fn gmail_defaults_to_implicit_tls() {
        let c = config(&[
            ("GMAIL_USER", "sender@example.com"),
            ("GMAIL_APP_PASSWORD", "password"),
        ])
        .unwrap();
        assert_eq!(c.port, 465);
        assert!(c.secure);
    }
    #[test]
    fn smtp_credentials_and_sender_override_gmail() {
        let c = config(&[
            ("SMTP_USER", "smtp-user"),
            ("SMTP_PASS", "smtp-password"),
            ("SMTP_FROM", "sender@example.com"),
            ("SMTP_HOST", "mail.example.com"),
            ("SMTP_PORT", "587"),
            ("SMTP_SECURE", "false"),
        ])
        .unwrap();
        assert_eq!(c.user, "smtp-user");
        assert_eq!(c.from, "sender@example.com");
        assert!(!c.secure);
    }
    #[test]
    fn rejects_missing_credentials_and_mismatched_tls() {
        assert!(config(&[]).is_err());
        assert!(config(&[("SMTP_USER", "user"), ("GMAIL_APP_PASSWORD", "pass")]).is_err());
        assert!(
            config(&[
                ("SMTP_USER", "user"),
                ("SMTP_PASS", "pass"),
                ("SMTP_PORT", "465"),
                ("SMTP_SECURE", "false")
            ])
            .is_err()
        );
    }
}
