import { registerOTel } from "@vercel/otel";
import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import type { Instrumentation } from "next";

export function register() {
  registerOTel({
    serviceName: "bookit-web",
    spanProcessors: [
      "auto",
      {
        onStart() {},
        onEnd(span) {
          if (span.kind !== SpanKind.SERVER) return;
          const { traceId, spanId } = span.spanContext();
          console.log(JSON.stringify({
            service_name: "bookit-web",
            level: span.status.code === SpanStatusCode.ERROR ? "ERROR" : "INFO",
            message: "HTTP request completed",
            trace_id: traceId,
            span_id: spanId,
            route: span.attributes["http.route"],
            status: span.attributes["http.status_code"],
            duration_ms: span.duration[0] * 1000 + span.duration[1] / 1e6,
          }));
        },
        async forceFlush() {},
        async shutdown() {},
      },
    ],
  });
}

export const onRequestError: Instrumentation.onRequestError = (error, _request, context) => {
  const activeSpan = trace.getActiveSpan();
  const spanContext = activeSpan?.spanContext();
  activeSpan?.setStatus({ code: SpanStatusCode.ERROR });
  console.error(JSON.stringify({
    service_name: "bookit-web",
    level: "ERROR",
    message: error instanceof Error ? error.message : String(error),
    route: context.routePath,
    trace_id: spanContext?.traceId,
    span_id: spanContext?.spanId,
  }));
};
