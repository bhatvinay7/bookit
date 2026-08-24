use crate::helpers::AppError;
use printpdf::path::{PaintMode, WindingOrder};
use printpdf::*;
use std::io::BufWriter;

pub struct TicketPdfData {
    pub booking_id: String,
    pub show_title: String,
    pub show_time: String,
    pub venue_name: String,
    pub seats: Vec<String>,
    pub total_amount: String,
    pub status: String,
}

pub fn generate_ticket_pdf(ticket: &TicketPdfData) -> Result<Vec<u8>, AppError> {
    let (doc, page1, layer1) = PdfDocument::new(
        &format!("Ticket-{}", ticket.booking_id),
        Mm(210.0),
        Mm(297.0),
        "Layer 1",
    );
    let layer = doc.get_page(page1).get_layer(layer1);

    let font_bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| AppError::internal(e.to_string()))?;
    let font_regular = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| AppError::internal(e.to_string()))?;

    // Draw header rectangle (Polygon with Fill)
    let bg_color = Color::Rgb(Rgb::new(0.15, 0.15, 0.2, None));
    layer.set_fill_color(bg_color);

    let points = vec![
        (Point::new(Mm(0.0), Mm(297.0)), false),
        (Point::new(Mm(210.0), Mm(297.0)), false),
        (Point::new(Mm(210.0), Mm(260.0)), false),
        (Point::new(Mm(0.0), Mm(260.0)), false),
    ];
    let poly = Polygon {
        rings: vec![points],
        mode: PaintMode::Fill,
        winding_order: WindingOrder::NonZero,
    };
    layer.add_polygon(poly);

    // Write Header Title
    layer.set_fill_color(Color::Rgb(Rgb::new(1.0, 1.0, 1.0, None)));
    layer.use_text("BOOKIT - E-TICKET", 24.0, Mm(20.0), Mm(275.0), &font_bold);
    layer.use_text(
        format!("Booking ID: {}", ticket.booking_id),
        12.0,
        Mm(20.0),
        Mm(265.0),
        &font_regular,
    );

    // Ticket body
    layer.set_fill_color(Color::Rgb(Rgb::new(0.2, 0.2, 0.2, None)));

    layer.use_text("Show", 10.0, Mm(20.0), Mm(235.0), &font_regular);
    layer.use_text(&ticket.show_title, 18.0, Mm(20.0), Mm(226.0), &font_bold);

    layer.use_text("Venue", 10.0, Mm(20.0), Mm(205.0), &font_regular);
    layer.use_text(&ticket.venue_name, 14.0, Mm(20.0), Mm(198.0), &font_bold);

    let formatted_time = ticket.show_time.replace(" UTC", "").replace("+00:00", "");
    layer.use_text("Date & Time", 10.0, Mm(120.0), Mm(205.0), &font_regular);
    layer.use_text(formatted_time, 14.0, Mm(120.0), Mm(198.0), &font_bold);

    // Divider line
    layer.set_outline_thickness(1.0);
    layer.set_outline_color(Color::Rgb(Rgb::new(0.9, 0.9, 0.9, None)));

    let line_pts = vec![
        (Point::new(Mm(20.0), Mm(185.0)), false),
        (Point::new(Mm(190.0), Mm(185.0)), false),
    ];
    let line = Line {
        points: line_pts,
        is_closed: false,
    };
    layer.add_line(line);

    layer.set_fill_color(Color::Rgb(Rgb::new(0.2, 0.2, 0.2, None)));
    layer.use_text("Seats", 10.0, Mm(20.0), Mm(170.0), &font_regular);
    layer.use_text(
        ticket.seats.join(", "),
        14.0,
        Mm(20.0),
        Mm(163.0),
        &font_bold,
    );

    layer.use_text("Total Paid", 10.0, Mm(120.0), Mm(170.0), &font_regular);
    layer.use_text(
        format!("Rs. {}", ticket.total_amount),
        14.0,
        Mm(120.0),
        Mm(163.0),
        &font_bold,
    );

    layer.use_text("Status", 10.0, Mm(165.0), Mm(170.0), &font_regular);
    let status_color = if ticket.status.eq_ignore_ascii_case("completed") {
        Color::Rgb(Rgb::new(0.0, 0.6, 0.3, None))
    } else {
        Color::Rgb(Rgb::new(0.8, 0.4, 0.0, None))
    };
    layer.set_fill_color(status_color);
    layer.use_text(
        ticket.status.to_uppercase(),
        14.0,
        Mm(165.0),
        Mm(163.0),
        &font_bold,
    );

    // Note at the bottom
    layer.set_fill_color(Color::Rgb(Rgb::new(0.5, 0.5, 0.5, None)));
    layer.use_text(
        "Please present this ticket at the entrance. Valid for one entry only.",
        10.0,
        Mm(20.0),
        Mm(130.0),
        &font_regular,
    );
    layer.use_text("Enjoy the show!", 10.0, Mm(20.0), Mm(125.0), &font_regular);

    let mut pdf_bytes = Vec::new();
    doc.save(&mut BufWriter::new(&mut pdf_bytes))
        .map_err(|e| AppError::internal(e.to_string()))?;

    Ok(pdf_bytes)
}
