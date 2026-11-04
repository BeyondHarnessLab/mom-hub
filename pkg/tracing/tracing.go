// Package tracing installs mom-hub's OpenTelemetry tracer provider. It follows
// mom's pkg/trace: the same environment variables name the same collector, so
// a relay request's spans and the spans mom records for it land in one trace.
package tracing

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.39.0"
	"google.golang.org/grpc/credentials"
)

// Init installs the tracer provider and the W3C trace-context propagator, and
// returns the function that flushes pending spans on shutdown.
//
// mom-hub is where every relay trace starts, so every trace is kept: mom
// samples by its parent and records its part of a trace only when mom-hub
// kept it.
//
// Without OTEL_EXPORT_ENDPOINT nothing is exported, but spans still get IDs
// and the upstream request still carries traceparent. When the exporter
// cannot be built, the error is returned and the provider is installed
// without it.
func Init(serviceName string) (func(context.Context) error, error) {
	options := []sdktrace.TracerProviderOption{
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
		sdktrace.WithResource(resource.NewSchemaless(
			semconv.ServiceName(serviceName),
			// mom names the environment under this older key; keeping it lets
			// one SigNoz filter select both services.
			attribute.String("deployment.environment", os.Getenv("ENV")),
		)),
	}
	var exportErr error
	if endpoint := os.Getenv("OTEL_EXPORT_ENDPOINT"); endpoint != "" {
		exporter, err := newExporter(endpoint)
		if err != nil {
			exportErr = err
		} else {
			options = append(options, sdktrace.WithBatcher(exporter))
		}
	}
	provider := sdktrace.NewTracerProvider(options...)
	otel.SetTracerProvider(provider)
	otel.SetTextMapPropagator(propagation.TraceContext{})
	return provider.Shutdown, exportErr
}

// newExporter dials the collector over gRPC, in plaintext unless the
// deployment names TLS files. OTEL_EXPORTER_OTLP_HEADERS is read by the SDK.
func newExporter(endpoint string) (sdktrace.SpanExporter, error) {
	security := otlptracegrpc.WithInsecure()
	tlsConfig, err := exporterTLS()
	if err != nil {
		return nil, err
	}
	if tlsConfig != nil {
		security = otlptracegrpc.WithTLSCredentials(credentials.NewTLS(tlsConfig))
	}
	return otlptracegrpc.New(context.Background(),
		security,
		otlptracegrpc.WithCompressor("gzip"),
		otlptracegrpc.WithEndpoint(endpoint),
	)
}

// exporterTLS builds the exporter's TLS config from the OTLP SDK's own variable
// names, or returns nil when none is set. It builds the config itself because
// the SDK's would never send the client certificate to the overseas public
// collector: Go offers a configured certificate only when the server's request
// names its issuer, and that collector names the certificate itself (CN=pplabs)
// instead, so the handshake ends in "certificate required". Here the
// certificate is sent whatever the request names.
//
// An unreadable file is an error rather than the SDK's one log line, after
// which it dials on without the file and drops every span.
func exporterTLS() (*tls.Config, error) {
	caFile := os.Getenv("OTEL_EXPORTER_OTLP_CERTIFICATE")
	certFile := os.Getenv("OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE")
	keyFile := os.Getenv("OTEL_EXPORTER_OTLP_CLIENT_KEY")
	if caFile == "" && certFile == "" && keyFile == "" {
		return nil, nil
	}
	cfg := &tls.Config{}
	if caFile != "" {
		pem, err := os.ReadFile(caFile)
		if err != nil {
			return nil, fmt.Errorf("read OTLP CA certificate: %w", err)
		}
		cfg.RootCAs = x509.NewCertPool()
		if !cfg.RootCAs.AppendCertsFromPEM(pem) {
			return nil, fmt.Errorf("OTLP CA certificate %s holds no PEM certificate", caFile)
		}
	}
	if certFile != "" || keyFile != "" {
		cert, err := tls.LoadX509KeyPair(certFile, keyFile)
		if err != nil {
			return nil, fmt.Errorf("load OTLP client certificate: %w", err)
		}
		cfg.GetClientCertificate = func(*tls.CertificateRequestInfo) (*tls.Certificate, error) {
			return &cert, nil
		}
	}
	return cfg, nil
}
