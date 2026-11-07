#!/bin/bash
# Check for service role key patterns
SECRET_PATTERN="sb_secret_[a-zA-Z0-9_]+"
if grep -rE "$SECRET_PATTERN" . --exclude-dir=node_modules --exclude=".env*" --exclude="check-secrets.sh"; then
  echo "❌ SECRET LEAK DETECTED: Service role key found in source code!"
  exit 1
fi

if grep -r "service_role" . --exclude-dir=node_modules --exclude=".env*" --exclude="check-secrets.sh"; then
  echo "❌ SECRET LEAK DETECTED: 'service_role' found in source code!"
  exit 1
fi

echo "✅ No secrets found in source code."
exit 0
