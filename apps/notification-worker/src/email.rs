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

    // Credential resolution: GMAIL_USER / GMAIL_APP_PASSWORD required.
    let gmail_user = env::var("GMAIL_USER").unwrap_or_default();
    let gmail_password = env::var("GMAIL_APP_PASSWORD").unwrap_or_default();

    if gmail_user.is_empty() || gmail_password.is_empty() {
        println!(
            "[Mock Email] To: {} | Subject: {} | Body:\n{}",
            recipient_email, subject, text_body
        );
        return Ok(());
    }

    // SMTP_HOST / SMTP_PORT override via env for flexibility.
    // Default: smtp.gmail.com:465 (implicit TLS / SMTPS).
    // Set SMTP_PORT=587 in the deployment env to use STARTTLS instead.
    let smtp_host = env::var("SMTP_HOST").unwrap_or_else(|_| "smtp.gmail.com".into());
    let smtp_port: u16 = env::var("SMTP_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(465);

    let sender = Mailbox::new(Some("BookIt Tickets".to_string()), gmail_user.parse()?);
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

    let creds = Credentials::new(gmail_user.clone(), gmail_password);

    // Port 587 → STARTTLS ; 465 (default) or any other → implicit TLS (SMTPS).
    // Cloud providers commonly block 587 but 465 is less often restricted.
    let mailer: AsyncSmtpTransport<Tokio1Executor> = if smtp_port == 587 {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&smtp_host)?
            .port(smtp_port)
            .credentials(creds)
            .build()
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&smtp_host)?
            .port(smtp_port)
            .credentials(creds)
            .build()
    };

    mailer
        .send(email)
        .await
        .map_err(|error| anyhow::anyhow!("SMTP send error: {}", error))?;

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
