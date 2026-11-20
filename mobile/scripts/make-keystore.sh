#!/usr/bin/env bash
# Skapar en riktig signeringsnyckel för AppGallery (och Google Play).
#
#   bash scripts/make-keystore.sh
#
# Nyckeln är det enda som binder samman dagens app med alla framtida
# uppdateringar. Tappar du den kan appen aldrig uppdateras — bara läggas ut på
# nytt under ett nytt paketnamn med noll användare. Därför:
#
#   1. Filen hamnar i mobile/android/keystore.properties, som är gitignored.
#   2. Den ska säkerhetskopieras på minst två ställen utanför datorn.
#   3. Lösenorden ska också finnas i en lösenordshanterare, inte bara i filen.
#
# Skriptet skriver aldrig ut lösenordet i terminalen efteråt.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -d android ]]; then
  echo "android/ saknas. Kör först:  npx expo prebuild --platform android" >&2
  exit 2
fi

if [[ -f android/keystore.properties ]]; then
  echo "android/keystore.properties finns redan. Ta bort den först om du verkligen vill skapa en ny nyckel." >&2
  exit 2
fi

: "${KEYSTORE_PASSWORD:=}"
: "${KEY_PASSWORD:=}"

if [[ -z "$KEYSTORE_PASSWORD" ]]; then
  if command -v openssl >/dev/null; then
    KEYSTORE_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
    echo "Skapade ett slumpat lösenord. Det skrivs till filen, inte till skärmen."
  else
    echo "Sätt KEYSTORE_PASSWORD i miljön. Skriptet vill inte gissa ett lösenord." >&2
    exit 2
  fi
fi
: "${KEY_PASSWORD:=$KEYSTORE_PASSWORD}"

KEY_ALIAS="${KEY_ALIAS:-safepath}"

keytool -genkeypair \
  -v \
  -storetype PKCS12 \
  -keystore android/safepath-release.keystore \
  -alias "$KEY_ALIAS" \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10950 \
  -storepass "$KEYSTORE_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -dname "CN=Mario Lundqvist OU, O=Mario Lundqvist OU, L=Tallinn, C=EE" \
  > /dev/null

cat > android/keystore.properties <<EOF
# Skapad av scripts/make-keystore.sh. Får aldrig checkas in.
storeFile=safepath-release.keystore
storePassword=$KEYSTORE_PASSWORD
keyAlias=$KEY_ALIAS
keyPassword=$KEY_PASSWORD
EOF

chmod 600 android/keystore.properties android/safepath-release.keystore

echo
echo "Nyckel skapad:"
echo "  mobile/android/safepath-release.keystore   (4096-bitars RSA, 30 år)"
echo "  mobile/android/keystore.properties         (lösenord, gitignored)"
echo
echo "Gör nu detta, innan du glömmer det:"
echo "  1. Säkerhetskopiera BÅDA filerna till två ställen utanför den här datorn."
echo "  2. Lägg lösenordet i din lösenordshanterare."
echo "  3. Notera certifikatets SHA-256, den behövs i AppGallery Connect:"
keytool -list -v -keystore android/safepath-release.keystore -alias "$KEY_ALIAS" -storepass "$KEYSTORE_PASSWORD" \
  | grep -A2 "SHA256:" | head -3
