use opentelemetry::{KeyValue, global};
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::propagation::TraceContextPropagator;
use opentelemetry_sdk::{
    Resource,
    metrics::{MeterProviderBuilder, PeriodicReader},
    trace::Config,
};
use std::time::Duration;
use tracing_subscriber::{EnvFilter, Registry, layer::SubscriberExt, util::SubscriberInitExt};

pub fn init_telemetry(service_name: &'static str) {
    let endpoint = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
        .unwrap_or_else(|_| "http://localhost:4317".to_string());

    // Kubernetes supplies BOOKIT_ENVIRONMENT through bookit-config. Local
    // dotenv files use APP_MODE, while the web runtime convention is NODE_ENV.
    let environment = std::env::var("BOOKIT_ENVIRONMENT")
        .or_else(|_| std::env::var("APP_MODE"))
        .or_else(|_| std::env::var("NODE_ENV"))
        .unwrap_or_else(|_| "local".into());
    // BOOKIT_REGION is set by each regional Kustomize overlay. A local process
    // has no deployment region and should be labelled local rather than using
    // DEPLOY_REGIONS, which may contain a comma-separated cluster list.
    let region = std::env::var("BOOKIT_REGION").unwrap_or_else(|_| "local".into());
    let resource = Resource::new(vec![
        KeyValue::new("service.name", service_name),
        KeyValue::new("deployment.environment", environment),
        KeyValue::new("cloud.region", region),
    ]);

    global::set_text_map_propagator(TraceContextPropagator::new());

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

    // Emit one JSON object per line for the Kubernetes CRI log collector.
    let fmt_layer = tracing_subscriber::fmt::layer()
        .json()
        .flatten_event(true)
        .with_current_span(true)
        .with_span_list(true)
        .with_target(true);

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
