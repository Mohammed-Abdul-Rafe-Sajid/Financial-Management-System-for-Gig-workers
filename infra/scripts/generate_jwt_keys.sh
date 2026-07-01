#!/bin/bash
# =============================================================================
# generate_jwt_keys.sh
# Generates RS256 key pair for JWT signing/verification.
# Run ONCE before first `docker-compose up`.
# =============================================================================

set -e

KEYS_DIR="$(dirname "$0")/../keys"
mkdir -p "$KEYS_DIR"

if [ -f "$KEYS_DIR/private.pem" ]; then
  echo "⚠️  Keys already exist at $KEYS_DIR. Delete them first if you want to regenerate."
  exit 0
fi

echo "Generating RSA-2048 key pair..."
openssl genrsa -out "$KEYS_DIR/private.pem" 2048
openssl rsa -in "$KEYS_DIR/private.pem" -pubout -out "$KEYS_DIR/public.pem"

echo ""
echo "✅ Keys generated:"
echo "   Private key: $KEYS_DIR/private.pem  (used by user-service ONLY)"
echo "   Public key:  $KEYS_DIR/public.pem   (mounted into all services)"
echo ""
echo "⚠️  NEVER commit private.pem to version control."
echo "   Both files are in .gitignore."
