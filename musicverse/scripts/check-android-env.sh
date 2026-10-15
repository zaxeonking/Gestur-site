#!/usr/bin/env bash
# Memeriksa prasyarat build Android. Tidak mengubah apa pun.
ok=0
say() { printf '%-22s %s\n' "$1" "$2"; }

if command -v node >/dev/null; then
  v=$(node -v); major=${v#v}; major=${major%%.*}
  if [ "$major" -ge 22 ]; then say "Node.js" "OK ($v)"; else say "Node.js" "PERLU DICEK ($v) - Capacitor terbaru butuh Node 22+, lihat https://capacitorjs.com/docs/getting-started/environment-setup"; ok=1; fi
else say "Node.js" "TIDAK ADA"; ok=1; fi

if command -v java >/dev/null; then say "Java" "$(java -version 2>&1 | head -1)  (butuh JDK 21)"; else say "Java" "TIDAK ADA (butuh JDK 21)"; ok=1; fi

sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -n "$sdk" ] && [ -d "$sdk" ]; then say "Android SDK" "OK ($sdk)"; else say "Android SDK" "TIDAK DITEMUKAN (set ANDROID_HOME)"; ok=1; fi

if command -v adb >/dev/null; then
  say "adb" "OK"; adb devices | sed 's/^/                       /'
else say "adb" "TIDAK ADA (tambahkan \$ANDROID_HOME/platform-tools ke PATH)"; ok=1; fi

[ -d node_modules ] && say "node_modules" "OK" || { say "node_modules" "BELUM (jalankan npm install)"; ok=1; }
[ -d android ] && say "folder android/" "OK" || say "folder android/" "BELUM (jalankan npx cap add android)"
exit $ok
