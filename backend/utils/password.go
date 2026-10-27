package utils

import (
	"errors"
	"unicode"
)

// MaxPasswordBytes is bcrypt's hard input limit; longer passwords are
// rejected up front instead of being silently truncated or failing late.
const MaxPasswordBytes = 72

// ValidatePasswordPolicy enforces: 8-72 bytes, uppercase, number, symbol.
// Shared by self-service flows (auth) and admin-set passwords (users).
func ValidatePasswordPolicy(password string) error {
	if len(password) < 8 {
		return errors.New("password must be at least 8 characters")
	}
	if len(password) > MaxPasswordBytes {
		return errors.New("password must be at most 72 bytes")
	}
	var hasUpper, hasNumber, hasSymbol bool
	for _, r := range password {
		switch {
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsNumber(r):
			hasNumber = true
		case unicode.IsPunct(r) || unicode.IsSymbol(r):
			hasSymbol = true
		}
	}
	if !hasUpper {
		return errors.New("password must contain at least one uppercase letter")
	}
	if !hasNumber {
		return errors.New("password must contain at least one number")
	}
	if !hasSymbol {
		return errors.New("password must contain at least one symbol")
	}
	return nil
}
