package controller

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
)

// legalDocumentUrl returns the public URL recorded alongside a published
// version. It is a console path rather than the marketing site, because the
// console is where a version stays retrievable after the live page changes.
func legalDocumentUrl(docType string) string {
	path := "/user-agreement"
	if docType == model.LegalDocTypePrivacy {
		path = "/privacy-policy"
	}
	return strings.TrimRight(system_setting.ServerAddress, "/") + path
}

// publishLegalDocuments republishes the configured texts. It runs after the
// legal settings are saved and at startup, so a text an administrator edited
// always has a published version behind it.
func publishLegalDocuments(publishedBy int) {
	type documentSetting struct {
		docType string
		content string
	}
	settings := system_setting.GetLegalSettings()
	for _, item := range []documentSetting{
		{docType: model.LegalDocTypeTerms, content: settings.UserAgreement},
		{docType: model.LegalDocTypePrivacy, content: settings.PrivacyPolicy},
	} {
		if strings.TrimSpace(item.content) == "" {
			continue
		}
		document, created, err := model.PublishLegalDocument(
			item.docType,
			item.content,
			legalDocumentUrl(item.docType),
			publishedBy,
		)
		if err != nil {
			common.SysError(common.LogText("failed to publish legal document %s: %s", item.docType, err.Error()))
			continue
		}
		if created {
			common.SysLog(common.LogText("published legal document %s version %s (sha256=%s)", document.DocType, document.Version, document.ContentSha256))
		}
	}
}

// PublishLegalDocumentsAtStartup gives an existing installation its first
// published version, and republishes when the stored text changed while the
// node was down. It runs after the options load.
func PublishLegalDocumentsAtStartup() {
	publishLegalDocuments(0)
}

// recordCheckoutLegalAcceptance records the user's agreement to the versions in
// force and stamps them onto the order being created. Checkout does not ask the
// user to re-confirm: the terms accept continued use after notice, and the
// order keeps the version in force plus the acceptance timestamp as evidence.
func recordCheckoutLegalAcceptance(c *gin.Context, user *model.User, topUp *model.TopUp) {
	acceptances, err := model.RecordLegalAcceptances(
		user.Id,
		model.LegalAcceptanceSourceCheckout,
		legalDocumentUrl,
		c.ClientIP(),
		c.Request.UserAgent(),
	)
	if err != nil {
		// A failed acceptance write must not lose the order; the versions are
		// still frozen onto it below, and the failure is reported.
		common.SysError(common.LogText("failed to record legal acceptance user_id=%d: %s", user.Id, err.Error()))
	} else if len(acceptances) > 0 {
		topUp.LegalAcceptedAt = acceptances[0].AcceptedAt
	}
	if err := topUp.FreezeLegalEvidence(user); err != nil {
		common.SysError(common.LogText("failed to freeze legal evidence trade_no=%s: %s", topUp.TradeNo, err.Error()))
	}
}

// GetLegalDocumentVersion serves one published version, retired or not. This is
// the endpoint a dispute references: unlike the live page, it keeps returning
// the text that was in force at a given time.
func GetLegalDocumentVersion(c *gin.Context) {
	docType := c.Param("doc_type")
	if docType != model.LegalDocTypeTerms && docType != model.LegalDocTypePrivacy {
		common.ApiErrorStatus(c, http.StatusNotFound, common.NewMessage("Legal document not found"))
		return
	}
	document, err := model.GetLegalDocumentByVersion(docType, c.Param("version"))
	if err != nil {
		common.ApiErrorStatus(c, http.StatusNotFound, common.NewMessage("Legal document not found"))
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    document,
	})
}

// GetLegalDocumentHistory lists published versions, newest first.
func GetLegalDocumentHistory(c *gin.Context) {
	docType := c.Query("doc_type")
	if docType != model.LegalDocTypeTerms && docType != model.LegalDocTypePrivacy {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	documents, err := model.ListLegalDocuments(docType, 50)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, documents)
}

// PublishLegalDocuments republishes on demand, for an administrator who wants a
// version created without saving the settings again.
func PublishLegalDocuments(c *gin.Context) {
	publishLegalDocuments(c.GetInt("id"))
	active, err := model.ActiveLegalDocuments()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "legal.version.publish", nil)
	common.ApiSuccess(c, active)
}
