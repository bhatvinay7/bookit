use opentelemetry::{KeyValue, trace::TracerProvider as _};
use opentelemetry_sdk::{
    Resource,
    export::trace::{ExportResult, SpanData, SpanExporter},
    trace::TracerProvider,
};
use std::{
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
    task::{Context, Poll},
};
use tower_layer::Layer;
use tower_service::Service;
use tracing_subscriber::prelude::*;

#[derive(Clone, Debug, Default)]
struct Exporter(Arc<Mutex<Vec<SpanData>>>);
impl SpanExporter for Exporter {
    fn export(
        &mut self,
        spans: Vec<SpanData>,
    ) -> Pin<Box<dyn Future<Output = ExportResult> + Send + 'static>> {
        self.0.lock().unwrap().extend(spans);
        Box::pin(async { Ok(()) })
    }
}

#[derive(Clone, Default)]
struct Logs(Arc<Mutex<Vec<u8>>>);
impl std::io::Write for Logs {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[derive(Clone)]
struct Backend;
impl Service<http::Request<()>> for Backend {
    type Response = http::Response<()>;
    type Error = std::convert::Infallible;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;
    fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }
    fn call(&mut self, _: http::Request<()>) -> Self::Future {
        Box::pin(async {
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
            let mut response = http::Response::new(());
            *response.status_mut() = http::StatusCode::INTERNAL_SERVER_ERROR;
            crate::inject_headers(response.headers_mut());
            Ok(response)
        })
    }
}

#[tokio::test(flavor = "current_thread")]
async fn concurrent_requests_preserve_parents_errors_latency_and_log_ids() {
    let exporter = Exporter::default();
    let provider = TracerProvider::builder()
        .with_simple_exporter(exporter.clone())
        .with_config(
            opentelemetry_sdk::trace::Config::default()
                .with_resource(Resource::new(vec![KeyValue::new("service.name", "test")])),
        )
        .build();
    let logs = Logs::default();
    let writer = logs.clone();
    let subscriber = tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new("info"))
        .with(
            tracing_subscriber::fmt::layer()
                .json()
                .with_writer(move || writer.clone())
                .event_format(crate::logging::CorrelatedJson {
                    service_name: "test",
                }),
        )
        .with(tracing_opentelemetry::layer().with_tracer(provider.tracer("test")));
    let _guard = tracing::subscriber::set_default(subscriber);
    let layer = crate::HttpTraceLayer::new(|_| Some("/orders/{id}".into()));
    let mut one = layer.layer(Backend);
    let mut two = layer.layer(Backend);
    let request = |id: &str| {
        http::Request::builder()
            .uri("/orders/123?token=private")
            .header("traceparent", format!("00-{id}-1111111111111111-01"))
            .body(())
            .unwrap()
    };
    let id_one = "11111111111111111111111111111111";
    let id_two = "22222222222222222222222222222222";
    let (a, b) = tokio::join!(one.call(request(id_one)), two.call(request(id_two)));
    assert!(
        a.unwrap().headers()["traceparent"]
            .to_str()
            .unwrap()
            .contains(id_one)
    );
    assert!(
        b.unwrap().headers()["traceparent"]
            .to_str()
            .unwrap()
            .contains(id_two)
    );
    for result in provider.force_flush() {
        result.unwrap();
    }
    let spans = exporter.0.lock().unwrap();
    assert_eq!(spans.len(), 2);
    for span in spans.iter() {
        assert_eq!(span.name, "GET /orders/{id}");
        assert_eq!(span.parent_span_id.to_string(), "1111111111111111");
        assert!(
            span.end_time
                .duration_since(span.start_time)
                .unwrap()
                .as_millis()
                >= 5
        );
        assert!(matches!(
            span.status,
            opentelemetry::trace::Status::Error { .. }
        ));
    }
    let output = String::from_utf8(logs.0.lock().unwrap().clone()).unwrap();
    assert!(!output.contains("token=private"));
    let entries: Vec<serde_json::Value> = output
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    for span in spans.iter() {
        assert!(
            entries.iter().any(|entry| entry["trace_id"]
                == span.span_context.trace_id().to_string()
                && entry["span_id"] == span.span_context.span_id().to_string()
                && entry["level"] == "ERROR"),
            "missing correlation: {output}"
        );
    }
}

#[tokio::test(flavor = "current_thread")]
async fn grpc_and_durable_carriers_join_the_same_trace() {
    let exporter = Exporter::default();
    let provider = TracerProvider::builder()
        .with_simple_exporter(exporter.clone())
        .build();
    let logs = Logs::default();
    let writer = logs.clone();
    let _guard = tracing::subscriber::set_default(
        tracing_subscriber::registry()
            .with(
                tracing_subscriber::fmt::layer()
                    .json()
                    .with_writer(move || writer.clone())
                    .event_format(crate::logging::CorrelatedJson {
                        service_name: "test",
                    }),
            )
            .with(tracing_opentelemetry::layer().with_tracer(provider.tracer("test"))),
    );
    let parent = crate::operation_span("origin", "server", None);
    let parent_id = parent.id().unwrap();
    let carrier = crate::in_span(parent, async {
        assert_eq!(tracing::Span::current().id().unwrap(), parent_id);
        let mut request = tonic::Request::new(());
        crate::inject_grpc(&mut request);
        let result: Result<tonic::Response<()>, _> =
            crate::grpc_request(request, "test.Service", "Fail", |_| async {
                Err(tonic::Status::unavailable("downstream failed"))
            })
            .await;
        assert!(result.is_err());
        let payload = serde_json::json!({"_trace_context": crate::current_carrier()});
        crate::payload_carrier(&payload)
    })
    .await;
    let span = crate::operation_span("outbox", "producer", Some(crate::extract_context(&carrier)));
    let result: Result<(), &str> =
        crate::in_result_span(span, async { Err("publish failed") }).await;
    assert!(result.is_err());
    for result in provider.force_flush() {
        result.unwrap();
    }
    let spans = exporter.0.lock().unwrap();
    let origin = spans.iter().find(|span| span.name == "origin").unwrap();
    assert_eq!(spans.len(), 3);
    for span in spans.iter().filter(|span| span.name != "origin") {
        assert_eq!(span.span_context.trace_id(), origin.span_context.trace_id());
        assert_eq!(span.parent_span_id, origin.span_context.span_id());
        assert!(matches!(
            span.status,
            opentelemetry::trace::Status::Error { .. }
        ));
    }
    let output = String::from_utf8(logs.0.lock().unwrap().clone()).unwrap();
    let entries: Vec<serde_json::Value> = output
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    for span in spans.iter() {
        assert!(entries.iter().any(|entry| entry["trace_id"]
            == span.span_context.trace_id().to_string()
            && entry["span_id"] == span.span_context.span_id().to_string()));
    }
}
