use axum::{
    extract::State,
    http::StatusCode,
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::{
    api::state::AppState,
    helpers::AppError,
    services::r2::upload_pdf_bytes,
};

pub fn internal_routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/tickets/generate-pdf", post(generate_pdf_ticket))
        .with_state(state)
}

#[derive(Deserialize, Debug)]
pub struct GeneratePdfRequest {
    pub order_id: String,
    pub user_id: i32,
    pub show_name: String,
    pub show_time: String,
    pub place: String,
    pub venue: String,
    pub price: String,
    pub seat_numbers: Vec<String>,
}

#[derive(Serialize)]
pub struct GeneratePdfResponse {
    pub pdf_url: String,
}

fn create_pdf_bytes(req: &GeneratePdfRequest) -> Result<Vec<u8>, AppError> {
    use printpdf::*;

    let (doc, page1, layer1) = PdfDocument::new(
        &format!("Ticket-{}", req.order_id),
        Mm(210.0),
        Mm(297.0),
        "Layer 1",
    );
    let layer = doc.get_page(page1).get_layer(layer1);
    let font = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e.to_string())))?;

    layer.use_text(
        format!("BookIt Official Ticket #{}", req.order_id),
        24.0,
        Mm(20.0),
        Mm(270.0),
        &font,
    );
    layer.use_text(
        format!("Show: {}", req.show_name),
        16.0,
        Mm(20.0),
        Mm(250.0),
        &font,
    );
    layer.use_text(
        format!("Time: {}", req.show_time),
        14.0,
        Mm(20.0),
        Mm(240.0),
        &font,
    );
    layer.use_text(
        format!("Venue: {}, {}", req.venue, req.place),
        14.0,
        Mm(20.0),
        Mm(230.0),
        &font,
    );
    layer.use_text(
        format!("Seats: {}", req.seat_numbers.join(", ")),
        14.0,
        Mm(20.0),
        Mm(220.0),
        &font,
    );
    layer.use_text(
        format!("Total Price: ₹{}", req.price),
        14.0,
        Mm(20.0),
        Mm(210.0),
        &font,
    );
    layer.use_text(
        "Status: ACTIVE".to_string(),
        14.0,
        Mm(20.0),
        Mm(200.0),
        &font,
    );

    let mut pdf_bytes = Vec::new();
    doc.save(&mut std::io::BufWriter::new(&mut pdf_bytes))
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e.to_string())))?;

    Ok(pdf_bytes)
}

/// POST /api/internal/tickets/generate-pdf
pub async fn generate_pdf_ticket(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<GeneratePdfRequest>,
) -> Result<(StatusCode, Json<GeneratePdfResponse>), AppError> {
    let pdf_bytes = create_pdf_bytes(&req)?;
    let upload_res = upload_pdf_bytes(pdf_bytes, &format!("ticket_{}.pdf", req.order_id)).await?;

    Ok((
        StatusCode::OK,
        Json(GeneratePdfResponse {
            pdf_url: upload_res.url,
        }),
    ))
}
