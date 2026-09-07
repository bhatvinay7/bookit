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

    // Credential resolution: prefer GMAIL_USER / GMAIL_APP_PASSWORD,
    // fall back to generic SMTP_USER / SMTP_PASS.
    let gmail_user = env::var("GMAIL_USER").unwrap_or_default();
    let gmail_password = env::var("GMAIL_APP_PASSWORD").unwrap_or_default();
    let smtp_user = env::var("SMTP_USER").unwrap_or_default();
    let smtp_pass = env::var("SMTP_PASS").unwrap_or_default();

    let (from_addr, password) = if !gmail_user.is_empty() && !gmail_password.is_empty() {
        (gmail_user, gmail_password)
    } else if !smtp_user.is_empty() && !smtp_pass.is_empty() {
        (smtp_user, smtp_pass)
    } else {
        // No credentials configured — log mock and return success.
        println!(
            "[Test/Mock Email] To: {} | Subject: {} | Body:\n{}",
            recipient_email, subject, text_body
        );
        return Ok(());
    };

    // SMTP host / port from env.  Defaults: host=smtp.gmail.com, port=465.
    // Port 465 = implicit TLS (SMTPS) which works even when cloud providers
    // block port 587 (STARTTLS).  Set SMTP_PORT=587 to opt into STARTTLS.
    let smtp_host = env::var("SMTP_HOST").unwrap_or_else(|_| "smtp.gmail.com".into());
    let smtp_port: u16 = env::var("SMTP_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(465);

    let sender = Mailbox::new(Some("BookIt Tickets".to_string()), from_addr.parse()?);
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

    let creds = Credentials::new(from_addr.clone(), password);

    // Build the transport depending on the port.
    // 465  → implicit TLS (SmtpsRelay)
    // 587  → STARTTLS
    // other → try implicit TLS
    let mailer: AsyncSmtpTransport<Tokio1Executor> = if smtp_port == 587 {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&smtp_host)?
            .port(smtp_port)
            .credentials(creds)
            .build()
    } else {
        // 465 or custom — use implicit TLS (SMTPS)
        AsyncSmtpTransport::<Tokio1Executor>::relay(&smtp_host)?
            .port(smtp_port)
            .credentials(creds)
            .build()
    };

    mailer
        .send(email)
        .await
        .map_err(|error| anyhow::anyhow!("SMTP send error: {}", error))?;

    println!("HTML email sent successfully to {}", recipient_email);
    Ok(())
}

fn render_templates<T: Serialize>(
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn booking_templates_render_html_and_text() {
        let data = BookingEmailData {
            order_id: "order-123".into(),
            venue: "BookIt Arena".into(),
            show_time: "Tuesday, 25 August 2026 at 07:00 PM IST".into(),
            seats: vec!["A1".into(), "A2".into()],
            seat_count: 2,
            amount: "1500.00".into(),
            ticket_url: "https://example.com/ticket.pdf".into(),
            support_email: "support@example.com".into(),
        };
        let (html, text) = render_templates(
            "booking_html_test",
            BOOKING_HTML,
            "booking_text_test",
            BOOKING_TEXT,
            &data,
        )
        .expect("booking templates should render");
        assert!(html.contains("order-123"));
        assert!(html.contains("Download your ticket"));
        assert!(text.contains("A1, A2"));
    }

    #[test]
    fn cancellation_templates_render_html_and_text() {
        let data = CancellationEmailData {
            order_id: "order-456".into(),
            seats: vec!["B4".into()],
            seat_count: 1,
            refund_amount: "750.00".into(),
            support_email: "support@example.com".into(),
        };
        let (html, text) = render_templates(
            "cancellation_html_test",
            CANCELLATION_HTML,
            "cancellation_text_test",
            CANCELLATION_TEXT,
            &data,
        )
        .expect("cancellation templates should render");
        assert!(html.contains("order-456"));
        assert!(html.contains("₹750.00"));
        assert!(text.contains("B4"));
    }
}
