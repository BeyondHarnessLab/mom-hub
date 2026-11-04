package middleware

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel/trace"
)

const RouteTagKey = "route_tag"

// accessLogLine is the JSON log record of one HTTP request, sharing ts, level
// and request_id with the other server log records.
type accessLogLine struct {
	Time      string  `json:"ts"`
	Level     string  `json:"level"`
	RequestID string  `json:"request_id,omitempty"`
	TraceID   string  `json:"trace_id,omitempty"`
	Route     string  `json:"route"`
	Method    string  `json:"method"`
	Path      string  `json:"path"`
	Status    int     `json:"status"`
	LatencyMs float64 `json:"latency_ms"`
	ClientIP  string  `json:"client_ip"`
}

func RouteTag(tag string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(RouteTagKey, tag)
		c.Next()
	}
}

func SetUpLogger(server *gin.Engine) {
	server.Use(redactTaskArtifactAccessQuery())
	server.Use(gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		// Successful kubelet probes and load balancer health checks (HEAD /)
		// arrive every few seconds per pod; failed ones are still logged.
		isProbe := strings.HasPrefix(param.Request.UserAgent(), "kube-probe/") ||
			(param.Method == http.MethodHead && param.Request.URL.Path == "/")
		if isProbe && param.StatusCode < 400 {
			return ""
		}
		var requestID string
		if param.Keys != nil {
			requestID, _ = param.Keys[common.RequestIdKey].(string)
		}
		tag, _ := param.Keys[RouteTagKey].(string)
		if tag == "" {
			tag = "web"
		}
		path := param.Path
		// OAuth callbacks carry one-time codes and state in the query string.
		// Redact the log value only; the handler still needs the original query.
		if strings.HasPrefix(path, "/api/oauth/") || strings.HasPrefix(path, "/oauth/") {
			path, _, _ = strings.Cut(path, "?")
		} else if param.Request.URL.RawQuery != "" {
			query := param.Request.URL.Query().Encode()
			path = param.Request.URL.EscapedPath() + relaycommon.SanitizeURLForLog("?"+query)
		}
		var traceID string
		if span := trace.SpanContextFromContext(param.Request.Context()); span.IsValid() {
			traceID = span.TraceID().String()
		}
		line, err := common.Marshal(accessLogLine{
			Time:      param.TimeStamp.Format(common.LogTimeFormat),
			Level:     common.LogLevelInfo,
			RequestID: requestID,
			TraceID:   traceID,
			Route:     tag,
			Method:    param.Method,
			Path:      path,
			Status:    param.StatusCode,
			LatencyMs: float64(param.Latency.Microseconds()) / 1000,
			ClientIP:  param.ClientIP,
		})
		if err != nil {
			return ""
		}
		return string(line) + "\n"
	}))
}
