use opentelemetry::{KeyValue, global};
use opentelemetry_otlp::{ExportConfig, WithExportConfig};
use opentelemetry_sdk::{
    Resource,
    metrics::{MeterProviderBuilder, PeriodicReader},
    trace::{Config, TracerProvider},
};
use std::time::Duration;
use tracing_subscriber::{EnvFilter, Registry, layer::SubscriberExt, util::SubscriberInitExt};

pub fn init_telemetry(service_name: &'static str) {
    let endpoint = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
        .unwrap_or_else(|_| "http://localhost:4317".to_string());

    let resource = Resource::new(vec![KeyValue::new("service.name", service_name)]);

    // 1. Initialize OTLP Tracer (for traces)
    let tracer = opentelemetry_otlp::new_pipeline()
        .tracing()
        .with_exporter(
            opentelemetry_otlp::new_exporter()
                .tonic()
                .with_endpoint(&endpoint),
        )
        .with_trace_config(Config::default().with_resource(resource.clone()))
        .install_batch(opentelemetry_sdk::runtime::Tokio)
        .expect("Failed to initialize OTLP tracer");

    // 2. Initialize OTLP Metrics Reader (for metrics)
    let metrics_exporter = opentelemetry_otlp::new_exporter()
        .tonic()
        .with_endpoint(&endpoint)
        .build_metrics_exporter(
            Box::new(opentelemetry_sdk::metrics::reader::DefaultAggregationSelector::new()),
            Box::new(opentelemetry_sdk::metrics::reader::DefaultTemporalitySelector::new()),
        )
        .expect("Failed to create metrics exporter");

    let metrics_reader =
        PeriodicReader::builder(metrics_exporter, opentelemetry_sdk::runtime::Tokio)
            .with_interval(Duration::from_secs(10))
            .build();

    let meter_provider = MeterProviderBuilder::default()
        .with_resource(resource)
        .with_reader(metrics_reader)
        .build();

    global::set_meter_provider(meter_provider);

    // 3. Setup Tracing Subscriber to hook into standard Rust `tracing` macros
    let telemetry = tracing_opentelemetry::layer().with_tracer(tracer);

    // Set up standard stdout formatting as well for local viewing
    let fmt_layer = tracing_subscriber::fmt::layer().with_target(false);

    // Respect RUST_LOG environment variable for filtering log levels
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    Registry::default()
        .with(filter)
        .with(fmt_layer)
        .with(telemetry)
        .init();

    tracing::info!(
        "Telemetry initialized successfully for {} pushing to {}",
        service_name,
        endpoint
    );
}
