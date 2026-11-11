package billing_setting

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSmokeTestTaskExprValidatesDeclaredUsageVectors(t *testing.T) {
	videoSchema := map[string]jsplugin.UsageFieldSchema{
		"seconds": {Type: "number", Unit: "second"},
		"mode":    {Enum: []string{"std", "pro"}},
		"quality": {Enum: []string{"sd", "hd"}},
	}

	tests := []struct {
		name          string
		schema        map[string]jsplugin.UsageFieldSchema
		expression    string
		expectedError string
	}{
		{
			name:          "fixed prices are not task usage prices",
			schema:        videoSchema,
			expression:    `true ? tier("normal", u("seconds") * 0.4) : tier("fixed", fixed(0.01))`,
			expectedError: "fixed pricing is not supported for task usage expressions",
		},
		{
			name:       "declared numeric and enum facts",
			schema:     videoSchema,
			expression: `u("mode") == "pro" ? tier("pro", u("seconds") * 0.8) : tier("std", u("seconds") * 0.4)`,
		},
		{
			name:          "undeclared literal key",
			schema:        videoSchema,
			expression:    `tier("base", u("clips") * 0.1)`,
			expectedError: `usage key "clips" is not declared`,
		},
		{
			name:          "negative duration boundary",
			schema:        videoSchema,
			expression:    fmt.Sprintf(`u("seconds") == %d ? -1 : 0`, relaycommon.MaxTaskDurationSeconds),
			expectedError: "result must be finite and non-negative",
		},
		{
			name:          "negative count boundary",
			schema:        map[string]jsplugin.UsageFieldSchema{"clips": {Type: "number", Unit: "count"}},
			expression:    fmt.Sprintf(`u("clips") == %d ? -1 : 0`, dto.MaxImageN),
			expectedError: "result must be finite and non-negative",
		},
		{
			name:          "negative token boundary",
			schema:        map[string]jsplugin.UsageFieldSchema{"tokens": {Type: "number", Unit: "token"}},
			expression:    fmt.Sprintf(`u("tokens") == %d ? -1 : 0`, common.MaxQuota),
			expectedError: "result must be finite and non-negative",
		},
		{
			name:          "negative credit boundary",
			schema:        map[string]jsplugin.UsageFieldSchema{"units": {Type: "number", Unit: "credit"}},
			expression:    fmt.Sprintf(`u("units") == %d ? -1 : 0`, common.MaxQuota),
			expectedError: "result must be finite and non-negative",
		},
		{
			name:          "negative enum combination",
			schema:        videoSchema,
			expression:    `u("mode") == "pro" && u("quality") == "hd" ? -1 : 0`,
			expectedError: "result must be finite and non-negative",
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			err := SmokeTestTaskExpr(testCase.expression, testCase.schema)
			if testCase.expectedError == "" {
				require.NoError(t, err)
				return
			}
			require.ErrorContains(t, err, testCase.expectedError)
		})
	}
}

func TestSmokeTestTaskExprCapsOversizedEnumProductsAtLastCombination(t *testing.T) {
	schema := make(map[string]jsplugin.UsageFieldSchema, 7)
	condition := ""
	for index := range 7 {
		schema[fmt.Sprintf("enum_%d", index)] = jsplugin.UsageFieldSchema{Enum: []string{"first", "middle", "last"}}
		if condition != "" {
			condition += " && "
		}
		condition += fmt.Sprintf(`u("enum_%d") == "last"`, index)
	}

	err := SmokeTestTaskExpr(condition+" ? -1 : 0", schema)
	require.ErrorContains(t, err, "result must be finite and non-negative")
}

func TestSmokeTestExprRejectsTaskUsageWithoutSchema(t *testing.T) {
	err := SmokeTestExpr(`u("mode") == "std" ? 1 : 2`)
	require.Error(t, err)
	assert.ErrorContains(t, err, "mode")
	assert.ErrorContains(t, err, "no task plugin usage schema")

	require.NoError(t, SmokeTestExpr(`tier("base", p * 2 + c * 8)`))
}

func TestValidateResponseModelBilling(t *testing.T) {
	saved := billingSetting
	t.Cleanup(func() { billingSetting = saved })
	billingSetting = BillingSetting{
		BillingMode: map[string]string{"router/auto": BillingModeTieredExpr, "auto/cheap": BillingModeTieredExpr, "auto/task": BillingModeTieredExpr},
		BillingExpr: map[string]string{
			"router/auto": `tier("entry", p * 10 + c * 50)`,
			"auto/cheap":  `tier("cheap", p + c * 5)`,
			"auto/task":   `tier("task", u("seconds") * 0.4)`,
		},
	}

	tests := []struct {
		name          string
		value         string
		expectedError string
	}{
		{name: "response models with a fee", value: `{"router/auto":{"fee_rate":0.05,"models":{"vendor/cheap":"auto/cheap"}}}`},
		{name: "fee only", value: `{"router/auto":{"fee_rate":0.05}}`},
		{name: "fee written as a percentage", value: `{"router/auto":{"fee_rate":5}}`, expectedError: "fee_rate must be between 0 and 1"},
		{name: "negative fee", value: `{"router/auto":{"fee_rate":-0.05}}`, expectedError: "fee_rate must be between 0 and 1"},
		{name: "misspelled field", value: `{"router/auto":{"fee":0.05}}`, expectedError: `unknown field "fee"`},
		{name: "entry model without an expression price", value: `{"vendor/cheap":{"fee_rate":0.05}}`, expectedError: "the entry model must have an expression price"},
		{name: "billing model without a price", value: `{"router/auto":{"models":{"vendor/x":"auto/missing"}}}`, expectedError: `billing model "auto/missing"`},
		{name: "billing model priced by task usage", value: `{"router/auto":{"models":{"vendor/x":"auto/task"}}}`, expectedError: `billing model "auto/task"`},
		{name: "not an object", value: `null`, expectedError: "must be a JSON object"},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			err := ValidateResponseModelBilling(testCase.value)
			if testCase.expectedError == "" {
				require.NoError(t, err)
				return
			}
			require.ErrorContains(t, err, testCase.expectedError)
		})
	}
}

func TestRoutedModelPricesListsEachRoutersModelsAtTheirOwnPrice(t *testing.T) {
	saved := billingSetting
	t.Cleanup(func() { billingSetting = saved })
	billingSetting = BillingSetting{
		BillingMode: map[string]string{
			"router/auto": BillingModeTieredExpr, "router/fusion": BillingModeTieredExpr,
			"auto/cheap": BillingModeTieredExpr, "auto/pro": BillingModeTieredExpr, "fusion/pro": BillingModeTieredExpr, "auto/task": BillingModeTieredExpr,
		},
		BillingExpr: map[string]string{
			"router/auto":   `tier("entry", p * 10 + c * 50)`,
			"router/fusion": `tier("entry", p * 10 + c * 50)`,
			"auto/cheap":    `tier("cheap", p + c * 5)`,
			"auto/pro":      `tier("pro", p * 4 + c * 20)`,
			"fusion/pro":    `tier("pro", p * 5 + c * 25)`,
			"auto/task":     `tier("task", u("seconds") * 0.4)`,
		},
		ResponseModelBilling: map[string]ResponseModelBillingRule{
			"router/auto": {FeeRate: 0.05, Models: map[string]string{
				"vendor/cheap": "auto/cheap", "vendor/pro": "auto/pro", "vendor/task": "auto/task", "vendor/unpriced": "auto/missing",
			}},
			"router/fusion": {FeeRate: 0.05, Models: map[string]string{"vendor/cheap": "auto/cheap", "vendor/pro": "fusion/pro"}},
			"router/hidden": {Models: map[string]string{"vendor/secret": "auto/cheap"}},
		},
	}

	prices := RoutedModelPrices([]string{"router/fusion", "router/auto", "vendor/plain"})

	assert.Equal(t, []RoutedModelPrice{
		{ModelName: "vendor/cheap", Routers: []string{"router/auto", "router/fusion"}, BillingExpr: `tier("cheap", p + c * 5)`},
		{ModelName: "vendor/pro", Routers: []string{"router/auto"}, BillingExpr: `tier("pro", p * 4 + c * 20)`},
		{ModelName: "vendor/pro", Routers: []string{"router/fusion"}, BillingExpr: `tier("pro", p * 5 + c * 25)`},
	}, prices)
	assert.Empty(t, RoutedModelPrices(nil))
}
