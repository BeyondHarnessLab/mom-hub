package model

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Legal documents and acceptances are the evidence for billing disputes and
// chargebacks. Both tables are append-only: a version that was published and an
// acceptance that was recorded are never updated or deleted, because a dispute
// can arrive months after the payment it concerns.
const (
	LegalDocTypeTerms   = "terms"
	LegalDocTypePrivacy = "privacy"
)

// Legal acceptance sources record where the agreeing click happened.
const (
	LegalAcceptanceSourceRegister    = "register"
	LegalAcceptanceSourceOAuthSignup = "oauth_signup"
	LegalAcceptanceSourceCheckout    = "checkout"
)

// LegalDocument is one published version of a legal text. The full text is
// stored so a retired version stays provable after the website replaces its
// copy.
type LegalDocument struct {
	Id            int    `json:"id"`
	DocType       string `json:"doc_type" gorm:"type:varchar(32);uniqueIndex:idx_legal_doc_version,priority:1"`
	Version       string `json:"version" gorm:"type:varchar(32);uniqueIndex:idx_legal_doc_version,priority:2"`
	EffectiveAt   int64  `json:"effective_at" gorm:"type:bigint"`
	ContentSha256 string `json:"content_sha256" gorm:"type:varchar(64)"`
	Content       string `json:"content" gorm:"type:text"`
	DocUrl        string `json:"doc_url" gorm:"type:varchar(255)"`
	PublishedAt   int64  `json:"published_at" gorm:"type:bigint"`
	RetiredAt     int64  `json:"retired_at" gorm:"type:bigint;default:0"`
	PublishedBy   int    `json:"published_by"`
}

// LegalAcceptance is one user's agreement to one published document version.
// The unique key is (user, doc type, version): agreeing to the same version
// again is not a new event, while agreeing to a newer version adds a row and
// leaves the older one intact.
type LegalAcceptance struct {
	Id            int    `json:"id"`
	UserId        int    `json:"user_id" gorm:"uniqueIndex:idx_legal_acceptance_user_doc,priority:1;index:idx_legal_acceptance_user_time,priority:1"`
	DocType       string `json:"doc_type" gorm:"type:varchar(32);uniqueIndex:idx_legal_acceptance_user_doc,priority:2"`
	Version       string `json:"version" gorm:"type:varchar(32);uniqueIndex:idx_legal_acceptance_user_doc,priority:3"`
	ContentSha256 string `json:"content_sha256" gorm:"type:varchar(64)"`
	EffectiveAt   int64  `json:"effective_at" gorm:"type:bigint"`
	DocUrl        string `json:"doc_url" gorm:"type:varchar(255)"`
	Source        string `json:"source" gorm:"type:varchar(24)"`
	AcceptedAt    int64  `json:"accepted_at" gorm:"type:bigint;index:idx_legal_acceptance_user_time,priority:2"`
	Ip            string `json:"ip" gorm:"type:varchar(64)"`
	UserAgent     string `json:"user_agent" gorm:"type:varchar(512)"`
}

var (
	ErrLegalDocumentMissing = errors.New("legal document is not configured")
	ErrLegalDocumentEmpty   = errors.New("legal document content is empty")
)

// normalizeLegalContent removes differences a reader does not see, so a
// whitespace edit does not publish a new version while a wording edit always
// does.
func normalizeLegalContent(content string) string {
	return strings.TrimSpace(strings.ReplaceAll(content, "\r\n", "\n"))
}

// LegalContentSha256 identifies a legal text by what it says.
func LegalContentSha256(content string) string {
	sum := sha256.Sum256([]byte(normalizeLegalContent(content)))
	return hex.EncodeToString(sum[:])
}

// parseLegalEffectiveDate reads the "**Effective date: 12 November 2026**" line
// the legal texts carry. It returns 0 when the line is absent or unparseable,
// in which case publishing falls back to the publication time.
func parseLegalEffectiveDate(content string) int64 {
	for line := range strings.SplitSeq(content, "\n") {
		if !strings.HasPrefix(line, "**Effective date:") {
			continue
		}
		value := strings.TrimSuffix(strings.TrimPrefix(line, "**Effective date:"), "**")
		if parsed, err := time.Parse("2 January 2006", strings.TrimSpace(value)); err == nil {
			return parsed.UTC().Unix()
		}
		return 0
	}
	return 0
}

// legalVersionBase returns the "YYYY-MM-DD" form of an effective timestamp.
func legalVersionBase(effectiveAt int64) string {
	return time.Unix(effectiveAt, 0).UTC().Format("2006-01-02")
}

// legalVersionForTx derives the version for a new publication. It is the
// effective date, with a ".N" suffix when that date already has a version, so a
// same-day reissue stays distinguishable from the original.
func legalVersionForTx(tx *gorm.DB, docType string, effectiveAt int64) (string, error) {
	base := legalVersionBase(effectiveAt)
	var versions []string
	if err := tx.Model(&LegalDocument{}).
		Where("doc_type = ? AND version LIKE ?", docType, base+"%").
		Pluck("version", &versions).Error; err != nil {
		return "", err
	}
	if len(versions) == 0 {
		return base, nil
	}
	return fmt.Sprintf("%s.%d", base, len(versions)+1), nil
}

// PublishLegalDocument stores content as a new version when it differs from the
// active one, and returns the active document plus whether a new version was
// created. An unchanged text only refreshes docUrl, so republishing the same
// settings is a no-op.
func PublishLegalDocument(docType string, content string, docUrl string, publishedBy int) (*LegalDocument, bool, error) {
	normalized := normalizeLegalContent(content)
	if normalized == "" {
		return nil, false, ErrLegalDocumentEmpty
	}
	sha := LegalContentSha256(normalized)

	var document *LegalDocument
	var created bool
	err := DB.Transaction(func(tx *gorm.DB) error {
		active := &LegalDocument{}
		activeErr := tx.Where("doc_type = ? AND retired_at = 0", docType).First(active).Error
		if activeErr != nil && !errors.Is(activeErr, gorm.ErrRecordNotFound) {
			return activeErr
		}
		if activeErr == nil && active.ContentSha256 == sha {
			if docUrl != "" && active.DocUrl != docUrl {
				if err := tx.Model(&LegalDocument{}).Where("id = ?", active.Id).
					Update("doc_url", docUrl).Error; err != nil {
					return err
				}
				active.DocUrl = docUrl
			}
			document = active
			return nil
		}

		now := common.GetTimestamp()
		effectiveAt := parseLegalEffectiveDate(normalized)
		if effectiveAt == 0 {
			effectiveAt = now
		}
		if activeErr == nil {
			if err := tx.Model(&LegalDocument{}).Where("id = ?", active.Id).
				Update("retired_at", now).Error; err != nil {
				return err
			}
		}
		version, err := legalVersionForTx(tx, docType, effectiveAt)
		if err != nil {
			return err
		}
		document = &LegalDocument{
			DocType:       docType,
			Version:       version,
			EffectiveAt:   effectiveAt,
			ContentSha256: sha,
			Content:       normalized,
			DocUrl:        docUrl,
			PublishedAt:   now,
			PublishedBy:   publishedBy,
		}
		if err := tx.Create(document).Error; err != nil {
			return err
		}
		created = true
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	return document, created, nil
}

// GetActiveLegalDocument returns the version currently in force for docType.
func GetActiveLegalDocument(docType string) (*LegalDocument, error) {
	document := &LegalDocument{}
	err := DB.Where("doc_type = ? AND retired_at = 0", docType).First(document).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrLegalDocumentMissing
	}
	if err != nil {
		return nil, err
	}
	return document, nil
}

// ActiveLegalDocuments returns every document in force, ordered by doc type so
// terms precede privacy.
func ActiveLegalDocuments() ([]*LegalDocument, error) {
	documents := make([]*LegalDocument, 0, 2)
	if err := DB.Where("retired_at = 0").Order("doc_type desc").Find(&documents).Error; err != nil {
		return nil, err
	}
	return documents, nil
}

// ListLegalDocuments returns the version history for docType, newest first.
func ListLegalDocuments(docType string, limit int) ([]*LegalDocument, error) {
	documents := make([]*LegalDocument, 0, limit)
	err := DB.Where("doc_type = ?", docType).Order("id desc").Limit(limit).Find(&documents).Error
	return documents, err
}

// GetLegalDocumentByVersion returns one published version, retired or not,
// which is what a dispute needs.
func GetLegalDocumentByVersion(docType string, version string) (*LegalDocument, error) {
	document := &LegalDocument{}
	err := DB.Where("doc_type = ? AND version = ?", docType, version).First(document).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrLegalDocumentMissing
	}
	if err != nil {
		return nil, err
	}
	return document, nil
}

// RecordLegalAcceptances stores one acceptance row per active document. The
// version, hash and effective date always come from the server-side document,
// never from the request, so a client cannot claim a version it never saw.
// Duplicate calls are ignored, which lets the checkout path record on every
// order without creating noise.
func RecordLegalAcceptances(userId int, source string, docUrl func(docType string) string, ip string, userAgent string) ([]*LegalAcceptance, error) {
	documents, err := ActiveLegalDocuments()
	if err != nil {
		return nil, err
	}
	if len(documents) == 0 {
		return nil, nil
	}
	now := common.GetTimestamp()
	acceptances := make([]*LegalAcceptance, 0, len(documents))
	for _, document := range documents {
		docValue := document.DocUrl
		if docValue == "" && docUrl != nil {
			docValue = docUrl(document.DocType)
		}
		acceptance := &LegalAcceptance{
			UserId:        userId,
			DocType:       document.DocType,
			Version:       document.Version,
			ContentSha256: document.ContentSha256,
			EffectiveAt:   document.EffectiveAt,
			DocUrl:        docValue,
			Source:        source,
			AcceptedAt:    now,
			Ip:            ip,
			UserAgent:     truncateUserAgent(userAgent),
		}
		if err := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(acceptance).Error; err != nil {
			return nil, err
		}
		acceptances = append(acceptances, acceptance)
	}
	return acceptances, nil
}

// FreezeLegalEvidence onto the order from the documents in force and the user's
// recorded acceptance. Callers invoke it before inserting the order, so the
// order carries the versions it will be judged by even if the text changes
// before the payment settles.
func (topUp *TopUp) FreezeLegalEvidence(user *User) error {
	documents, err := ActiveLegalDocuments()
	if err != nil {
		return err
	}
	if len(documents) == 0 {
		return nil
	}
	acceptedAt := int64(0)
	if user != nil {
		acceptances, err := GetUserLegalAcceptances(user.Id)
		if err != nil {
			return err
		}
		if len(acceptances) > 0 {
			acceptedAt = acceptances[0].AcceptedAt
		}
	}
	for _, document := range documents {
		switch document.DocType {
		case LegalDocTypeTerms:
			topUp.TermsVersion = document.Version
			topUp.TermsSha256 = document.ContentSha256
			topUp.TermsEffectiveAt = document.EffectiveAt
			topUp.TermsDocUrl = document.DocUrl
		case LegalDocTypePrivacy:
			topUp.PrivacyVersion = document.Version
			topUp.PrivacySha256 = document.ContentSha256
			topUp.PrivacyEffectiveAt = document.EffectiveAt
			topUp.PrivacyDocUrl = document.DocUrl
		}
	}
	topUp.LegalAcceptedAt = acceptedAt
	return nil
}

func truncateUserAgent(userAgent string) string {
	if len(userAgent) <= 512 {
		return userAgent
	}
	return userAgent[:512]
}

// GetUserLegalAcceptances returns the user's latest acceptance per document
// type. Older rows stay in the table for dispute evidence.
func GetUserLegalAcceptances(userId int) ([]*LegalAcceptance, error) {
	acceptances := make([]*LegalAcceptance, 0, 2)
	if err := DB.Where("user_id = ?", userId).
		Order("accepted_at desc, id desc").Find(&acceptances).Error; err != nil {
		return nil, err
	}
	latest := make([]*LegalAcceptance, 0, 2)
	seen := make(map[string]struct{}, 2)
	for _, acceptance := range acceptances {
		if _, ok := seen[acceptance.DocType]; ok {
			continue
		}
		seen[acceptance.DocType] = struct{}{}
		latest = append(latest, acceptance)
	}
	return latest, nil
}
