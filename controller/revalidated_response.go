package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// etagVersionPublicContent namespaces the public-content ETag; bump it when
// the JSON envelope served by serveRevalidatedJSON changes shape.
const etagVersionPublicContent = "public-content:v2"

// legalDocumentMeta describes the version of a legal text being served. It
// lets a client show which version it is presenting, and lets the payment
// page display the same version the order will record.
type legalDocumentMeta struct {
	DocType     string `json:"doc_type"`
	Version     string `json:"version"`
	EffectiveAt int64  `json:"effective_at"`
	Sha256      string `json:"sha256"`
	DocUrl      string `json:"doc_url"`
}

type publicContentResponse struct {
	Success bool               `json:"success"`
	Message string             `json:"message"`
	Data    string             `json:"data"`
	Legal   *legalDocumentMeta `json:"legal,omitempty"`
}

// serveRevalidatedJSON writes public content as JSON with a weak
// content-derived ETag and answers conditional requests with 304 Not
// Modified. The ETag is a weak validator derived from the content, so it is
// stable across replicas and JSON encodings, and a new one is issued when
// the content changes. Cache-Control: no-cache forces revalidation before
// reuse, so an admin edit takes effect on the next request; Vary:
// Accept-Encoding keeps the gzip and identity encodings apart in shared
// caches.
func serveRevalidatedJSON(c *gin.Context, content string) {
	serveRevalidatedJSONWithLegal(c, content, nil)
}

// serveRevalidatedJSONWithLegal is serveRevalidatedJSON for a legal document,
// adding the version metadata the response is keyed by.
func serveRevalidatedJSONWithLegal(c *gin.Context, content string, legal *legalDocumentMeta) {
	body, err := common.Marshal(publicContentResponse{
		Success: true,
		Message: "",
		Data:    content,
		Legal:   legal,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	etag := common.ETagFor(etagVersionPublicContent, content)

	c.Header("ETag", etag)
	c.Header("Cache-Control", "no-cache")
	c.Header("Vary", "Accept-Encoding")

	if common.ETagMatches(c.GetHeader("If-None-Match"), etag) {
		c.Status(http.StatusNotModified)
		return
	}

	c.Data(http.StatusOK, "application/json; charset=utf-8", body)
}

// activeLegalMeta returns the metadata of the version in force, or nil when the
// document has not been published yet.
func activeLegalMeta(docType string) *legalDocumentMeta {
	document, err := model.GetActiveLegalDocument(docType)
	if err != nil {
		return nil
	}
	return &legalDocumentMeta{
		DocType:     document.DocType,
		Version:     document.Version,
		EffectiveAt: document.EffectiveAt,
		Sha256:      document.ContentSha256,
		DocUrl:      document.DocUrl,
	}
}
