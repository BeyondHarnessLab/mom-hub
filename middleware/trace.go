package middleware

import (
	"context"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
	semconv "go.opentelemetry.io/otel/semconv/v1.39.0"
	"go.opentelemetry.io/otel/trace"
)

// Trace records a relay request as the server span the upstream call (and so
// mom) continues. The span is put on c.Request's context: a *gin.Context
// hands out only its own keys, so code that needs the span reads it from
// c.Request.Context().
//
// mom-hub is the public entry point, so the span always starts a new trace. A
// caller's own traceparent is kept only as a link: honoring it would let the
// caller choose mom-hub's trace IDs and sampling.
func Trace() gin.HandlerFunc {
	tracer := otel.Tracer("github.com/QuantumNous/new-api/middleware")
	return func(c *gin.Context) {
		route := c.FullPath()
		options := []trace.SpanStartOption{trace.WithSpanKind(trace.SpanKindServer), trace.WithNewRoot()}
		callerCtx := propagation.TraceContext{}.Extract(context.Background(), propagation.HeaderCarrier(c.Request.Header))
		if caller := trace.SpanContextFromContext(callerCtx); caller.IsValid() {
			options = append(options, trace.WithLinks(trace.Link{SpanContext: caller}))
		}
		ctx, span := tracer.Start(c.Request.Context(), c.Request.Method+" "+route, options...)
		defer span.End()
		c.Request = c.Request.WithContext(ctx)

		c.Next()

		status := c.Writer.Status()
		span.SetAttributes(
			semconv.HTTPRequestMethodKey.String(c.Request.Method),
			semconv.HTTPRoute(route),
			semconv.HTTPResponseStatusCode(status),
			attribute.String("request_id", c.GetString(common.RequestIdKey)),
			attribute.Int("user.id", common.GetContextKeyInt(c, constant.ContextKeyUserId)),
			attribute.Int("token.id", common.GetContextKeyInt(c, constant.ContextKeyTokenId)),
			attribute.String("group", common.GetContextKeyString(c, constant.ContextKeyUsingGroup)),
			attribute.String("model", common.GetContextKeyString(c, constant.ContextKeyOriginalModel)),
		)
		if status >= 500 {
			span.SetStatus(codes.Error, "")
		}
	}
}
