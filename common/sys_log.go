package common

import (
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// LogWriterMu protects concurrent access to gin.DefaultWriter/gin.DefaultErrorWriter
// during log file rotation. Acquire RLock when reading/writing through the writers,
// acquire Lock when swapping writers and closing old files.
var LogWriterMu sync.RWMutex

const (
	LogLevelDebug = "DEBUG"
	LogLevelInfo  = "INFO"
	LogLevelWarn  = "WARN"
	LogLevelError = "ERROR"
	LogLevelFatal = "FATAL"
)

// LogTimeFormat is the ts layout of every server log line: RFC 3339 with
// milliseconds and the UTC offset, so a log collector reads the instant
// without assuming a time zone.
const LogTimeFormat = "2006-01-02T15:04:05.000Z07:00"

// LogRecord is one server log record. Every record is a single JSON object on
// its own line, so a log collector indexes its fields instead of parsing text.
type LogRecord struct {
	Time      string `json:"ts"`
	Level     string `json:"level"`
	RequestID string `json:"request_id,omitempty"`
	Message   string `json:"msg"`
}

// WriteLogLine writes msg to w as one JSON log record in a single Write, so
// concurrent records do not interleave. A newline inside msg stays inside the
// JSON string: a multi-line message is still one record.
func WriteLogLine(w io.Writer, level string, requestID string, msg string) {
	line, err := Marshal(LogRecord{
		Time:      time.Now().Format(LogTimeFormat),
		Level:     level,
		RequestID: requestID,
		Message:   msg,
	})
	if err != nil {
		return
	}
	_, _ = w.Write(append(line, '\n'))
}

// StdLogWriter turns each line written through the standard library's log
// package (by this code, net/http or third-party packages) into a JSON log
// record. Those lines carry no level and are mostly warnings or errors, so
// they are recorded as WARN.
type StdLogWriter struct{}

func (StdLogWriter) Write(p []byte) (int, error) {
	WriteLogLine(os.Stderr, LogLevelWarn, "", strings.TrimSuffix(string(p), "\n"))
	return len(p), nil
}

func SysLog(s string) {
	LogWriterMu.RLock()
	WriteLogLine(gin.DefaultWriter, LogLevelInfo, "", s)
	LogWriterMu.RUnlock()
}

func SysError(s string) {
	LogWriterMu.RLock()
	WriteLogLine(gin.DefaultErrorWriter, LogLevelError, "", s)
	LogWriterMu.RUnlock()
}

func FatalLog(v ...any) {
	LogWriterMu.RLock()
	WriteLogLine(gin.DefaultErrorWriter, LogLevelFatal, "", fmt.Sprint(v...))
	LogWriterMu.RUnlock()
	os.Exit(1)
}

func LogStartupSuccess(startTime time.Time, port string) {
	duration := time.Since(startTime)
	durationMs := duration.Milliseconds()

	// Get network IPs
	networkIps := GetNetworkIps()

	LogWriterMu.RLock()
	defer LogWriterMu.RUnlock()

	if !SessionCookieSecure {
		// Warn when the local HTTP compatibility mode disables cookie transport
		// security and refresh/logout Origin validation.
		WriteLogLine(gin.DefaultWriter, LogLevelWarn, "", LogText("Warning: Refresh cookie is not secure and refresh/logout Origin validation is disabled. Please set SESSION_COOKIE_SECURE=true in production."))
	}

	WriteLogLine(gin.DefaultWriter, LogLevelInfo, "", fmt.Sprintf("%s %s %s", SystemName, Version, LogText("ready in %d ms", durationMs)))

	if !IsRunningInContainer() {
		WriteLogLine(gin.DefaultWriter, LogLevelInfo, "", fmt.Sprintf("%s http://localhost:%s/", LogText("Local:"), port))
	}

	for _, ip := range networkIps {
		WriteLogLine(gin.DefaultWriter, LogLevelInfo, "", fmt.Sprintf("%s http://%s:%s/", LogText("Network:"), ip, port))
	}
}
