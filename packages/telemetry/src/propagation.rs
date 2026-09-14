use opentelemetry::propagation::TextMapPropagator;
use opentelemetry::{
    Context,
    propagation::{Extractor, Injector},
    trace::TraceContextExt,
};
use opentelemetry_sdk::propagation::TraceContextPropagator;
use std::{collections::HashMap, future::Future};
use tracing::{Instrument, Span};
use tracing_opentelemetry::OpenTelemetrySpanExt;

pub type TraceCarrier = HashMap<String, String>;

pub fn current_carrier() -> TraceCarrier {
    let mut carrier = TraceCarrier::new();
    TraceContextPropagator::new().inject_context(&Span::current().context(), &mut carrier);
    carrier
}

pub fn trace_ids() -> Option<(String, String)> {
    let context = Span::current().context();
    let span = context.span();
    let id = span.span_context();
    id.is_valid()
        .then(|| (id.trace_id().to_string(), id.span_id().to_string()))
}

pub fn extract_context(carrier: &dyn Extractor) -> Context {
    TraceContextPropagator::new().extract(carrier)
}

pub struct HeaderExtractor<'a>(pub &'a http::HeaderMap);
impl Extractor for HeaderExtractor<'_> {
    fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key)?.to_str().ok()
    }
    fn keys(&self) -> Vec<&str> {
        self.0.keys().map(|key| key.as_str()).collect()
    }
}

struct HeaderInjector<'a>(&'a mut http::HeaderMap);
impl Injector for HeaderInjector<'_> {
    fn set(&mut self, key: &str, value: String) {
        if let (Ok(key), Ok(value)) = (
            http::HeaderName::try_from(key),
            http::HeaderValue::try_from(value),
        ) {
            self.0.insert(key, value);
        }
    }
}

pub fn inject_headers(headers: &mut http::HeaderMap) {
    TraceContextPropagator::new()
        .inject_context(&Span::current().context(), &mut HeaderInjector(headers));
}

pub fn inject_grpc<T>(request: &mut tonic::Request<T>) {
    for (key, value) in current_carrier() {
        if let (Ok(key), Ok(value)) = (
            key.parse::<tonic::metadata::MetadataKey<tonic::metadata::Ascii>>(),
            value.parse(),
        ) {
            request.metadata_mut().insert(key, value);
        }
    }
}

/// Store only W3C context, never request bodies or credentials, across an outbox.
pub fn payload_carrier(payload: &serde_json::Value) -> TraceCarrier {
    serde_json::from_value(payload.get("_trace_context").cloned().unwrap_or_default())
        .unwrap_or_default()
}

pub fn operation_span(name: &str, kind: &str, parent: Option<Context>) -> Span {
    let span = tracing::info_span!(
        "operation",
        otel.name = name,
        otel.kind = kind,
        otel.status_code = tracing::field::Empty
    );
    if let Some(parent) = parent {
        span.set_parent(parent);
    }
    span
}

pub async fn in_span<F: Future>(span: Span, future: F) -> F::Output {
    async move {
        let start = std::time::Instant::now();
        let result = future.await;
        tracing::info!(
            duration_ms = start.elapsed().as_secs_f64() * 1000.0,
            "operation completed"
        );
        result
    }
    .instrument(span)
    .await
}

pub async fn in_result_span<T, E: std::fmt::Display>(
    span: Span,
    future: impl Future<Output = Result<T, E>>,
) -> Result<T, E> {
    in_span(span, async move {
        let result = future.await;
        if let Err(error) = &result {
            Span::current().record("otel.status_code", "ERROR");
            tracing::error!(%error, "operation failed");
        }
        result
    })
    .await
}

#[allow(clippy::result_large_err)]
pub async fn grpc_request<T, R, F, Fut>(
    request: tonic::Request<T>,
    service: &'static str,
    method: &'static str,
    handler: F,
) -> Result<tonic::Response<R>, tonic::Status>
where
    F: FnOnce(tonic::Request<T>) -> Fut,
    Fut: Future<Output = Result<tonic::Response<R>, tonic::Status>>,
{
    let parent = extract_context(&HeaderExtractor(&request.metadata().clone().into_headers()));
    let span = tracing::info_span!("grpc.request", otel.name = %format!("{service}/{method}"), otel.kind = "server",
        rpc.system = "grpc", rpc.service = service, rpc.method = method,
        rpc.grpc.status_code = tracing::field::Empty, otel.status_code = tracing::field::Empty);
    span.set_parent(parent);
    in_span(span, async move {
        let result = handler(request).await;
        let code = result.as_ref().err().map(|e| e.code() as i32).unwrap_or(0);
        Span::current().record("rpc.grpc.status_code", code);
        if let Err(error) = &result {
            Span::current().record("otel.status_code", "ERROR");
            tracing::error!(%error, "gRPC request failed");
        }
        result
    })
    .await
}
