package common

import (
	"bytes"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

// ResponseModelCallsField is the usage member in which an upstream, such as the
// MoM fusion gateway, reports the other billed model calls behind its response.
const ResponseModelCallsField = "model_calls"

// ResponseModel records upstream declarations before response conversion. It is
// diagnostic only: it must never change routing, pricing, or downstream output.
// Only the three names are stored; whether they disagree is computed on demand
// so every consumer applies the current comparison rule to old rows as well.
type ResponseModel struct {
	RequestedModel string `json:"requested_model"`
	UpstreamModel  string `json:"upstream_model"`
	ReturnedModel  string `json:"returned_model"`
}

// ResponseModelBilling records how a response model billing rule settled a
// request. BillingModel is the billing name whose expression priced it; it is
// empty when the request kept the entry model's price, and Fallback says why.
// Calls prices the other model calls the response reported, in their order.
type ResponseModelBilling struct {
	ResponseModel string                     `json:"response_model,omitempty"`
	BillingModel  string                     `json:"billing_model,omitempty"`
	Fallback      string                     `json:"fallback,omitempty"`
	Calls         []ResponseModelCallBilling `json:"calls,omitempty"`
}

// ResponseModelCall is a billed model call behind a response other than the one
// that answered, such as a fusion advisor, under the model that served it. Its
// usage has Chat Completions semantics: prompt tokens include cache hits and
// writes.
type ResponseModelCall struct {
	Role  string `json:"role"`
	Model string `json:"model"`
	dto.Usage
}

// ResponseModelCallBilling records how one reported call was priced, like
// ResponseModelBilling does for the response itself. Quota is the call's share
// after the fee and group ratio, for display; settlement adds QuotaBeforeGroup
// and rounds the response's total once.
type ResponseModelCallBilling struct {
	Role             string  `json:"role,omitempty"`
	ResponseModel    string  `json:"response_model,omitempty"`
	BillingModel     string  `json:"billing_model,omitempty"`
	Fallback         string  `json:"fallback,omitempty"`
	PromptTokens     int     `json:"prompt_tokens"`
	CompletionTokens int     `json:"completion_tokens"`
	CacheTokens      int     `json:"cache_tokens,omitempty"`
	Quota            int     `json:"quota"`
	QuotaBeforeGroup float64 `json:"-"`
}

// TakeResponseModelCalls records the model calls a response body or stream
// event reports under its usage, or under response.usage for a Responses
// event, and returns the payload without them: they are pricing input for a
// response model billing rule, not part of the response a client receives. It
// returns the payload unchanged and false when it reports none.
func (info *RelayInfo) TakeResponseModelCalls(payload []byte) ([]byte, bool) {
	if !bytes.Contains(payload, []byte(`"`+ResponseModelCallsField+`"`)) {
		return payload, false
	}
	for _, path := range []string{"usage." + ResponseModelCallsField, "response.usage." + ResponseModelCallsField} {
		reported := gjson.GetBytes(payload, path)
		if !reported.Exists() {
			continue
		}
		var calls []ResponseModelCall
		if err := common.UnmarshalJsonStr(reported.Raw, &calls); err != nil {
			common.SysError(common.LogText("ignoring unreadable response model calls: %s", err.Error()))
		} else {
			info.ResponseModelCalls = calls
		}
		stripped, err := sjson.DeleteBytes(payload, path)
		if err != nil {
			return payload, false
		}
		return stripped, true
	}
	return payload, false
}

// matches reports whether an upstream declaration is compatible with the
// requested or upstream model: equal ignoring case, a dated or variant name
// that extends it, or the same name behind a provider path such as
// "deepseek/deepseek-v4.1-flash".
func (r *ResponseModel) matches(model string) bool {
	returned := strings.ToLower(model)
	for _, expected := range []string{r.RequestedModel, r.UpstreamModel} {
		expected = strings.ToLower(expected)
		if expected != "" && (strings.HasPrefix(returned, expected) || strings.HasSuffix(returned, expected)) {
			return true
		}
	}
	return false
}

// Mismatch reports whether the retained upstream declaration disagrees with
// both the requested and upstream models.
func (r *ResponseModel) Mismatch() bool {
	return r != nil && r.ReturnedModel != "" && !r.matches(r.ReturnedModel)
}

// ObserveResponseModel retains the first differing model for inspection, with
// mismatches taking priority over provider-path, prefix, or case-only
// differences. A later matching or empty event cannot erase it. Only observe
// upstream declarations, never models synthesized by a response converter.
//
// It also records the first declaration in BillingResponseModel, which only a
// configured response model billing rule may use for pricing.
func (info *RelayInfo) ObserveResponseModel(model string) {
	if info == nil || strings.TrimSpace(model) == "" {
		return
	}
	if info.BillingResponseModel == "" {
		info.BillingResponseModel = model
	}
	if info.ResponseModel == nil {
		info.ResponseModel = &ResponseModel{
			RequestedModel: info.OriginModelName,
			UpstreamModel:  info.GetUpstreamModelName(),
		}
	}
	observation := info.ResponseModel
	if observation.Mismatch() {
		return
	}
	if observation.matches(model) && observation.ReturnedModel != "" &&
		observation.ReturnedModel != observation.RequestedModel && observation.ReturnedModel != observation.UpstreamModel {
		return
	}
	observation.ReturnedModel = model
}
