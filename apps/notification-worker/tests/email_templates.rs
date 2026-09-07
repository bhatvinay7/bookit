use notification_worker::email::{BookingEmailData, CancellationEmailData, render_templates};

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
        include_str!("../templates/booking_confirmation.hbs"),
        "booking_text_test",
        include_str!("../templates/booking_confirmation.txt.hbs"),
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
        include_str!("../templates/ticket_cancelled.hbs"),
        "cancellation_text_test",
        include_str!("../templates/ticket_cancelled.txt.hbs"),
        &data,
    )
    .expect("cancellation templates should render");
    assert!(html.contains("order-456"));
    assert!(html.contains("₹750.00"));
    assert!(text.contains("B4"));
}
