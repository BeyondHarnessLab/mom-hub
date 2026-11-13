package common

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGoogleAnalyticsID(t *testing.T) {
	t.Setenv("GOOGLE_ANALYTICS_ID", "")
	require.Equal(t, "", GoogleAnalyticsID())

	t.Setenv("GOOGLE_ANALYTICS_ID", "  G-1J5KXCPXTN  ")
	require.Equal(t, "G-1J5KXCPXTN", GoogleAnalyticsID())

	t.Setenv("GOOGLE_ANALYTICS_ID", "UA-123")
	require.Equal(t, "", GoogleAnalyticsID())

	t.Setenv("GOOGLE_ANALYTICS_ID", "G-1J5KXCPXTN;alert(1)")
	require.Equal(t, "", GoogleAnalyticsID())
}

func TestGoogleAnalyticsLinkerDomains(t *testing.T) {
	t.Setenv("GOOGLE_ANALYTICS_ID", "")
	t.Setenv("GA_LINKER_DOMAINS", "")
	require.Nil(t, GoogleAnalyticsLinkerDomains())

	t.Setenv("GOOGLE_ANALYTICS_ID", "G-1J5KXCPXTN")
	require.Equal(t, []string{"modeless.ai", "console.modeless.ai"}, GoogleAnalyticsLinkerDomains())

	t.Setenv("GA_LINKER_DOMAINS", "Modeless.ai, console.modeless.ai, https://evil.test, modeless.ai")
	require.Equal(t, []string{"modeless.ai", "console.modeless.ai"}, GoogleAnalyticsLinkerDomains())
}
