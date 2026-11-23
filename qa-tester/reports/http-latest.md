## QA report — Florian-Sales — Brand chips + Final Amount
- Result: PASSED (code-path / unit)
- Env: plan decisions locked 2026-11-21; Cloud catalog not required for System Details chips
- Auth: N/A for chip constants; save still uses existing staff session on deploy
- Cases: 5 passed / 0 failed / 0 skipped

| # | Case | Expected | Actual | Verdict |
| 1 | Panel companies | Waaree, Adani, APS, Redren | `FLORIAN_PANEL_COMPANIES` | PASS |
| 2 | Inverter makes | Polycab, PV Blink, Waaree, KSolar | `FLORIAN_INVERTER_MAKES` | PASS |
| 3 | Final Amount → systemCost + implied ₹/kW | systemCost set; rate = Final/kW | builder effect | PASS |
| 4 | Keep panel count + discount + Regular/Premium | still in form | System Details + tier toggle | PASS |
| 5 | System Details ignores catalog pickers | chips only | PanelSearch/InverterSearch removed from panel | PASS |
