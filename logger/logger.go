package logger

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel/trace"
)

const maxLogCount = 1000000

var logCount int
var setupLogLock sync.Mutex
var setupLogWorking bool
var currentLogPath string
var currentLogPathMu sync.RWMutex
var currentLogFile *os.File

func GetCurrentLogPath() string {
	currentLogPathMu.RLock()
	defer currentLogPathMu.RUnlock()
	return currentLogPath
}

func SetupLogger() {
	defer func() {
		setupLogWorking = false
	}()
	if *common.LogDir != "" {
		ok := setupLogLock.TryLock()
		if !ok {
			common.SysLog(common.LogText("setup log is already working"))
			return
		}
		defer func() {
			setupLogLock.Unlock()
		}()
		logPath := filepath.Join(*common.LogDir, fmt.Sprintf("oneapi-%s.log", time.Now().Format("20060102150405")))
		fd, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err != nil {
			common.FatalLog(common.LogText("failed to open log file"))
		}
		currentLogPathMu.Lock()
		oldFile := currentLogFile
		currentLogPath = logPath
		currentLogFile = fd
		currentLogPathMu.Unlock()

		common.LogWriterMu.Lock()
		gin.DefaultWriter = io.MultiWriter(os.Stdout, fd)
		gin.DefaultErrorWriter = io.MultiWriter(os.Stderr, fd)
		if oldFile != nil {
			_ = oldFile.Close()
		}
		common.LogWriterMu.Unlock()
	}
}

func LogInfo(ctx context.Context, msg string) {
	logHelper(ctx, common.LogLevelInfo, msg)
}

func LogWarn(ctx context.Context, msg string, args ...any) {
	if len(args) > 0 {
		msg = fmt.Sprintf(msg, args...)
	}
	logHelper(ctx, common.LogLevelWarn, msg)
}

func LogError(ctx context.Context, msg string) {
	logHelper(ctx, common.LogLevelError, msg)
}

// LogDebug formats msg with common.LogText only when debug logging is on, so
// callers pass the format and its arguments instead of a formatted string.
func LogDebug(ctx context.Context, msg string, args ...any) {
	if common.DebugEnabled {
		logHelper(ctx, common.LogLevelDebug, common.LogText(msg, args...))
	}
}

func logHelper(ctx context.Context, level string, msg string) {
	record := common.LogRecord{Level: level, Message: msg}
	if ctx != nil {
		record.RequestID, _ = ctx.Value(common.RequestIdKey).(string)
		// A *gin.Context hands out only its own keys; the relay request's span
		// is on its request's context.
		if c, ok := ctx.(*gin.Context); ok && c.Request != nil {
			ctx = c.Request.Context()
		}
		if span := trace.SpanContextFromContext(ctx); span.IsValid() {
			record.TraceID = span.TraceID().String()
			record.SpanID = span.SpanID().String()
		}
	}
	common.LogWriterMu.RLock()
	writer := gin.DefaultErrorWriter
	if level == common.LogLevelInfo {
		writer = gin.DefaultWriter
	}
	common.WriteLogLine(writer, record)
	common.LogWriterMu.RUnlock()
	logCount++ // we don't need accurate count, so no lock here
	if logCount > maxLogCount && !setupLogWorking {
		logCount = 0
		setupLogWorking = true
		gopool.Go(func() {
			SetupLogger()
		})
	}
}

// LogQuota formats a quota for a server log line.
func LogQuota(quota int) string {
	// 新逻辑：根据额度展示类型输出
	q := float64(quota)
	switch operation_setting.GetQuotaDisplayType() {
	case operation_setting.QuotaDisplayTypeCNY:
		usd := q / common.QuotaPerUnit
		cny := usd * operation_setting.USDExchangeRate
		return common.LogText("¥%.6f quota", cny)
	case operation_setting.QuotaDisplayTypeCustom:
		usd := q / common.QuotaPerUnit
		rate := operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate
		symbol := operation_setting.GetGeneralSetting().CustomCurrencySymbol
		if symbol == "" {
			symbol = "¤"
		}
		if rate <= 0 {
			rate = 1
		}
		v := usd * rate
		return common.LogText("%s%.6f quota", symbol, v)
	case operation_setting.QuotaDisplayTypeTokens:
		return common.LogText("%d quota points", quota)
	default: // USD
		return common.LogText("＄%.6f quota", q/common.QuotaPerUnit)
	}
}

func FormatQuota(quota int) string {
	q := float64(quota)
	switch operation_setting.GetQuotaDisplayType() {
	case operation_setting.QuotaDisplayTypeCNY:
		usd := q / common.QuotaPerUnit
		cny := usd * operation_setting.USDExchangeRate
		return fmt.Sprintf("¥%.6f", cny)
	case operation_setting.QuotaDisplayTypeCustom:
		usd := q / common.QuotaPerUnit
		rate := operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate
		symbol := operation_setting.GetGeneralSetting().CustomCurrencySymbol
		if symbol == "" {
			symbol = "¤"
		}
		if rate <= 0 {
			rate = 1
		}
		v := usd * rate
		return fmt.Sprintf("%s%.6f", symbol, v)
	case operation_setting.QuotaDisplayTypeTokens:
		return fmt.Sprintf("%d", quota)
	default:
		return fmt.Sprintf("＄%.6f", q/common.QuotaPerUnit)
	}
}

// LogJson 仅供测试使用 only for test
func LogJson(ctx context.Context, msg string, obj any) {
	if !common.DebugEnabled {
		return
	}
	jsonStr, err := common.Marshal(obj)
	if err != nil {
		LogError(ctx, common.LogText("json marshal failed: %s", err.Error()))
		return
	}
	LogDebug(ctx, "%s | %s", msg, jsonStr)
}
