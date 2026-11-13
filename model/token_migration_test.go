package model

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func requireTokenConstraintExists(t *testing.T, db *gorm.DB, constraintName string) {
	t.Helper()
	var count int64
	require.NoError(t, db.Raw(`
SELECT count(*)
FROM pg_catalog.pg_constraint
WHERE conrelid = to_regclass(?)
  AND conname = ?`, "tokens", constraintName).Scan(&count).Error)
	require.EqualValues(t, 1, count)
}

func requireTokenIndexExists(t *testing.T, db *gorm.DB, indexName string) {
	t.Helper()
	var count int64
	require.NoError(t, db.Raw(`
SELECT count(*)
FROM pg_catalog.pg_index AS index_meta
JOIN pg_catalog.pg_class AS index_class
  ON index_class.oid = index_meta.indexrelid
WHERE index_meta.indrelid = to_regclass(?)
  AND index_class.relname = ?`, "tokens", indexName).Scan(&count).Error)
	require.EqualValues(t, 1, count)
}

func testTokenKeyMigrationNonPostgreSQL(t *testing.T, db *gorm.DB) {
	t.Helper()
	tableName := fmt.Sprintf("token_migration_%d", time.Now().UnixNano())
	t.Cleanup(func() { _ = db.Migrator().DropTable(tableName) })

	tableDB := db.Table(tableName)
	require.NoError(t, tableDB.AutoMigrate(&Token{}))
	require.NoError(t, tableDB.Create(&Token{UserId: 1, Key: "preserved-key"}).Error)

	for range 2 {
		require.NoError(t, migrateTokenKeyUniqueness(db))
		require.NoError(t, tableDB.AutoMigrate(&Token{}))
	}

	var preserved Token
	require.NoError(t, tableDB.Where(&Token{Key: "preserved-key"}).First(&preserved).Error)
	assert.Equal(t, 1, preserved.UserId)
	expectedIndex := db.NamingStrategy.IndexName(tableName, "key")
	assert.True(t, db.Migrator().HasIndex(tableName, expectedIndex))
}

func TestMigrateTokenKeyUniquenessSQLite(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	testTokenKeyMigrationNonPostgreSQL(t, db)
}

func TestMigrateTokenKeyUniquenessMySQL(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TEST_MYSQL_DSN"))
	if dsn == "" {
		t.Skip("TEST_MYSQL_DSN is not configured")
	}

	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })
	testTokenKeyMigrationNonPostgreSQL(t, db)
}

func TestMigrateTokenKeyUniquenessPostgreSQL(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TEST_POSTGRES_DSN"))
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}

	db, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  dsn,
		PreferSimpleProtocol: true,
	}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })

	tests := []struct {
		name                 string
		prepareOld           func(*testing.T, *gorm.DB)
		expectedError        string
		preservedConstraints []string
		preservedIndexes     []string
	}{
		{name: "fresh"},
		{
			name: "legacy_idx_constraint",
			prepareOld: func(t *testing.T, tx *gorm.DB) {
				t.Helper()
				require.NoError(t, tx.Migrator().DropIndex(&Token{}, tokenKeyIndex))
				require.NoError(t, tx.Exec(
					"ALTER TABLE ? ADD CONSTRAINT ? UNIQUE (?)",
					clause.Table{Name: "tokens"},
					clause.Column{Name: tokenKeyIndex},
					clause.Column{Name: "key"},
				).Error)
			},
		},
		{
			name: "gorm_generated_constraint",
			prepareOld: func(t *testing.T, tx *gorm.DB) {
				t.Helper()
				require.NoError(t, tx.Exec(
					"ALTER TABLE ? ADD CONSTRAINT ? UNIQUE (?)",
					clause.Table{Name: "tokens"},
					clause.Column{Name: gormTokenKeyConstraint},
					clause.Column{Name: "key"},
				).Error)
			},
		},
		{
			name: "postgres_default_constraint_without_target_index",
			prepareOld: func(t *testing.T, tx *gorm.DB) {
				t.Helper()
				require.NoError(t, tx.Migrator().DropIndex(&Token{}, tokenKeyIndex))
				require.NoError(t, tx.Exec(
					"ALTER TABLE ? ADD CONSTRAINT ? UNIQUE (?)",
					clause.Table{Name: "tokens"},
					clause.Column{Name: postgresTokenKeyConstraint},
					clause.Column{Name: "key"},
				).Error)
			},
		},
		{
			name: "non_conflicting_uniqueness_is_preserved",
			prepareOld: func(t *testing.T, tx *gorm.DB) {
				t.Helper()
				require.NoError(t, tx.Exec(
					"ALTER TABLE ? ADD CONSTRAINT ? UNIQUE (?)",
					clause.Table{Name: "tokens"},
					clause.Column{Name: postgresTokenKeyConstraint},
					clause.Column{Name: "key"},
				).Error)
				require.NoError(t, tx.Exec(
					"ALTER TABLE ? ADD CONSTRAINT ? UNIQUE (?, ?)",
					clause.Table{Name: "tokens"},
					clause.Column{Name: "keep_tokens_key_user_id"},
					clause.Column{Name: "key"},
					clause.Column{Name: "user_id"},
				).Error)
				require.NoError(t, tx.Exec(
					"CREATE UNIQUE INDEX ? ON ? (?) WHERE user_id > 0",
					clause.Column{Name: "keep_tokens_partial_key"},
					clause.Table{Name: "tokens"},
					clause.Column{Name: "key"},
				).Error)
			},
			preservedConstraints: []string{"keep_tokens_key_user_id"},
			preservedIndexes:     []string{"keep_tokens_partial_key"},
		},
		{
			name: "arbitrary_constraint_is_rejected",
			prepareOld: func(t *testing.T, tx *gorm.DB) {
				t.Helper()
				require.NoError(t, tx.Exec(
					"ALTER TABLE ? ADD CONSTRAINT ? UNIQUE (?)",
					clause.Table{Name: "tokens"},
					clause.Column{Name: "keep_tokens_key_unique"},
					clause.Column{Name: "key"},
				).Error)
			},
			expectedError:        "unsupported unique constraint",
			preservedConstraints: []string{"keep_tokens_key_unique"},
		},
		{
			name: "deferrable_constraint_is_rejected",
			prepareOld: func(t *testing.T, tx *gorm.DB) {
				t.Helper()
				require.NoError(t, tx.Migrator().DropIndex(&Token{}, tokenKeyIndex))
				require.NoError(t, tx.Exec(
					"ALTER TABLE ? ADD CONSTRAINT ? UNIQUE (?) DEFERRABLE INITIALLY DEFERRED",
					clause.Table{Name: "tokens"},
					clause.Column{Name: postgresTokenKeyConstraint},
					clause.Column{Name: "key"},
				).Error)
			},
			expectedError:        "unsupported definition",
			preservedConstraints: []string{postgresTokenKeyConstraint},
		},
		{
			name: "invalid_target_index_is_rejected",
			prepareOld: func(t *testing.T, tx *gorm.DB) {
				t.Helper()
				require.NoError(t, tx.Migrator().DropIndex(&Token{}, tokenKeyIndex))
				require.NoError(t, tx.Exec(
					"CREATE INDEX ? ON ? (?)",
					clause.Column{Name: tokenKeyIndex},
					clause.Table{Name: "tokens"},
					clause.Column{Name: "key"},
				).Error)
				require.NoError(t, tx.Exec(
					"ALTER TABLE ? ADD CONSTRAINT ? UNIQUE (?)",
					clause.Table{Name: "tokens"},
					clause.Column{Name: postgresTokenKeyConstraint},
					clause.Column{Name: "key"},
				).Error)
			},
			expectedError:        "unexpected definition",
			preservedConstraints: []string{postgresTokenKeyConstraint},
			preservedIndexes:     []string{tokenKeyIndex},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			tx := db.Begin()
			require.NoError(t, tx.Error)
			t.Cleanup(func() { _ = tx.Rollback().Error })

			schemaName := fmt.Sprintf("token_migration_%d", time.Now().UnixNano())
			require.NoError(t, tx.Exec(
				"CREATE SCHEMA ?",
				clause.Table{Name: schemaName},
			).Error)
			require.NoError(t, tx.Exec(
				"SET LOCAL search_path TO ?",
				clause.Table{Name: schemaName},
			).Error)

			require.NoError(t, migrateTokenKeyUniqueness(tx))
			require.NoError(t, tx.AutoMigrate(&Token{}))
			original := Token{UserId: 1, Key: "preserved-key", Name: "preserve me"}
			require.NoError(t, tx.Create(&original).Error)
			if test.prepareOld != nil {
				test.prepareOld(t, tx)
			}

			if test.expectedError != "" {
				err := migrateTokenKeyUniqueness(tx)
				require.Error(t, err)
				assert.Contains(t, err.Error(), test.expectedError)
				for _, constraintName := range test.preservedConstraints {
					requireTokenConstraintExists(t, tx, constraintName)
				}
				for _, indexName := range test.preservedIndexes {
					requireTokenIndexExists(t, tx, indexName)
				}
				return
			}

			for range 2 {
				require.NoError(t, migrateTokenKeyUniqueness(tx))
				require.NoError(t, tx.AutoMigrate(&Token{}))
			}

			var preserved Token
			require.NoError(t, tx.First(&preserved, original.Id).Error)
			assert.Equal(t, original.Key, preserved.Key)
			assert.Equal(t, original.Name, preserved.Name)

			constraints, err := inspectTokenKeyUniqueConstraints(tx, "tokens")
			require.NoError(t, err)
			assert.Empty(t, constraints)
			targetIndex, err := inspectTokenKeyIndex(tx, "tokens")
			require.NoError(t, err)
			assert.True(t, targetIndex.standaloneValid)
			for _, constraintName := range test.preservedConstraints {
				requireTokenConstraintExists(t, tx, constraintName)
			}
			for _, indexName := range test.preservedIndexes {
				requireTokenIndexExists(t, tx, indexName)
			}

			duplicateError := tx.Transaction(func(duplicateTx *gorm.DB) error {
				return duplicateTx.Create(&Token{UserId: 2, Key: original.Key}).Error
			})
			require.Error(t, duplicateError)

			var totalRows int64
			require.NoError(t, tx.Model(&Token{}).Count(&totalRows).Error)
			assert.EqualValues(t, 1, totalRows)
		})
	}
}

// releasedToken is the tokens schema of the last release, which stored API
// keys in plaintext and had no key_hint column.
type releasedToken struct {
	Id        int
	UserId    int            `gorm:"index"`
	Key       string         `gorm:"column:key;type:varchar(128);uniqueIndex"`
	Name      string         `gorm:"index"`
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

// testTokenKeyHashMigration upgrades a table written by the last release and
// starts twice: every plaintext key, including a soft-deleted one, must end up
// as its hash with a masked hint, and the second start must change nothing.
func testTokenKeyHashMigration(t *testing.T, db *gorm.DB) {
	t.Helper()
	tableName := fmt.Sprintf("token_key_hash_%d", time.Now().UnixNano())
	t.Cleanup(func() { _ = db.Migrator().DropTable(tableName) })
	require.NoError(t, db.Table(tableName).AutoMigrate(&releasedToken{}))

	plaintexts := []string{
		"ActiveKey0123456789abcdefghijklmnopqrstuvwxyzAB",
		"DeletedKey0123456789abcdefghijklmnopqrstuvwxyzA",
	}
	for index, plaintext := range plaintexts {
		row := releasedToken{UserId: 1, Key: plaintext, Name: fmt.Sprintf("released-%d", index)}
		require.NoError(t, db.Table(tableName).Create(&row).Error)
	}
	require.NoError(t, db.Table(tableName).Where("name = ?", "released-1").Delete(&releasedToken{}).Error)

	recorder := &migrationSQLRecorder{}
	for pass := range 2 {
		recorder.reset()
		session := db.Session(&gorm.Session{Logger: recorder})
		require.NoError(t, session.Table(tableName).AutoMigrate(&Token{}))
		require.NoError(t, migrateTokenKeysToHash(session.Table(tableName)))
		if pass == 1 {
			assert.Empty(t, recorder.schemaMutations(), "repeated startup must not change the schema")
			for _, statement := range recorder.statements {
				assert.NotContains(t, strings.ToUpper(statement), "UPDATE", "repeated startup must not rewrite keys")
			}
		}
	}

	var tokens []Token
	require.NoError(t, db.Table(tableName).Unscoped().Order("id").Find(&tokens).Error)
	require.Len(t, tokens, len(plaintexts))
	for index, plaintext := range plaintexts {
		assert.Equal(t, HashTokenKey(plaintext), tokens[index].Key)
		assert.Equal(t, MaskTokenKey(plaintext), tokens[index].KeyHint)
	}
	var plaintextRows int64
	require.NoError(t, db.Table(tableName).Unscoped().Where(clause.IN{Column: clause.Column{Name: "key"}, Values: []any{plaintexts[0], plaintexts[1]}}).Count(&plaintextRows).Error)
	assert.Zero(t, plaintextRows, "no plaintext key may remain, deleted rows included")
}

func TestMigrateTokenKeysToHashSQLite(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	testTokenKeyHashMigration(t, db)
}

func TestMigrateTokenKeysToHashMySQL(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TEST_MYSQL_DSN"))
	if dsn == "" {
		t.Skip("TEST_MYSQL_DSN is not configured")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })
	testTokenKeyHashMigration(t, db)
}

func TestMigrateTokenKeysToHashPostgreSQL(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TEST_POSTGRES_DSN"))
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })
	testTokenKeyHashMigration(t, db)
}
