package billing_setting

import (
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
)

const (
	ResponseModelBillingOption = "billing_setting.response_model_billing"
	// MaxResponseModelFeeRate rejects a fee written as a percentage, such as 5
	// for 5%, which would multiply charges by six.
	MaxResponseModelFeeRate = 1.0
)

// ResponseModelBillingRule settles an entry model, such as a router that picks
// the model per request, at the price of the model the upstream declares in its
// response, plus a fee.
type ResponseModelBillingRule struct {
	// FeeRate is charged on top of the settled price: 0.05 adds 5%. It applies
	// to every request for the entry model, including those that keep the
	// entry price.
	FeeRate float64 `json:"fee_rate"`
	// Models maps a declared response model to the billing name whose
	// expression prices it. Declared models that are not listed, and responses
	// that declare none, keep the entry model's expression.
	Models map[string]string `json:"models,omitempty"`
}

// GetResponseModelBillingRule returns the rule of an entry model. A fee outside
// the bounds enforced on save, which only a direct database edit can store, is
// ignored so it can never turn a charge into a credit.
func GetResponseModelBillingRule(model string) (ResponseModelBillingRule, bool) {
	rule, ok := billingSetting.ResponseModelBilling[model]
	if ok && !(rule.FeeRate >= 0 && rule.FeeRate <= MaxResponseModelFeeRate) {
		common.SysError(common.LogText("ignoring invalid response model billing fee_rate %v of %s", rule.FeeRate, model))
		rule.FeeRate = 0
	}
	return rule, ok
}

// TokenBillingExpr returns the expression that prices model for token
// settlement. Models priced by ratio, task usage expressions and expressions
// that no longer compile have none.
func TokenBillingExpr(model string) (string, bool) {
	if GetBillingMode(model) != BillingModeTieredExpr {
		return "", false
	}
	expression, ok := GetBillingExpr(model)
	if !ok || strings.TrimSpace(expression) == "" {
		return "", false
	}
	if _, err := billingexpr.CompileFromCache(expression); err != nil {
		return "", false
	}
	if billingexpr.UsedVars(expression)["u"] {
		return "", false
	}
	return expression, true
}

// ValidateResponseModelBilling checks a complete option value before it is
// saved. Entry models and billing names must already have expression prices.
func ValidateResponseModelBilling(raw string) error {
	var fields map[string]map[string]json.RawMessage
	if err := common.UnmarshalJsonStr(raw, &fields); err != nil || fields == nil {
		return errors.New("value must be a JSON object that maps entry models to rules")
	}
	var rules map[string]ResponseModelBillingRule
	if err := common.UnmarshalJsonStr(raw, &rules); err != nil {
		return err
	}
	for _, entry := range slices.Sorted(maps.Keys(rules)) {
		if strings.TrimSpace(entry) == "" {
			return errors.New("entry model names must not be empty")
		}
		for field := range fields[entry] {
			if field != "fee_rate" && field != "models" {
				return fmt.Errorf("%s: unknown field %q", entry, field)
			}
		}
		rule := rules[entry]
		if !(rule.FeeRate >= 0 && rule.FeeRate <= MaxResponseModelFeeRate) {
			return fmt.Errorf("%s: fee_rate must be between 0 and %g", entry, MaxResponseModelFeeRate)
		}
		if _, ok := TokenBillingExpr(entry); !ok {
			return fmt.Errorf("%s: the entry model must have an expression price", entry)
		}
		for _, declared := range slices.Sorted(maps.Keys(rule.Models)) {
			if strings.TrimSpace(declared) == "" {
				return fmt.Errorf("%s: response model names must not be empty", entry)
			}
			billingModel := rule.Models[declared]
			if _, ok := TokenBillingExpr(billingModel); !ok {
				return fmt.Errorf("%s: billing model %q for %q must have an expression price", entry, billingModel, declared)
			}
		}
	}
	return nil
}
