package model

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func legalTestContent(suffix string) string {
	return fmt.Sprintf("**Effective date: 12 November 2026**\n\nVersion %s body.", suffix)
}

func resetLegalTables(t *testing.T) {
	t.Helper()
	t.Cleanup(func() {
		DB.Exec("DELETE FROM legal_acceptances")
		DB.Exec("DELETE FROM legal_documents")
	})
	require.NoError(t, DB.Exec("DELETE FROM legal_acceptances").Error)
	require.NoError(t, DB.Exec("DELETE FROM legal_documents").Error)
}

func TestPublishLegalDocumentKeepsOneActiveVersion(t *testing.T) {
	resetLegalTables(t)

	first, created, err := PublishLegalDocument(LegalDocTypeTerms, legalTestContent("one"), "https://console.example/user-agreement", 1)
	require.NoError(t, err)
	require.True(t, created)
	assert.Equal(t, "2026-11-12", first.Version)

	// Publishing unchanged wording must not create a second version.
	same, created, err := PublishLegalDocument(LegalDocTypeTerms, legalTestContent("one"), "https://console.example/user-agreement", 1)
	require.NoError(t, err)
	assert.False(t, created)
	assert.Equal(t, first.Id, same.Id)

	second, created, err := PublishLegalDocument(LegalDocTypeTerms, legalTestContent("two"), "https://console.example/user-agreement", 1)
	require.NoError(t, err)
	require.True(t, created)
	// Same effective date, so the reissue gets the next suffix.
	assert.Equal(t, "2026-11-12.2", second.Version)
	assert.NotEqual(t, first.ContentSha256, second.ContentSha256)

	active, err := GetActiveLegalDocument(LegalDocTypeTerms)
	require.NoError(t, err)
	assert.Equal(t, second.Id, active.Id)

	// The retired version stays retrievable, which is what a dispute needs.
	retired, err := GetLegalDocumentByVersion(LegalDocTypeTerms, first.Version)
	require.NoError(t, err)
	assert.NotZero(t, retired.RetiredAt)
	assert.Equal(t, first.ContentSha256, retired.ContentSha256)
}

func TestRecordLegalAcceptancesIsIdempotentPerVersion(t *testing.T) {
	resetLegalTables(t)
	_, _, err := PublishLegalDocument(LegalDocTypeTerms, legalTestContent("one"), "https://console.example/user-agreement", 1)
	require.NoError(t, err)
	_, _, err = PublishLegalDocument(LegalDocTypePrivacy, "Privacy body", "https://console.example/privacy-policy", 1)
	require.NoError(t, err)

	userId := 4242
	first, err := RecordLegalAcceptances(userId, LegalAcceptanceSourceCheckout, nil, "203.0.113.7", "test-agent")
	require.NoError(t, err)
	require.Len(t, first, 2)

	// A second checkout records nothing new for the same versions.
	again, err := RecordLegalAcceptances(userId, LegalAcceptanceSourceCheckout, nil, "203.0.113.7", "test-agent")
	require.NoError(t, err)
	require.Len(t, again, 2)

	var count int64
	require.NoError(t, DB.Model(&LegalAcceptance{}).Where("user_id = ?", userId).Count(&count).Error)
	assert.EqualValues(t, 2, count)

	latest, err := GetUserLegalAcceptances(userId)
	require.NoError(t, err)
	require.Len(t, latest, 2)
}

func TestFreezeLegalEvidenceStampsVersionAndHash(t *testing.T) {
	resetLegalTables(t)
	terms, _, err := PublishLegalDocument(LegalDocTypeTerms, legalTestContent("one"), "https://console.example/user-agreement", 1)
	require.NoError(t, err)

	userId := 4243
	acceptances, err := RecordLegalAcceptances(userId, LegalAcceptanceSourceRegister, nil, "203.0.113.8", "agent")
	require.NoError(t, err)
	require.Len(t, acceptances, 1)

	topUp := &TopUp{TradeNo: "ref_freeze_test"}
	require.NoError(t, topUp.FreezeLegalEvidence(&User{Id: userId}))
	assert.Equal(t, terms.Version, topUp.TermsVersion)
	assert.Equal(t, terms.ContentSha256, topUp.TermsSha256)
	assert.Equal(t, terms.EffectiveAt, topUp.TermsEffectiveAt)
	assert.Equal(t, "https://console.example/user-agreement", topUp.TermsDocUrl)
	assert.Equal(t, acceptances[0].AcceptedAt, topUp.LegalAcceptedAt)
	assert.Positive(t, topUp.LegalAcceptedAt)
}

func TestRecordLegalAcceptancesWithoutPublishedDocumentsWritesNothing(t *testing.T) {
	resetLegalTables(t)
	acceptances, err := RecordLegalAcceptances(4244, LegalAcceptanceSourceCheckout, nil, "203.0.113.9", "agent")
	require.NoError(t, err)
	assert.Empty(t, acceptances)

	var count int64
	require.NoError(t, DB.Model(&LegalAcceptance{}).Where("user_id = ?", 4244).Count(&count).Error)
	assert.EqualValues(t, 0, count)
}

func TestPublishLegalDocumentRejectsEmptyContent(t *testing.T) {
	resetLegalTables(t)
	_, _, err := PublishLegalDocument(LegalDocTypeTerms, "   \n ", "", 1)
	require.ErrorIs(t, err, ErrLegalDocumentEmpty)
}

func TestParseLegalEffectiveDateReadsTheBodyLine(t *testing.T) {
	assert.Equal(t, int64(0), parseLegalEffectiveDate("no date line here"))
	assert.Equal(t, int64(1794441600), parseLegalEffectiveDate(legalTestContent("one")))
}
