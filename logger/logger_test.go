package logger

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/trace"
)

// Every server log line is one JSON record: INFO goes to stdout, the other
// levels to stderr, and a request's lines carry its request id and, for a
// traced relay request, its trace and span ids.
func TestServerLogLinesAreJSONRecords(t *testing.T) {
	previousWriter, previousErrorWriter := gin.DefaultWriter, gin.DefaultErrorWriter
	t.Cleanup(func() { gin.DefaultWriter, gin.DefaultErrorWriter = previousWriter, previousErrorWriter })

	requestCtx, _ := gin.CreateTestContext(httptest.NewRecorder())
	requestCtx.Set(common.RequestIdKey, "req-1")

	traceID, err := trace.TraceIDFromHex("4bf92f3577b34da6a3ce929d0e0e4736")
	require.NoError(t, err)
	spanID, err := trace.SpanIDFromHex("00f067aa0ba902b7")
	require.NoError(t, err)
	spanCtx := trace.NewSpanContext(trace.SpanContextConfig{TraceID: traceID, SpanID: spanID, TraceFlags: trace.FlagsSampled})
	tracedCtx, _ := gin.CreateTestContext(httptest.NewRecorder())
	tracedCtx.Set(common.RequestIdKey, "req-2")
	tracedCtx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil).
		WithContext(trace.ContextWithSpanContext(context.Background(), spanCtx))

	for _, tc := range []struct {
		name     string
		write    func()
		toStderr bool
		want     common.LogRecord
	}{
		{"request info", func() { LogInfo(requestCtx, "first line\nsecond line") }, false,
			common.LogRecord{Level: "INFO", RequestID: "req-1", Message: "first line\nsecond line"}},
		{"request warning", func() { LogWarn(requestCtx, "retry %d", 2) }, true,
			common.LogRecord{Level: "WARN", RequestID: "req-1", Message: "retry 2"}},
		{"traced relay request", func() { LogError(tracedCtx, "upstream failed") }, true,
			common.LogRecord{Level: "ERROR", RequestID: "req-2", TraceID: "4bf92f3577b34da6a3ce929d0e0e4736", SpanID: "00f067aa0ba902b7", Message: "upstream failed"}},
		{"error outside a request", func() { LogError(context.Background(), "failed") }, true,
			common.LogRecord{Level: "ERROR", Message: "failed"}},
		{"system log", func() { common.SysLog("started") }, false,
			common.LogRecord{Level: "INFO", Message: "started"}},
		{"system error", func() { common.SysError("stopped") }, true,
			common.LogRecord{Level: "ERROR", Message: "stopped"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			gin.DefaultWriter, gin.DefaultErrorWriter = &stdout, &stderr
			tc.write()

			written, untouched := stdout.String(), stderr.String()
			if tc.toStderr {
				written, untouched = untouched, written
			}
			assert.Empty(t, untouched)
			require.Equal(t, 1, strings.Count(written, "\n"))
			var got common.LogRecord
			require.NoError(t, common.Unmarshal([]byte(written), &got))
			_, err := time.Parse(common.LogTimeFormat, got.Time)
			require.NoError(t, err)
			got.Time = ""
			assert.Equal(t, tc.want, got)
		})
	}
}
