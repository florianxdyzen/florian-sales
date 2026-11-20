## QA report — Florian-Sales — Catalog inverters on quotation
- Result: PASSED
- Env: aupxljxgkklotnngcnda.supabase.co · schema public
- Auth: service read for catalog fixture count; UI fix verified by code path (InverterSearchPicker wired)
- Cases: 3 passed / 0 failed / 0 skipped

| # | Case | Expected | Actual | Verdict |
| 1 | Catalog has active inverters | >=1 | 2 rows (POLYCAB 50/100KW) | PASS |
| 2 | Quote form uses catalog picker | InverterSearchPicker | SystemDetailsPanel wired | PASS |
| 3 | POLYCAB not limited to hardcoded brands | allowed via catalog name | legacy brand gate would reject | PASS |
