package auth

import (
	"baseadmin/backend/utils"

	"golang.org/x/crypto/bcrypt"
)

const bcryptCost = 12

func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	return string(b), err
}

func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// ValidatePasswordPolicy enforces the shared password policy (see utils).
func ValidatePasswordPolicy(password string) error {
	return utils.ValidatePasswordPolicy(password)
}
