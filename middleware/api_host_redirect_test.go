package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestApiHostRedirect(t *testing.T) {
	previousAPI, previousServer := system_setting.ApiAddress, system_setting.ServerAddress
	t.Cleanup(func() {
		system_setting.ApiAddress, system_setting.ServerAddress = previousAPI, previousServer
	})

	tests := []struct {
		name          string
		apiAddress    string
		serverAddress string
		method        string
		host          string
		target        string
		location      string // empty: the request reaches the console handler
	}{
		{name: "console page on the API host keeps path and query", apiAddress: "https://api.example.com", serverAddress: "https://console.example.com/", method: http.MethodGet, host: "api.example.com", target: "/keys?p=2", location: "https://console.example.com/keys?p=2"},
		{name: "host match ignores case and the default port", apiAddress: "https://api.example.com/", serverAddress: "https://console.example.com", method: http.MethodGet, host: "API.Example.com:443", target: "/", location: "https://console.example.com/"},
		{name: "relay path on the API host passes", apiAddress: "https://api.example.com", serverAddress: "https://console.example.com", method: http.MethodGet, host: "api.example.com", target: "/v1/unknown"},
		{name: "console API path on the API host passes", apiAddress: "https://api.example.com", serverAddress: "https://console.example.com", method: http.MethodGet, host: "api.example.com", target: "/api/unknown"},
		{name: "HEAD health check on the API host passes", apiAddress: "https://api.example.com", serverAddress: "https://console.example.com", method: http.MethodHead, host: "api.example.com", target: "/"},
		{name: "console host passes", apiAddress: "https://api.example.com", serverAddress: "https://console.example.com", method: http.MethodGet, host: "console.example.com", target: "/keys"},
		{name: "different port on the API hostname passes", apiAddress: "http://localhost:3001", serverAddress: "http://localhost:3000", method: http.MethodGet, host: "localhost:3000", target: "/keys"},
		{name: "empty API Address passes", serverAddress: "https://console.example.com", method: http.MethodGet, host: "api.example.com", target: "/keys"},
		{name: "API Address on the Server Address host passes", apiAddress: "https://console.example.com/gateway", serverAddress: "https://console.example.com", method: http.MethodGet, host: "console.example.com", target: "/keys"},
		{name: "empty Server Address passes", apiAddress: "https://api.example.com", method: http.MethodGet, host: "api.example.com", target: "/keys"},
	}

	gin.SetMode(gin.TestMode)
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			system_setting.ApiAddress, system_setting.ServerAddress = test.apiAddress, test.serverAddress
			router := gin.New()
			router.NoRoute(ApiHostRedirect(), func(c *gin.Context) {
				c.String(http.StatusOK, "console")
			})
			request := httptest.NewRequest(test.method, test.target, nil)
			request.Host = test.host
			response := httptest.NewRecorder()

			router.ServeHTTP(response, request)

			if test.location == "" {
				require.Equal(t, http.StatusOK, response.Code)
				assert.Empty(t, response.Header().Get("Location"))
				return
			}
			require.Equal(t, http.StatusFound, response.Code)
			assert.Equal(t, test.location, response.Header().Get("Location"))
		})
	}
}
