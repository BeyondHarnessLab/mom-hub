package service

import (
	"context"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/relayconvert"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	hosttypes "github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

// TieredResultWrapper wraps billingexpr.TieredResult for use at the service layer.
type TieredResultWrapper = billingexpr.TieredResult

// BuildTieredTokenParams constructs billingexpr.TokenParams from a dto.Usage,
// normalizing P and C so they mean "tokens not separately priced by the
// expression". Sub-categories (cache, image, audio) are only subtracted
// when the expression references them via their own variable.
//
// GPT-format APIs report prompt_tokens / completion_tokens as totals that
// include all sub-categories (cache, image, audio). Claude-format APIs
// report them as text-only. This function normalizes to text-only when
// sub-categories are separately priced.
//
// A long-lived cache write (Claude 1h, OpenAI 12h) without its own price
// costs a fixed multiple of the short write price: it is billed in cc, or in
// p when cc has no price either.
func BuildTieredTokenParams(usage *dto.Usage, isClaudeUsageSemantic bool, usedVars map[string]bool) billingexpr.TokenParams {
	p := float64(usage.PromptTokens)
	c := float64(usage.CompletionTokens)
	cr := float64(usage.PromptTokensDetails.CachedTokens)
	cc := float64(usage.PromptTokensDetails.CacheCreationTokensTotal())
	cc1h := float64(0)
	cc12h := float64(0)

	if usage.UsageSemantic == "anthropic" {
		// Upstreams may report the cache-write total without a full 5m/1h
		// split; the unlabelled remainder is billed as 5m writes.
		split5m, split1h := relayconvert.NormalizeCacheCreationSplit(
			usage.PromptTokensDetails.CacheCreationTokensTotal(),
			usage.ClaudeCacheCreation5mTokens,
			usage.ClaudeCacheCreation1hTokens,
		)
		cc = float64(split5m)
		cc1h = float64(split1h)
	}

	img := float64(usage.PromptTokensDetails.ImageTokens)
	imgCR := float64(0)
	if usedVars["img_cr"] && !isClaudeUsageSemantic {
		details := usage.PromptTokensDetails.CachedTokensDetails
		if details != nil && details.ImageTokens != nil {
			cachedImage := *details.ImageTokens
			cached := usage.PromptTokensDetails.CachedTokens
			image := usage.PromptTokensDetails.ImageTokens
			valid := cachedImage >= 0 && cached >= cachedImage && image >= cachedImage &&
				cached <= usage.PromptTokens && image <= usage.PromptTokens-(cached-cachedImage)
			if valid {
				remaining := cached - cachedImage
				for _, count := range []*int{details.TextTokens, details.AudioTokens} {
					if count == nil {
						continue
					}
					if *count < 0 || *count > remaining {
						valid = false
						break
					}
					remaining -= *count
				}
			}
			if valid {
				imgCR = float64(cachedImage)
				cr -= imgCR
				img -= imgCR
			} else {
				common.SysError(common.LogText("invalid image cache token breakdown; using aggregate cache billing"))
			}
		}
	}
	ai := float64(usage.PromptTokensDetails.AudioTokens)
	imgO := float64(usage.CompletionTokenDetails.ImageTokens)
	ao := float64(usage.CompletionTokenDetails.AudioTokens)

	// len = total input context length for tier condition evaluation.
	// Non-Claude: prompt_tokens already includes everything.
	// Claude: input_tokens is text-only, so add cache read + cache creation.
	inputLen := p
	if isClaudeUsageSemantic {
		inputLen = p + cr + cc + cc1h
	}

	if isClaudeUsageSemantic {
		// Anthropic input excludes cache reads and writes. When they have no
		// separate price, merge those tokens into the input category instead.
		if !usedVars["cr"] {
			p += cr
		}
		if !usedVars["cc1h"] {
			cc += cc1h * hosttypes.ClaudeCacheCreation1hMultiplier
			cc1h = 0
		}
		if !usedVars["cc"] {
			p += cc
			cc = 0
		}
	} else {
		if usedVars["cr"] {
			p -= cr
		}
		// prompt_tokens counts every cache write once. A 12h write without
		// its own price joins cc at twice its count; ccTokens keeps the real
		// count that cc takes out of p, and an unpriced cc leaves p the extra.
		cc12h = float64(usage.PromptTokensDetails.CacheWrite12hTokens())
		cc -= cc12h
		ccTokens := cc
		if usedVars["cc12h"] {
			p -= cc12h
		} else {
			ccTokens += cc12h
			cc += cc12h * hosttypes.OpenAICacheCreation12hMultiplier
			cc12h = 0
		}
		if usedVars["cc"] {
			p -= ccTokens
		} else {
			p += cc - ccTokens
			cc = 0
		}
		if usedVars["cc1h"] {
			p -= cc1h
		}
		if usedVars["img"] {
			p -= img
		}
		if usedVars["img_cr"] {
			p -= imgCR
		}
		if usedVars["ai"] {
			p -= ai
		}
		if usedVars["img_o"] {
			c -= imgO
		}
		if usedVars["ao"] {
			c -= ao
		}
	}

	// OpenAI cache-write usage reports unadjusted prefix counts, so cr + cc can
	// exceed the prompt and drive the remainder negative. Clamp at zero.
	if p < 0 {
		p = 0
	}
	if c < 0 {
		c = 0
	}

	return billingexpr.TokenParams{
		P:     p,
		C:     c,
		Len:   inputLen,
		CR:    cr,
		CC:    cc,
		CC1h:  cc1h,
		CC12h: cc12h,
		Img:   img,
		ImgCR: imgCR,
		ImgO:  imgO,
		AI:    ai,
		AO:    ao,
	}
}

func refreshTieredBillingGroup(relayInfo *relaycommon.RelayInfo) (*billingexpr.BillingSnapshot, error) {
	if relayInfo == nil {
		return nil, nil
	}
	snap := relayInfo.TieredBillingSnapshot
	if snap == nil || snap.BillingMode != "tiered_expr" {
		return nil, nil
	}

	groupRatio := relayInfo.PriceData.GroupRatioInfo.GroupRatio
	if snap.GroupRatio == groupRatio {
		return snap, nil
	}

	estimatedQuotaAfterGroup := snap.EstimatedQuotaBeforeGroup * groupRatio
	estimatedQuota, err := billingexpr.QuotaRoundStrict(estimatedQuotaAfterGroup)
	if err != nil {
		return nil, err
	}
	snap.GroupRatio = groupRatio
	snap.EstimatedQuotaAfterGroup = estimatedQuota
	return snap, nil
}

// PrepareTieredBillingForSelectedGroup refreshes routing-dependent billing
// state before an upstream attempt. An existing session reserves any higher
// estimate before sending. If the initial group was free and skipped
// pre-consume, switching to a paid group creates the session at that point.
func PrepareTieredBillingForSelectedGroup(c *gin.Context, relayInfo *relaycommon.RelayInfo) *types.NewAPIError {
	snap, err := refreshTieredBillingGroup(relayInfo)
	if err != nil {
		return types.NewErrorWithStatusCode(
			err,
			types.ErrorCodeModelPriceError,
			http.StatusBadRequest,
			types.ErrOptionWithSkipRetry(),
		)
	}
	if snap == nil {
		return nil
	}
	if snap.GroupRatio == 0 {
		// Paid-to-free keeps FreeModel as-is: FreeModel means "pre-consume was
		// skipped", which is not true once a session exists, and settlement
		// already yields 0 for a zero group ratio.
		return nil
	}

	// The selected group is paid; clear a FreeModel flag frozen when the
	// initial group was free so downstream state stays consistent.
	relayInfo.PriceData.FreeModel = false

	if relayInfo.Billing == nil {
		return PreConsumeBilling(c, snap.EstimatedQuotaAfterGroup, relayInfo)
	}
	if err := relayInfo.Billing.Reserve(snap.EstimatedQuotaAfterGroup); err != nil {
		return types.NewError(err, types.ErrorCodeUpdateDataError, types.ErrOptionWithSkipRetry())
	}
	relayInfo.FinalPreConsumedQuota = relayInfo.Billing.GetPreConsumedQuota()
	return nil
}

// ApplyResponseModelBilling switches the frozen expression to the price of the
// model the upstream declared, when the billing model's response model billing
// rule lists it, and prices the other model calls the upstream reported behind
// the response, each at its own declared model. Call it once, before token
// normalization, because the replacement expression decides which token
// categories are priced apart. Group ratio, request input and the fee stay
// frozen and apply to every call. A response or call that declares no model or
// an unlisted one keeps the entry price, which should be the most expensive
// model it can route to, and leaves an admin-visible fallback.
func ApplyResponseModelBilling(ctx context.Context, relayInfo *relaycommon.RelayInfo) {
	snap := relayInfo.TieredBillingSnapshot
	if snap == nil || snap.BillingMode != billing_setting.BillingModeTieredExpr || snap.TaskUsageBilling {
		return
	}
	rule, ok := billing_setting.GetResponseModelBillingRule(snap.ModelName)
	if !ok || len(rule.Models) == 0 {
		if len(relayInfo.ResponseModelCalls) > 0 {
			logger.LogWarn(ctx, common.LogText("%s has no response model billing rule, so the %d model calls its response reported were not charged",
				snap.ModelName, len(relayInfo.ResponseModelCalls)))
		}
		return
	}

	declared := relayInfo.BillingResponseModel
	settled, billingModel, fallback := responseModelSnapshot(snap, rule, declared)
	decision := &relaycommon.ResponseModelBilling{ResponseModel: declared, BillingModel: billingModel, Fallback: fallback}
	relayInfo.ResponseModelBilling = decision
	relayInfo.TieredBillingSnapshot = settled
	if fallback != "" {
		logger.LogWarn(ctx, common.LogText("response model billing kept the entry price of %s: %s, response model %q",
			snap.ModelName, fallback, declared))
	}

	requestInput := tieredRequestInput(relayInfo, snap)
	for _, call := range relayInfo.ResponseModelCalls {
		callSnap, callBillingModel, callFallback := responseModelSnapshot(snap, rule, call.Model)
		billing := relaycommon.ResponseModelCallBilling{
			Role:             call.Role,
			ResponseModel:    call.Model,
			BillingModel:     callBillingModel,
			Fallback:         callFallback,
			PromptTokens:     call.PromptTokens,
			CompletionTokens: call.CompletionTokens,
			CacheTokens:      call.PromptTokensDetails.CachedTokens,
		}
		if callFallback != "" {
			logger.LogWarn(ctx, common.LogText("response model billing kept the entry price of %s for a %s call: %s, response model %q",
				snap.ModelName, call.Role, callFallback, call.Model))
		}
		params := BuildTieredTokenParams(&call.Usage, false, billingexpr.UsedVarsByHash(callSnap.ExprString, callSnap.ExprHash))
		result, err := billingexpr.ComputeTieredQuotaWithRequest(callSnap, params, requestInput)
		// A call can only add to the charge; one that cannot be priced adds
		// nothing rather than a credit.
		if err != nil || !(result.ActualQuotaBeforeGroup >= 0) {
			billing.Fallback = "evaluation_failed"
			logger.LogError(ctx, common.LogText("response model billing could not price a %s call to %q for %s: %v, quota %v",
				call.Role, call.Model, snap.ModelName, err, result.ActualQuotaBeforeGroup))
		} else {
			billing.QuotaBeforeGroup = result.ActualQuotaBeforeGroup
			billing.Quota = result.ActualQuotaAfterGroup
		}
		decision.Calls = append(decision.Calls, billing)
	}
}

// responseModelSnapshot returns the entry snapshot repriced at the billing name
// rule lists for a declared model, with that name. When the model is missing,
// unlisted or its billing name has no token expression, it returns the entry
// snapshot itself and the fallback reason.
func responseModelSnapshot(entry *billingexpr.BillingSnapshot, rule billing_setting.ResponseModelBillingRule, declared string) (*billingexpr.BillingSnapshot, string, string) {
	billingModel, listed := rule.Models[declared]
	expression, priced := billing_setting.TokenBillingExpr(billingModel)
	switch {
	case declared == "":
		return entry, "", "no_response_model"
	case !listed:
		return entry, "", "unlisted_response_model"
	case !priced:
		return entry, "", "unpriced_billing_model"
	}
	settled := *entry
	settled.ModelName = billingModel
	settled.ExprString = expression
	settled.ExprHash = billingexpr.ExprHashString(expression)
	settled.ExprVersion = billingexpr.ExprVersion(expression)
	return &settled, billingModel, ""
}

// tieredRequestInput is the request context an expression settles against: the
// frozen request, with the image count settled or reserved for it.
func tieredRequestInput(relayInfo *relaycommon.RelayInfo, snap *billingexpr.BillingSnapshot) billingexpr.RequestInput {
	requestInput := billingexpr.RequestInput{}
	if relayInfo.BillingRequestInput != nil {
		requestInput = *relayInfo.BillingRequestInput
	}
	if relayInfo.BillingImageCount != nil {
		requestInput.ImageCount = relayInfo.BillingImageCount
	} else if snap.EstimatedImageCount != nil {
		requestInput.ImageCount = snap.EstimatedImageCount
	}
	return requestInput
}

// TryTieredSettle checks if the request uses tiered_expr billing and, if so,
// computes the actual quota using the captured BillingSnapshot. The model calls
// ApplyResponseModelBilling priced are part of the response's charge. Returns:
//   - ok=true, quota, result  when tiered billing applies
//   - ok=false, 0, nil        when it doesn't (caller should fall through to existing logic)
func TryTieredSettle(relayInfo *relaycommon.RelayInfo, params billingexpr.TokenParams) (ok bool, quota int, result *billingexpr.TieredResult) {
	snap := relayInfo.TieredBillingSnapshot
	if snap == nil || snap.BillingMode != "tiered_expr" {
		return false, 0, nil
	}

	tr, err := billingexpr.ComputeTieredQuotaWithRequest(snap, params, tieredRequestInput(relayInfo, snap))
	if err != nil {
		quota = relayInfo.FinalPreConsumedQuota
		if quota <= 0 {
			quota = snap.EstimatedQuotaAfterGroup
		}
		return true, quota, nil
	}
	if decision := relayInfo.ResponseModelBilling; decision != nil && len(decision.Calls) > 0 {
		decision.Quota = tr.ActualQuotaAfterGroup
		for _, call := range decision.Calls {
			tr.ActualQuotaBeforeGroup += call.QuotaBeforeGroup
		}
		tr.ActualQuotaAfterGroup, tr.Clamp = common.QuotaRoundChecked(tr.ActualQuotaBeforeGroup * snap.GroupRatio)
	}

	// Surface any single-request saturation from settlement onto RelayInfo so the
	// consume log records it under admin_info, regardless of which caller
	// (text, audio, WSS) consumes the returned quota. First non-nil wins.
	noteQuotaClamp(relayInfo, tr.Clamp)

	return true, tr.ActualQuotaAfterGroup, &tr
}

// A failed evaluation retains the reservation and its estimated billing unit.
// Successful evaluations always use the actual branch, including zero prices.
func isFixedPriceSettlement(info *relaycommon.RelayInfo, result *billingexpr.TieredResult) bool {
	if result != nil {
		return result.BillingUnit == billingexpr.BillingUnitRequest
	}
	snap := info.TieredBillingSnapshot
	return snap != nil && snap.BillingMode == "tiered_expr" && snap.EstimatedBillingUnit == billingexpr.BillingUnitRequest
}
