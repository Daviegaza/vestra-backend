# Vestra Regulatory + Fiscal Compliance Research (July 2026)

## 1. Kenya Finance Act 2025 + Finance Bill 2026

**Current state:**
- Finance Act 2025 assented 26 June 2025, mostly effective 1 July 2025. MRI stayed at **7.5%** in the Act (proposed 10% hike was dropped after public outcry).
- **Digital Asset Tax (DAT) deleted**; replaced by **10% excise duty on platform fees** for virtual asset transfers.
- **Excise duty extended to all digital lenders** — including P2P and non-CBK-licensed fintechs.
- **Significant Economic Presence (SEP) tax** expanded — de minimis threshold removed; all non-resident digital service revenue now taxable.
- **CGT** now covers non-resident share transfers where value derives from Kenyan property.
- **Finance Bill 2026** re-proposes **MRI rise to 10%** and introduces a **non-resident landlord tax**. Bill not yet assented at time of research.

**Impact on Vestra:**
- MUST parameterize MRI rate in DB (not hardcode 7.5%) — likely jumps to 10% mid-2026.
- MUST detect and flag non-resident landlords via KRA PIN residency status; add withholding-agent workflow if FB2026 passes.
- If Vestra collects platform fees on rent payments and stores value beyond mere pass-through, review whether the 10% excise on digital-lender fees applies (grey zone if you offer rent-advance/deposit-financing).

**Effort:** Medium.
**Risk if ignored:** KRA penalty = 5% of tax + 1%/month interest.

---

## 2. CBK Regulatory Sandbox

**Current state:**
- CBK **has not operationalized a sandbox**. No cohort announced by mid-2026.
- The **operational sandbox is CMA's** (Capital Markets Authority), for capital-markets innovations. Fee **KES 10,000 non-refundable**, 12-month test window.
- Prop-fintech (escrow-SaaS with no securities component) is **not a natural CMA fit**.

**Impact on Vestra:**
- CANNOT use "sandbox" as a shortcut to hold client funds. Must partner with a licensed bank (PSP/trust) from day one.
- Consider CMA sandbox only if launching a fractional-ownership or tokenized-property offering.
- Engage CBK's National Payment System (NPS) team directly for a comfort letter on rent-collection flows.

**Flag: engage counsel and CBK NPS Division directly.**

---

## 3. ODPC Enforcement 2024-2026

**Current state:**
- ~357 determinations, 134 enforcement notices, 20 penalty notices, 184 compensation orders cumulative (mid-2025).
- **Biggest recent fines**: Roma School KES 4.55M; Mulla Pride (KeCredit) KES 2.975M — upheld by High Court; Casa Vera Lounge KES 1.85M; Liquid Telecom KES 700K; Whitepath KES 250K.
- **Registration threshold**: mandatory if turnover > KES 5M OR > 10 employees OR handling sensitive data OR > 10,000 data subjects/year OR operating in financial services, health, education, telecoms.
- **Fee**: KES 4,000-40,000 depending on size.
- **DPO required**: public bodies, sensitive-data-at-scale processors, systematic-monitoring-at-scale operators.
- **Cap**: KES 5M or 1% turnover (whichever lower). **Amendment Bill 2025** proposes changing to "whichever higher".
- 72-hour breach notification remains in force.

**Impact on Vestra:**
- MUST register as data controller AND processor from day one.
- MUST appoint a DPO.
- MUST implement 72-hour breach-notification runbook.
- MUST log lawful basis per processing purpose; separate consent for marketing SMS.
- Debt-collection-style pressure on defaulting tenants is HIGH risk — no third-party contact without explicit basis.

**Risk if ignored:** Up to KES 5M per determination (may rise to unlimited 1%+ if Amendment Bill passes).

---

## 4. Communications Authority of Kenya (CAK)

**Current state:**
- Bulk SMS requires **Sender ID registration** with CAK.
- Promotional SMS window **7am-7pm only**; DND registry compliance mandatory; opt-in required by DPA overlay.
- CAK regulates via Kenya Information and Communications Act; aggregators (Africa's Talking, Celcom, Bongo) must be CAK-licensed content service providers.

**Impact on Vestra:**
- MUST route SMS via a licensed aggregator; do NOT try direct MNO integration.
- MUST register a Sender ID (e.g., "VESTRA").
- MUST separate **transactional** from **promotional** message classes in code.
- MUST honor DND for marketing.

---

## 5. KRA iTax API + eTIMS for Real Estate

**Current state:**
- **eRITS launched 10 Apr 2025**; property managers and developers integrate via **Gava Connect API**.
- **eTIMS mandatory for landlords earning > KES 288K/year** from Jan 2026 — every rent payment needs an eTIMS-compliant invoice.
- KRA now cross-validates income + expenses in returns against electronic sources from 1 Jan 2026.

**Impact on Vestra:**
- MUST integrate Gava Connect for landlord MRI filing (this is Vestra's KEY differentiator — automate the 7.5% remittance).
- MUST generate eTIMS-compliant invoices per rent receipt.
- Expense-side: capture agent commissions, repair payments through Vestra to feed landlord deduction claims.

**Effort:** High (two API integrations).
**Risk if ignored:** Landlord clients face 5% penalty + 1%/month interest; Vestra loses core value prop.

---

## 6. KRA PIN + iCMS for Property Transfers

**Current state:**
- **National Stamp Duty Module (NSDM) launched Feb 2026** on Ardhisasa via **Ardhipay** — stamp duty NO LONGER paid on iTax.
- Ardhisasa account requires National ID + KRA PIN.
- Transactions **outside NSDM are invalid** — nationwide since Feb 2026.

**Impact on Vestra:**
- CANNOT bypass Ardhisasa/Ardhipay in the escrow-release step.
- No public API for Ardhisasa — must design a **human-in-the-loop workflow**.
- MUST collect KRA PIN for both buyer and seller at KYC.

---

## 7. Land Control Board Consent

**Current state:**
- **Still required** for agricultural land outside municipalities. Without consent, transaction null and void.
- **LCB application digitized** — can now be initiated via Ardhisasa. Physical hearing typically still needed.
- Foreigners generally denied LCB consent for agricultural land.

**Impact on Vestra:**
- MUST classify parcels as agricultural vs urban/municipal at ingestion.
- For agricultural sales, escrow release condition MUST include LCB consent gate.

---

## 8. Partner-Bank Options for Trust Accounts

**Current state:**
- CBK **PSP capital requirements**: KES 5M electronic retail PSP; KES 20M e-money issuer; KES 50M designated payment instrument issuer.
- **NCBA** launched **ConnectPlus** (Oct 2025, USD 6M, iGTB partnership) — cloud-native, open-banking APIs.
- **Equity Bank** — mature APIs (Jenga API): payments, collections, account inquiry.
- **KCB, Cooperative** — API programs exist but less publicly documented.
- **No standalone escrow-license category** — must ride on partner bank's trust operations.

**Impact on Vestra:**
- MUST partner with a **commercial bank** (not merely a PSP) for escrow.
- Recommend **NCBA (ConnectPlus)** or **Equity (Jenga)** as top API-mature options; **Co-op Bank** as SACCO/chama-adjacent option.
- MUST draft trust deed jointly with bank counsel.

**Risk if ignored:** Holding client funds without a partner-bank trust = criminal offence under NPS Act 2011.

---

## 9. Digital Credit Providers (DCP) Regulations

**Current state:**
- DCP Regulations 2022 gazetted 18 Mar 2022; revised procedure Oct 2024.
- Fee KES 5,000 application; 60-day CBK review; 12-month renewable licence.
- **Draft Non-Deposit-Taking Credit Providers (NDTCP) Regs 2025** would extend regulation to all non-bank lenders including BNPL and rent-financing.
- Finance Act 2025 slaps **excise duty** on ALL digital lender fees + interest.

**Impact on Vestra:**
- If Vestra offers **rent advance, deposit financing, or mortgage bridge** — YES, DCP licence needed (or NDTCP once passed).
- Ordinary rent pass-through and escrow do NOT trigger DCP.
- Recommend: Phase 1 launch WITHOUT credit; add credit as separate legal entity (Vestra Credit Ltd) with own DCP licence in Phase 2.

**Risk if ignored:** Unlicensed lending = CBK enforcement, KES 500K/day fines, criminal exposure.

---

## 10. EAC Cross-Border Land Ownership

**Current state:**
- No unified EAC land framework — each partner state governs own land.
- **Uganda**: Non-citizens = leasehold up to 99 years; NO freehold; NO mailo.
- **Tanzania**: Most restrictive — no non-citizen ownership; access only via TIC-approved investment or through Tanzanian-registered company.
- **Rwanda**: Foreign leasehold up to 99 years; NO foreign freehold except Presidential approval.
- **Kenya (reverse)**: Non-citizens 99-year leasehold only; agricultural land requires LCB consent.
- No country has an Ardhisasa-equivalent public API. Rwanda's LAIS is the most modern.

**Impact on Vestra:**
- Cross-border MVP path: **Rwanda first**, **Uganda second**, **Tanzania last**.
- Vestra CANNOT sell "buy land across EAC" as a citizen right — must package as leasehold investment vehicles per country.
- Must localize KYC per country.

---

## Compliance Roadmap (sorted by impact × urgency)

| # | Topic | Urgency | Impact | Action | Owner | ETA |
|---|-------|---------|--------|--------|-------|-----|
| 1 | eRITS (Gava Connect) + eTIMS integration | CRITICAL (Jan 2026 in force) | Core product | Build integrations; register as eTIMS OSP if reselling | Eng + Tax counsel | 0-3 months |
| 2 | ODPC registration + DPO appointment | CRITICAL | Fines + churn | Register controller + processor; hire/contract DPO; publish privacy policy; DPIA | Legal + Ops | 0-2 months |
| 3 | Partner-bank trust account (NCBA / Equity) | CRITICAL (blocks escrow) | Blocks launch | Commercial BD + trust deed drafting | CEO + Legal | 0-6 months |
| 4 | Ardhisasa / NSDM workflow (human-in-loop) | HIGH (mandatory Feb 2026) | Blocks sale flow | Workflow design + doc automation | Product + Legal | 0-3 months |
| 5 | MRI rate parameterization + non-resident PIN flag | HIGH (FB2026 pending) | Data model | Config-driven tax rates; residency detection | Eng | 0-2 months |
| 6 | CAK Sender ID + SMS opt-in state machine | MEDIUM | Ops | Aggregator onboarding; DND compliance | Ops + Eng | 0-1 month |
| 7 | LCB consent workflow (agricultural) | MEDIUM | Transaction validity | Parcel classifier + LCB task node | Product | 1-3 months |
| 8 | 72h breach-notification runbook | MEDIUM | Fine mitigation | Incident-response plan + tabletop | Security + Legal | 1-3 months |
| 9 | DCP licence (only if adding credit) | DEFER | Enables rent-financing | Separate SPV; 12-18 month path | CEO | Phase 2 (12+ months) |
| 10 | EAC expansion (Rwanda first) | DEFER | Growth | Rwanda counsel; LAIS integration research | Strategy | 12-18 months |
| 11 | CMA sandbox (only if tokenized property) | DEFER | Optional | Applies only for REIT/fractional | Strategy | Phase 3 |

**Flags for counsel engagement (public info thin):**
- CBK sandbox operational status
- Whether Vestra platform fees trigger the 10% digital-lender excise
- Bank willingness to structure prop-tech trust accounts
- CAK stance on multi-MNO aggregation vs pure Daraja passthrough
