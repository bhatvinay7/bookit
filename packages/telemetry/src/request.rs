use http::{Request, Response};
use std::{
    future::Future,
    pin::Pin,
    task::{Context, Poll},
    time::Instant,
};
use tower_layer::Layer;
use tower_service::Service;
use tracing::{Instrument, Span};
use tracing_opentelemetry::OpenTelemetrySpanExt;

type RouteName = fn(&http::Extensions) -> Option<String>;

#[derive(Clone, Copy)]
pub struct HttpTraceLayer {
    route: RouteName,
}
impl HttpTraceLayer {
    pub fn new(route: RouteName) -> Self {
        Self { route }
    }
}
impl<S> Layer<S> for HttpTraceLayer {
    type Service = HttpTraceService<S>;
    fn layer(&self, inner: S) -> Self::Service {
        HttpTraceService {
            inner,
            route: self.route,
        }
    }
}

#[derive(Clone)]
pub struct HttpTraceService<S> {
    inner: S,
    route: RouteName,
}

impl<S, B, R> Service<Request<B>> for HttpTraceService<S>
where
    S: Service<Request<B>, Response = Response<R>>,
    S::Future: Send + 'static,
    S::Error: std::fmt::Display + Send + 'static,
    R: Send + 'static,
{
    type Response = Response<R>;
    type Error = S::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;
    fn poll_ready(&mut self, ctx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(ctx)
    }
    fn call(&mut self, request: Request<B>) -> Self::Future {
        let route = (self.route)(request.extensions()).unwrap_or_else(|| "unmatched".into());
        let method = request.method().as_str();
        let span = tracing::info_span!("http.request", otel.name = %format!("{method} {route}"), otel.kind = "server",
            http.request.method = method, http.route = route, http.response.status_code = tracing::field::Empty,
            otel.status_code = tracing::field::Empty);
        span.set_parent(crate::extract_context(&crate::HeaderExtractor(
            request.headers(),
        )));
        let start = Instant::now();
        let future = {
            let _entered = span.enter();
            self.inner.call(request)
        };
        Box::pin(
            async move {
                let result = future.await;
                let duration_ms = start.elapsed().as_secs_f64() * 1000.0;
                match &result {
                    Ok(response) => {
                        let status = response.status().as_u16();
                        Span::current().record("http.response.status_code", status);
                        if response.status().is_server_error() {
                            Span::current().record("otel.status_code", "ERROR");
                            tracing::error!(status, duration_ms, "HTTP request failed");
                        } else {
                            tracing::info!(status, duration_ms, "HTTP request completed");
                        }
                    }
                    Err(error) => {
                        Span::current().record("otel.status_code", "ERROR");
                        tracing::error!(%error, duration_ms, "HTTP service failed");
                    }
                }
                result
            }
            .instrument(span),
        )
    }
}
