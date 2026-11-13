package common

import (
	"os"
	"regexp"
	"strings"
)

// DefaultGALinkerDomains lets the marketing site and the console share a
// GA4 session. Override with GA_LINKER_DOMAINS (comma-separated hostnames).
const DefaultGALinkerDomains = "modeless.ai,console.modeless.ai"

var googleAnalyticsIDPattern = regexp.MustCompile(`^G-[A-Z0-9]+$`)

// GoogleAnalyticsID returns the configured GA4 measurement ID, or empty if
// GOOGLE_ANALYTICS_ID is unset or not a G-... value.
func GoogleAnalyticsID() string {
	id := strings.TrimSpace(os.Getenv("GOOGLE_ANALYTICS_ID"))
	if !googleAnalyticsIDPattern.MatchString(id) {
		return ""
	}
	return id
}

// GoogleAnalyticsLinkerDomains is the gtag linker domain list. Empty when
// no valid measurement ID is configured.
func GoogleAnalyticsLinkerDomains() []string {
	if GoogleAnalyticsID() == "" {
		return nil
	}
	raw := strings.TrimSpace(os.Getenv("GA_LINKER_DOMAINS"))
	if raw == "" {
		raw = DefaultGALinkerDomains
	}
	seen := make(map[string]struct{})
	out := make([]string, 0)
	for _, part := range strings.Split(raw, ",") {
		domain := strings.ToLower(strings.TrimSpace(part))
		if domain == "" || strings.ContainsAny(domain, "/:?# ") {
			continue
		}
		if _, ok := seen[domain]; ok {
			continue
		}
		seen[domain] = struct{}{}
		out = append(out, domain)
	}
	return out
}
