// Package metrics holds mom-hub's Prometheus collectors. They live on the
// default registry, so the exposition also carries the Go runtime and process
// collectors. main serves it on METRICS_PORT, a listener separate from the
// public one, because the console's Ingress forwards every path of PORT.
//
// Every label is bounded: routes are gin route templates, models are
// routing-normalized names that already passed channel selection, and channels
// are ids. Identity (user, token, key) never becomes a label.
package metrics

import (
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

const namespace = "mom_hub"

// httpBuckets spans management API calls (milliseconds) through relay
// streams, which run up to STREAMING_TIMEOUT (900s in the SV deployment).
var httpBuckets = []float64{0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600, 900}

// relayBuckets are finer where relay requests actually finish: a fusion
// request takes tens of seconds, so httpBuckets' 10s-30s step would blur its
// percentiles.
var relayBuckets = []float64{0.5, 1, 2, 3, 5, 8, 13, 20, 30, 45, 60, 90, 120, 180, 300, 600, 900}

var (
	httpRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: namespace,
		Subsystem: "http",
		Name:      "request_duration_seconds",
		Help:      "HTTP request duration by gin route template. SSE responses count until the stream ends.",
		Buckets:   httpBuckets,
	}, []string{"method", "route", "status"})

	httpRequestsInFlight = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: namespace,
		Subsystem: "http",
		Name:      "requests_in_flight",
		Help:      "HTTP requests currently being served, open streams included.",
	})

	relayRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: namespace,
		Subsystem: "relay",
		Name:      "request_duration_seconds",
		Help:      "Relay request duration across all retries. outcome is success, failure, or ignored (client cancellation or a rejected request, left out of success rates).",
		Buckets:   relayBuckets,
	}, []string{"model", "outcome"})

	relayTTFT = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: namespace,
		Subsystem: "relay",
		Name:      "ttft_seconds",
		Help:      "Time from receiving a streaming relay request to sending its first response bytes.",
		Buckets:   []float64{0.25, 0.5, 1, 2, 3, 5, 8, 13, 20, 30, 45, 60, 120, 300},
	}, []string{"model"})

	upstreamAttempts = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: namespace,
		Subsystem: "relay",
		Name:      "upstream_attempts_total",
		Help:      "Relay attempts by channel. Each retry is one attempt; status_code is 200 for an attempt that returned no error.",
	}, []string{"channel_id", "status_code"})
)

// Middleware records every request on the main listener. It must be the
// outermost middleware so a panic recovered further in is still counted as a
// 500. Requests that match no route (the console's static files and SPA paths)
// share the route "unmatched", and methods outside the standard set share
// "other", so arbitrary requests cannot create series.
func Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		httpRequestsInFlight.Inc()
		defer httpRequestsInFlight.Dec()

		c.Next()

		route := c.FullPath()
		if route == "" {
			route = "unmatched"
		}
		method := c.Request.Method
		switch method {
		case http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodPatch,
			http.MethodDelete, http.MethodOptions:
		default:
			method = "other"
		}
		httpRequestDuration.WithLabelValues(method, route, strconv.Itoa(c.Writer.Status())).
			Observe(time.Since(start).Seconds())
	}
}

// ObserveRelay records one finished relay request. outcome is the
// perf_metrics classification, so success rates match the console's
// performance page. ttft is zero when the request is not a stream or sent
// nothing. Reasoning modifiers are stripped from model, as in channel
// selection.
func ObserveRelay(model, outcome string, latency, ttft time.Duration) {
	model = ratio_setting.RoutingMatchModelName(model)
	relayRequestDuration.WithLabelValues(model, outcome).Observe(latency.Seconds())
	if ttft > 0 {
		relayTTFT.WithLabelValues(model).Observe(ttft.Seconds())
	}
}

// ObserveUpstreamAttempt records one relay attempt on a channel. apiErr is
// the attempt's result; nil counts as status 200.
func ObserveUpstreamAttempt(channelID int, apiErr *types.NewAPIError) {
	status := http.StatusOK
	if apiErr != nil {
		status = apiErr.StatusCode
	}
	upstreamAttempts.WithLabelValues(strconv.Itoa(channelID), strconv.Itoa(status)).Inc()
}
