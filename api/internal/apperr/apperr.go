// Package apperr defines the typed errors the API returns to clients.
package apperr

import "net/http"

type Error struct {
	Status  int               `json:"-"`
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

func NotFound() *Error {
	return &Error{Status: http.StatusNotFound, Code: "not_found", Message: "resource not found"}
}

func Unauthorized() *Error {
	return &Error{Status: http.StatusUnauthorized, Code: "unauthorized", Message: "authentication required"}
}

func BadRequest(msg string) *Error {
	return &Error{Status: http.StatusBadRequest, Code: "bad_request", Message: msg}
}

func Validation(fields map[string]string) *Error {
	return &Error{Status: http.StatusUnprocessableEntity, Code: "validation_failed", Message: "invalid input", Fields: fields}
}

func InvalidReference(field string) *Error {
	return &Error{Status: http.StatusUnprocessableEntity, Code: "invalid_reference", Message: "referenced resource does not exist",
		Fields: map[string]string{field: "does not exist"}}
}

func Conflict(code, msg string) *Error {
	return &Error{Status: http.StatusConflict, Code: code, Message: msg}
}

// InsufficientBalance: a withdrawal or transfer is larger than what the savings account holds.
func InsufficientBalance() *Error {
	return &Error{Status: http.StatusUnprocessableEntity, Code: "insufficient_balance", Message: "the amount is larger than the account balance",
		Fields: map[string]string{"amount": "exceeds the account balance"}}
}

func RateLimited() *Error {
	return &Error{Status: http.StatusTooManyRequests, Code: "rate_limited", Message: "too many requests"}
}

func MonthOutOfRange() *Error {
	return &Error{Status: http.StatusUnprocessableEntity, Code: "month_out_of_range", Message: "month is more than 12 months ahead"}
}

// V collects field validation failures; the first message per field wins.
type V struct{ fields map[string]string }

func (v *V) Check(ok bool, field, msg string) {
	if ok {
		return
	}
	if v.fields == nil {
		v.fields = map[string]string{}
	}
	if _, exists := v.fields[field]; !exists {
		v.fields[field] = msg
	}
}

func (v *V) Err() error {
	if len(v.fields) == 0 {
		return nil
	}
	return Validation(v.fields)
}
