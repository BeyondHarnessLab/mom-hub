package logger

import (
	"bytes"
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Every server log line is one JSON record: INFO goes to stdout, the other
// levels to stderr, and a request's lines carry its request id.
func TestServerLogLinesAreJSONRecords(t *testing.T) {
	previousWriter, previousErrorWriter := gin.DefaultWriter, gin.DefaultErrorWriter
	t.Cleanup(func() { gin.DefaultWriter, gin.DefaultErrorWriter = previousWriter, previousErrorWriter })

	requestCtx, _ := gin.CreateTestContext(httptest.NewRecorder())
	requestCtx.Set(common.RequestIdKey, "req-1")

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
