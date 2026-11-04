package middleware

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSetUpLoggerMasksQueryCredentials(t *testing.T) {
	previousMode, previousWriter := gin.Mode(), gin.DefaultWriter
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() {
		gin.SetMode(previousMode)
		gin.DefaultWriter = previousWriter
	})

	for _, tc := range []struct{ target, loggedPath string }{
		{"/v1/models?%6bey=first&key=second&API-Key=third&session_token=fourth&alt=sse",
			"/v1/models?API-Key=%2A%2A%2Amasked%2A%2A%2A&alt=sse&key=%2A%2A%2Amasked%2A%2A%2A&session_token=%2A%2A%2Amasked%2A%2A%2A"},
		{"/v1/models%23test%25?key=#secret&alt=#sse",
			"/v1/models%23test%25?alt=%23sse&key=%2A%2A%2Amasked%2A%2A%2A"},
		{"//v1%2Fmodels?key=secret", "//v1%2Fmodels?key=%2A%2A%2Amasked%2A%2A%2A"},
		{"/v1/models?key=bad%ZZ&%ZZ=bad&token=bad;other=true&alt=sse", "/v1/models?alt=sse"},
		{"/v1/models?key=bad%ZZ", "/v1/models?"},
		{"/v1/models?alt=sse&api-version=2024-02-01", "/v1/models?alt=sse&api-version=2024-02-01"},
		{"/v1/models", "/v1/models"},
		{"/%61pi/oauth/test?code=secret&state=secret", "/api/oauth/test"},
	} {
		t.Run(tc.target, func(t *testing.T) {
			var output bytes.Buffer
			gin.DefaultWriter = &output
			router := gin.New()
			SetUpLogger(router)
			request := httptest.NewRequest(http.MethodGet, tc.target, nil)
			originalURL := *request.URL
			router.NoRoute(func(c *gin.Context) {
				assert.Equal(t, originalURL, *c.Request.URL)
				assert.Equal(t, tc.target, c.Request.RequestURI)
				c.Status(http.StatusUnauthorized)
			})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)

			require.Equal(t, http.StatusUnauthorized, response.Code)
			require.Equal(t, 1, strings.Count(output.String(), "\n"))
			var line accessLogLine
			require.NoError(t, common.Unmarshal(output.Bytes(), &line))
			assert.Equal(t, common.LogLevelInfo, line.Level)
			assert.Equal(t, "web", line.Route)
			assert.Equal(t, http.MethodGet, line.Method)
			assert.Equal(t, http.StatusUnauthorized, line.Status)
			assert.Equal(t, tc.loggedPath, line.Path)
			assert.Equal(t, originalURL, *request.URL)
			assert.Equal(t, tc.target, request.RequestURI)
		})
	}
}

func TestSetUpLoggerSkipsSuccessfulHealthChecks(t *testing.T) {
	previousMode, previousWriter := gin.Mode(), gin.DefaultWriter
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() {
		gin.SetMode(previousMode)
		gin.DefaultWriter = previousWriter
	})

	for _, tc := range []struct {
		name, method, target, userAgent string
		status                          int
		logged                          bool
	}{
		{"kubelet probe", http.MethodGet, "/api/status", "kube-probe/1.30", http.StatusOK, false},
		{"failed kubelet probe", http.MethodGet, "/api/status", "kube-probe/1.30", http.StatusServiceUnavailable, true},
		{"load balancer check", http.MethodHead, "/", "", http.StatusOK, false},
		{"failed load balancer check", http.MethodHead, "/", "", http.StatusBadGateway, true},
		{"browser status call", http.MethodGet, "/api/status", "Mozilla/5.0", http.StatusOK, true},
		{"head on other path", http.MethodHead, "/api/status", "", http.StatusOK, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var output bytes.Buffer
			gin.DefaultWriter = &output
			router := gin.New()
			SetUpLogger(router)
			router.NoRoute(func(c *gin.Context) { c.Status(tc.status) })
			request := httptest.NewRequest(tc.method, tc.target, nil)
			request.Header.Set("User-Agent", tc.userAgent)
			router.ServeHTTP(httptest.NewRecorder(), request)

			if !tc.logged {
				assert.Empty(t, output.String())
				return
			}
			var line accessLogLine
			require.NoError(t, common.Unmarshal(output.Bytes(), &line))
			assert.Equal(t, tc.method, line.Method)
			assert.Equal(t, tc.target, line.Path)
			assert.Equal(t, tc.status, line.Status)
		})
	}
}
