package system_setting

var ServerAddress = "http://localhost:3000"
var TaskPublicAddress = ""

// ApiAddress is the relay base URL shown to users (API keys, setup guide,
// code samples, client imports). Empty falls back to ServerAddress. Console
// pages requested on its host redirect to ServerAddress
// (middleware.ApiHostRedirect). It does not affect OAuth callbacks, payment
// returns or other ServerAddress uses.
var ApiAddress = ""
var WorkerUrl = ""
var WorkerValidKey = ""
var WorkerAllowHttpImageRequestEnabled = false

func EnableWorker() bool {
	return WorkerUrl != ""
}
