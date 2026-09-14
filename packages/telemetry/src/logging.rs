use opentelemetry::trace::TraceContextExt;
use std::fmt;
use tracing::{Event, Subscriber};
use tracing_subscriber::{
    fmt::{FmtContext, FormatEvent, FormatFields, format::Writer},
    registry::LookupSpan,
};

pub struct CorrelatedJson {
    pub service_name: &'static str,
}

impl<S, N> FormatEvent<S, N> for CorrelatedJson
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    N: for<'a> FormatFields<'a> + 'static,
{
    fn format_event(
        &self,
        ctx: &FmtContext<'_, S, N>,
        mut writer: Writer<'_>,
        event: &Event<'_>,
    ) -> fmt::Result {
        let mut buffer = String::new();
        tracing_subscriber::fmt::format()
            .json()
            .flatten_event(true)
            .format_event(ctx, Writer::new(&mut buffer), event)?;
        let mut value: serde_json::Value = serde_json::from_str(&buffer).map_err(|_| fmt::Error)?;
        value["service_name"] = self.service_name.into();
        // Subscriber callbacks cannot re-enter the dispatcher through
        // Span::current(). Read the event's actual parent from the registry.
        if let Some(span) = ctx.event_scope().and_then(|mut scope| scope.next()) {
            let extensions = span.extensions();
            if let Some(data) = extensions.get::<tracing_opentelemetry::OtelData>() {
                let parent = data.parent_cx.span();
                let parent_context = parent.span_context();
                let trace_id = if parent_context.is_valid() {
                    Some(parent_context.trace_id())
                } else {
                    data.builder.trace_id
                };
                if let (Some(trace_id), Some(span_id)) = (trace_id, data.builder.span_id) {
                    value["trace_id"] = trace_id.to_string().into();
                    value["span_id"] = span_id.to_string().into();
                }
            }
        }
        writeln!(writer, "{value}")
    }
}
