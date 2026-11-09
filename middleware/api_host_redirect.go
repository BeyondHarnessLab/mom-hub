package middleware

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

// ApiHostRedirect keeps the console off the API Address domain: a GET for a
// console page that arrives on the API Address host is redirected to the same
// path on Server Address. Relay paths (/v1...), console API paths (/api...)
// and non-GET requests such as load balancer HEAD checks pass through. It does
// nothing while API Address is empty or names the Server Address host.
func ApiHostRedirect() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		if c.Request.Method != http.MethodGet || strings.HasPrefix(path, "/v1") || strings.HasPrefix(path, "/api") {
			c.Next()
			return
		}
		serverAddress := strings.TrimRight(strings.TrimSpace(system_setting.ServerAddress), "/")
		apiURL, apiErr := url.Parse(strings.TrimSpace(system_setting.ApiAddress))
		serverURL, serverErr := url.Parse(serverAddress)
		if apiErr != nil || serverErr != nil || apiURL.Host == "" || serverURL.Host == "" {
			c.Next()
			return
		}
		// Only host and port are compared. TLS usually ends at the ingress, so
		// the request scheme is not the public one; all three hosts are
		// normalized with the API Address scheme so default ports match.
		apiHost, apiErr := common.NormalizeOrigin(apiURL.Scheme + "://" + apiURL.Host)
		requestHost, requestErr := common.NormalizeOrigin(apiURL.Scheme + "://" + c.Request.Host)
		serverHost, serverErr := common.NormalizeOrigin(apiURL.Scheme + "://" + serverURL.Host)
		if apiErr != nil || requestErr != nil || serverErr != nil || requestHost != apiHost || serverHost == apiHost {
			c.Next()
			return
		}
		// 302 rather than 301: the target follows settings that can change,
		// and browsers keep a 301 indefinitely.
		c.Redirect(http.StatusFound, serverAddress+c.Request.URL.RequestURI())
		c.Abort()
	}
}
