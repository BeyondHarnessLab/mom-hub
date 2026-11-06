package metrics

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
	dto "github.com/prometheus/client_model/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/QuantumNous/new-api/relaykit/types"
)

// Labels come from client-controlled input (paths, methods, model names), so
// each must collapse onto a bounded set; otherwise any caller could create
// Prometheus series at will.
func TestLabelsStayBounded(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(Middleware())
	engine.GET("/v1/models/:model", func(c *gin.Context) { c.Status(http.StatusOK) })

	for _, req := range []*http.Request{
		httptest.NewRequest(http.MethodGet, "/v1/models/a", nil),
		httptest.NewRequest(http.MethodGet, "/v1/models/b", nil),
		httptest.NewRequest("PROPFIND", "/random/path/1", nil),
		httptest.NewRequest(http.MethodGet, "/random/path/2", nil),
	} {
		engine.ServeHTTP(httptest.NewRecorder(), req)
	}

	ObserveRelay("nvrouter/fusion@thinking:1024", "success", 2*time.Second, 500*time.Millisecond)
	ObserveRelay("nvrouter/fusion@thinking:2048", "failure", time.Second, 0)
	ObserveUpstreamAttempt(7, nil)
	ObserveUpstreamAttempt(7, types.NewErrorWithStatusCode(assert.AnError, types.ErrorCodeBadResponseStatusCode, http.StatusTooManyRequests))

	sampleCount := func(observer prometheus.Observer) uint64 {
		var m dto.Metric
		require.NoError(t, observer.(prometheus.Metric).Write(&m))
		return m.GetHistogram().GetSampleCount()
	}

	assert.Equal(t, 3, testutil.CollectAndCount(httpRequestDuration))
	assert.EqualValues(t, 2, sampleCount(httpRequestDuration.WithLabelValues("GET", "/v1/models/:model", "200")))
	assert.EqualValues(t, 1, sampleCount(httpRequestDuration.WithLabelValues("other", "unmatched", "404")))
	assert.EqualValues(t, 1, sampleCount(httpRequestDuration.WithLabelValues("GET", "unmatched", "404")))
	assert.Zero(t, testutil.ToFloat64(httpRequestsInFlight))

	assert.Equal(t, 2, testutil.CollectAndCount(relayRequestDuration))
	assert.EqualValues(t, 1, sampleCount(relayRequestDuration.WithLabelValues("nvrouter/fusion", "success")))
	assert.EqualValues(t, 1, sampleCount(relayRequestDuration.WithLabelValues("nvrouter/fusion", "failure")))
	assert.Equal(t, 1, testutil.CollectAndCount(relayTTFT))
	assert.EqualValues(t, 1, sampleCount(relayTTFT.WithLabelValues("nvrouter/fusion")))

	assert.Equal(t, 1.0, testutil.ToFloat64(upstreamAttempts.WithLabelValues("7", "200")))
	assert.Equal(t, 1.0, testutil.ToFloat64(upstreamAttempts.WithLabelValues("7", "429")))
}
