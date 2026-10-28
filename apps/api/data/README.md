# API data files

## `common-passwords.txt`

Passwords refused at set/reset time (D-051: "reject passwords found in a bundled common-password list").

- Source: SecLists `Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt`, commit
  `758fecf4925900dd1bd0a3cba39551d6b4f2da8c` (downloaded 2026-10-28), MIT licence — `common-passwords.LICENSE`.
- Kept: entries of 12–128 printable ASCII characters (shorter ones are refused by the length rule anyway), lowercased,
  sorted, de-duplicated — 46,146 lines. The check compares the lowercased candidate.
- Regenerate (POSIX awk, run on the downloaded file):
  `LC_ALL=C awk 'length($0)>=12 && length($0)<=128 && $0 ~ /^[\x21-\x7e]+$/ {print tolower($0)}' <file> | LC_ALL=C sort -u`
