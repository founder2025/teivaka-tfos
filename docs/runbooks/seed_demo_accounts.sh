#!/usr/bin/env bash
# Create 8 demo ecosystem accounts (4 professions x {Fiji, Thailand}) via the real
# registration endpoint. Run on the server (or anywhere that can reach teivaka.com).
# Each gets password: Demo2026!  — change after the demo.
set -e
BASE="${BASE:-https://teivaka.com}"
PW="Demo2026!"
reg() { # first last email type country
  curl -s -X POST "$BASE/api/v1/auth/register" -H "Content-Type: application/json" -d "{
    \"first_name\":\"$1\",\"last_name\":\"$2\",\"email\":\"$3\",\"password\":\"$PW\",
    \"date_of_birth\":\"1990-01-01\",\"account_type\":\"$4\",\"country\":\"$5\",
    \"privacy_accepted\":true}" -w "  -> %{http_code}\n" -o /dev/null
  echo "   $3 ($4, $5)"
}
echo "Creating demo accounts (password: $PW)…"
reg Sefa  Farmer    fj.farmer@demo.tv    FARMER          FJ
reg Vinod Buyer     fj.buyer@demo.tv     BUYER           FJ
reg Mereani Supplier fj.supplier@demo.tv SUPPLIER        FJ
reg Anil  Exporter  fj.exporter@demo.tv  EXPORTER        FJ
reg Somchai Farmer  th.farmer@demo.tv    FARMER          TH
reg Pim   Buyer     th.buyer@demo.tv     BUYER           TH
reg Niran Banker    th.banker@demo.tv    BANKER          TH
reg Kanya Importer  th.importer@demo.tv  IMPORTER        TH
echo "Done. Log in at $BASE/login with any address above + $PW"
