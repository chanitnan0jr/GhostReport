# GhostReport — System Design

Oct 15, 2026 · @Sinu

## 1. สรุปและขอบเขต

MVP คือ vertical slice เดียว: workflow ขอทุน DAO ที่มี mock wallet หนึ่งตัว, investigation หนึ่งเรื่อง (ทำไมผู้ใช้กลุ่มที่ไม่มี attempt ไม่เริ่ม connect) และ report ที่เปลี่ยนตามหลักฐานจริงจากผู้ที่เข้ามาลองเว็บเดโม ส่วนเสริมคือ Part B ที่ให้ analyzer อ่าน repo dApp แบบ open source ที่ทีมไม่ได้เขียน เพื่อพิสูจน์ว่า code-awareness ไม่ได้ทำงานแค่กับโค้ดที่เราเขียนเอง

**Positioning (15 ต.ค.):** แอปการเงินเสียผู้ใช้ที่ด่านเริ่มใช้งาน เช่น เชื่อม wallet ยืนยันตัวตน หรือผูกบัญชี log บอกว่าผู้ใช้หลุดตรงไหน แต่ไม่บอกว่าทำไม GhostReport ฝังอยู่ใน log ตรวจหลักฐานที่มีก่อน แล้วถามเฉพาะตอนที่ log ตอบไม่ได้ เดโมยังใช้ wallet gate ตัวเดิม

**กรรมการตัดสินจากงานที่ส่ง:** GitHub repo สาธารณะ, demo website, pitch deck บน Google Drive และ write-up ปิดรับศุกร์ 16 ต.ค. 14:00 เกณฑ์คือ App execution 40%, Practicality 40%, Usability & Design 10%, Innovation & Ecosystem 5% และ U-Bot integration 5% นำเสนอสดเฉพาะ top 3 ของแต่ละ track ตอน 20:00

**DEMO mode:** เว็บเดโมเปิดด้วย judging run ที่มี seed ประมาณ 20 sessions และผลสืบของ LLM ที่ lock ไว้แล้ว session ของผู้เยี่ยมชมต่อท้าย run นั้น และ report v2 คำนวณใหม่แบบตายตัวโดยไม่เรียก LLM ต่อการเข้าชม หน้าแรกพาเดิน 3 ขั้น คือลองเป็นผู้ใช้ ดู report และวิธีติดตั้ง ส่วน `REPLAY=1` เป็นโหมดอ่านอย่างเดียวไว้สำรอง

**สิ่งที่สร้างในงาน (5 ชิ้น)**

1. Micro Wallet Flow: หน้า ProjectList, ProjectPage, ApplyModal, MockWalletPopup (Approve / Reject) และปุ่ม Not now
2. Code-aware Analyzer: Code Context Builder + LLM Stage A (workflow map) + Stage B (hypotheses)
3. Evidence Selection Policy: deterministic, ไม่ใช้ probability, มี decision trace
4. Feedback Probe: คำถามเดียว ข้ามได้ ไม่ขวางการออก
5. Investigation Report: v1 (ก่อน probe, ล็อกแล้ว) และ v2 (หลัง probe) วางคู่กัน

**สิ่งที่ไม่สร้าง:** blockchain จริง, PostHog, session replay, graph database, instrumentation PR อัตโนมัติ, การ deploy dApp ของคนอื่น

**ก่อนวันงานทำอะไรได้บ้าง** (FAQ ของผู้จัดยืนยันแล้ว: research ทำก่อนได้ แต่โค้ดต้องเริ่มในงาน)

| งาน | ทำก่อนงานได้ไหม |
| --- | --- |
| design doc นี้, sketch หน้าจอบนกระดาษ | ได้ (pre-research) |
| ทดสอบ prompt กับ repo open source ผ่านหน้าแชต แล้วจดผล | ได้ (pre-research) |
| เลือก repo, ปัก commit SHA, อ่าน license | ได้ |
| ออกแบบ role card และกำหนด metric ล่วงหน้า | ได้ |
| เขียนโค้ด GhostReport หรือ Micro Wallet Flow | **ไม่ทำ** จนกว่าจะเริ่ม build วันพฤหัส 11:30 |

ข้อที่ต้องพูดบนเวทีตรงๆ: ช่องว่างใน Micro Wallet Flow (Part A) เป็นโค้ดที่ทีมเขียนเอง ความน่าเชื่อถือเรื่อง code-awareness จึงต้องมาจาก Part B

## 2. Architecture

ระบบมีสองสายข้อมูล คือพฤติกรรมจากแอปและโค้ดจาก repo ทั้งสองมาบรรจบที่ Stage B แล้วไหลลงเป็นเส้นเดียวจนถึง report ทุกขั้นเป็น process เดียวใน FastAPI ไม่มี microservice

&#91;embedded content: GhostReport architecture · 13 components, 2 LLM stages\]

กล่องสีคือจุดเดียวที่ใช้ LLM ส่วน Roles DB ถูกเขียนตอนผู้เยี่ยมชมเริ่มจากหน้าแรก และเปิดดูได้หลังปิดการเก็บข้อมูลเท่านั้น เพื่อใช้เทียบใน E3

**Deploy:** frontend และ backend ขึ้น URL สาธารณะตั้งแต่ walking skeleton (เป้า \~15:30 วันพฤหัส) DeepSeek key อยู่ใน env ฝั่ง server เท่านั้น และ `.env` อยู่ใน `.gitignore` ตั้งแต่ commit แรก เพราะ repo เป็น public roles อยู่ใน service แยกคนละ process ตามข้อ 3 และข้อ 6

## 3. Input / Output Data Pipeline

ทุก stage รับและส่ง JSON ที่มี Pydantic model ตรวจ ข้อมูลไหลทางเดียว และทุก output ถูกเก็บแบบ append-only พร้อม hash เพื่อพิสูจน์ได้ว่าไม่มีการแก้ย้อนหลัง

| # | Stage | Input | Output | ใครทำ |
| --- | --- | --- | --- | --- |
| 1 | Event Ingest | `track()` จาก Micro Wallet Flow | แถวใน `events` | deterministic |
| 2 | Code Context Builder | repo path + keyword hints | `ContextPack` | deterministic |
| 3 | Stage A: Workflow Map | `ContextPack` | `WorkflowMap` | LLM |
| 4 | Ref Validator | `WorkflowMap` + ไฟล์จริง | `WorkflowMap` ที่ผ่านการตรวจ | deterministic |
| 5 | Cohort Builder | `events` + `WorkflowMap` | `CohortStats` | deterministic (SQL) |
| 6 | Stage B: Hypotheses | `WorkflowMap` + `CohortStats` | `HypothesisSet` + `CandidateActions` | LLM |
| 7 | Lock | `HypothesisSet` | `InvestigationState v1` + sha256 | deterministic |
| 8 | Evidence Selection | v1 + `CandidateActions` + `events` | `Decision` + trace | deterministic |
| 9 | Probe | `Decision` | `ProbeResponse` | ผู้ใช้จริง |
| 10 | Reconciler | v1 + responses + events | `InvestigationState v2` | deterministic |
| 11 | Narrative | v1, v2 (facts JSON) | ข้อความสรุป | LLM + claim checker |

**Canonical event schema** (แอปใดก็ต้องแปลงมาเป็นรูปนี้)

```json
{"event_id": "e_01J9X3", "session_id": "s_8f2a", "seq": 4, "attempt_id": null, "event": "wallet_gate_shown", "occurred_at": "2026-10-16T14:02:11.204Z", "received_at": "2026-10-16T14:02:11.391Z", "page": "ApplyModal", "schema_version": 1, "props": {"project_id": "p3"}}
```

`event_id` สร้างฝั่ง client ใช้ dedupe เมื่อส่งซ้ำหลัง network error `seq` นับเพิ่มทีละหนึ่งต่อ session ใช้ตรวจว่ามี event หายหรือไม่ (coverage) `attempt_id` สร้างใหม่ทุกครั้งที่กด Connect `occurred_at` คือเวลาที่เกิด ส่วน `received_at` คือเวลาที่ server รับ ใช้ตัดสินว่า event อยู่ก่อนหรือหลัง data cutoff `props` รับเฉพาะ key ใน whitelist ห้ามมี wallet address, ชื่อ หรือข้อความที่ผู้ใช้พิมพ์

**WorkflowMap** (output ของ Stage A)

```json
{
  "scope": {"commit_sha": "<sha>", "searched_files": ["src/ApplyModal.tsx", "src/wallet.ts", "src/ProjectPage.tsx"],
            "unresolved_imports": ["@acme/analytics"], "truncated": false},
  "states": [{"id": "apply_gated", "desc": "ApplyModal ต้องผ่าน requireWallet()",
    "code_ref": {"file": "src/ApplyModal.tsx", "lines": [12, 18], "quote": "if (!wallet) return requireWallet()"}}],
  "outcomes": [{"id": "wallet_rejected", "instrumentation": "not_found_in_scope",
    "handler_ref": {"file": "src/wallet.ts", "lines": [22, 24], "quote": "onReject(error)"}}],
  "ui_facts": [{"id": "no_requirement_copy", "desc": "ProjectPage ไม่มีข้อความบอกว่าต้อง connect ก่อนสมัคร",
    "code_ref": {"file": "src/ProjectPage.tsx", "lines": [30, 52], "quote": "<button>Apply</button>"}}]
}
```

`instrumentation` มีสามค่า: `found_in_code` (พบในไฟล์ที่ค้น), `not_found_in_scope` (ไม่พบภายในขอบเขตที่ค้น) และ `unknown` (ใช้เมื่อ scope ถูกตัด หรือ handler เรียก import ที่ resolve ไม่ได้) Report ห้ามเขียนว่า "ไม่มี tracking" และต้องแสดงขอบเขตที่ค้นทุกครั้ง

**Hypothesis และ CandidateAction** (output ของ Stage B)

```json
{
  "hypotheses": [
    {"id": "H1", "class_id": "HC-unaware-requirement", "statement": "ไม่รู้ว่าต้อง connect wallet ก่อนสมัคร", "code_evidence": ["no_requirement_copy", "apply_gated"], "generic": false},
    {"id": "H2", "class_id": "HC-gate-permission", "statement": "กังวลต่อคำขอสิทธิ์ที่แสดงใน wallet gate", "code_evidence": ["gate_permission_copy"], "generic": false},
    {"id": "H3", "class_id": "HC-browsing", "statement": "เข้ามาดูโครงการ ยังไม่ตั้งใจสมัคร", "code_evidence": [], "generic": true},
    {"id": "H_other", "class_id": null, "statement": "เหตุผลที่ยังไม่ได้เสนอ", "generic": true}
  ],
  "proposed_actions": [
    {"action_type": "check_event", "params": {"event": "wallet_gate_shown", "scope": "no_attempt"}, "rule_ids": ["R2"],
     "note": "ข้อความอธิบายจาก LLM ไม่มีผลต่อสถานะ"},
    {"action_type": "probe", "params": {"decision_point": "DP1"}, "option_map": {"o1": "H1", "o2": "H2", "o3": "H3", "o4": "H_other"}}
  ]
}
```

LLM เสนอได้เฉพาะ `action_type` ที่อยู่ใน catalog และอ้างได้เฉพาะ `rule_id` ที่ทีม review แล้ว `class_id` ที่ LLM เสนอเป็นแค่ข้อเสนอ ผู้ดูแลต้องอนุมัติ mapping จากข้อความสมมติฐานไปยัง class พร้อมกับตอนอนุมัติ probe ก่อนที่ rule ใดจะใช้ได้ `code_evidence` ต้องเป็น ID ที่มีอยู่ใน WorkflowMap เวอร์ชันเดียวกัน ไม่มีฟิลด์ probability ใน schema ใดเลย ถ้า LLM ส่งสิ่งที่ไม่อยู่ใน catalog validator จะ reject

**ตารางในฐานข้อมูล** (SQLite ไฟล์เดียว ยกเว้น roles)

| Table | ฟิลด์หลัก | หมายเหตุ |
| --- | --- | --- |
| `run` | run\_id, mode (live / seed / pilot / replay / demo), code\_commit, app\_build, verifications (event, test, commit, passed\_at), policy\_version, catalog\_version | หนึ่งไฟล์ SQLite ต่อหนึ่ง run |
| `events` | event\_id (unique), session\_id, seq, attempt\_id, event, occurred\_at, received\_at, schema\_version, page, props | dedupe ด้วย event\_id |
| `investigations` | id, version, data\_cutoff, state\_json, sha256, prev\_sha256, digest\_shown\_at | digest ของ v1 แสดงนอกระบบ |
| `class_mappings` | investigation\_id, hypothesis\_id, class\_id, approved\_by, approved\_at | rule ใช้ได้เฉพาะ mapping ที่อนุมัติแล้ว |
| `decisions` | investigation\_id, decision\_point, action\_id, data\_version, reason, inputs\_snapshot, result\_json | result\_json = observed / not\_observed / unknown\_coverage พร้อมจำนวน session, rule ที่ใช้ และ evidence IDs |
| `probe_questions` | question\_version, investigation\_id, decision\_point, stem, options\_json, option\_map\_json, approved\_by, approved\_at | immutable หลังอนุมัติ report อ่านจากตารางนี้ ไม่อ่านจาก prompt |
| `probe_plans` | plan\_id, investigation\_id, question\_version, target\_cohort, target\_n (เป้าหมายที่อาจเกินได้), budget, ends\_at | เปิดเก็บจนถึง target\_n, budget หรือเวลา |
| `probe_exposures` | exposure\_id (สร้างฝั่ง client), plan\_id, session\_id, shown\_at, client\_cohort\_at\_shown, event\_seq\_at\_shown, options\_shown, received\_via (beacon / inferred\_from\_response), server\_cohort\_at\_shown, cohort\_status (pending / resolved / unknown\_coverage) | server สร้าง cohort ใหม่จาก event จนถึง event\_seq\_at\_shown |
| `probe_responses` | exposure\_id, option\_ids (เลือกได้หลายข้อ) หรือ skipped, responded\_at | mapping อ่านจาก probe\_questions |
| `llm_calls` | prompt\_id, prompt\_version, input\_hash, model, output\_json, latency\_ms, tokens | cache |
| `roles` (service แยก) | session\_id, role | คนละ process ไม่ mount ให้ engine |

## 4. Core Logic

LLM ทำแค่สองงาน คืออ่านโค้ดให้เป็น workflow map และตั้งสมมติฐานพร้อมหลักฐานที่ใช้แยก ส่วนการตัดสินใจทุกอย่างหลังจากนั้นเป็น deterministic และตรวจย้อนได้

### 4.1 Workflow ที่ใช้ในเดโม

`ProjectList → ProjectPage → [Apply] → ApplyModal (gated: "Connect wallet to apply") → [Connect] → MockWalletPopup (Approve / Reject) → Connected → Application form`

ทางออกที่ตั้งใจ: ปุ่ม Not now ใน ApplyModal และการกดย้อนจาก ProjectPage กลับไป ProjectList Mock wallet มี simulated RPC error ที่อัตราตายตัวและบอกบนจอ อัตราคือ 0.10 เฉพาะการเชื่อมต่อครั้งแรกของ session ลองใหม่แล้วผ่านเสมอ และข้อความ error บอกว่าเป็นการจำลอง ผล Reject ไม่มี track() ในโค้ด (ลบ call ออก ไม่ใช้ flag) analyzer จึงต้องเจอช่องว่างนี้จากโค้ดเอง ส่วน error ยังเก็บ event ตามปกติ

### 4.2 Code Context Builder (ไม่ใช้ LLM)

1. `rg -l` หาไฟล์ที่มีคำ `wallet|connect|signer|account|requireWallet`
2. `rg -n` หา analytics call (`track(`, `capture(`) แล้วดึงชื่อ event ออกมา ได้รายการ instrumentation ที่พบภายในขอบเขตที่ค้น ไม่ใช่ทั้ง repo
3. จัดอันดับไฟล์ตามจำนวน hit แล้วตาม relative import ออกไป 1 ชั้น (regex บน `import … from './…'`)
4. ถ้าเกิน token cap ให้ตัดเหลือเฉพาะ function ที่มีคำค้น ± 20 บรรทัด
5. ส่งออก `ContextPack`: เนื้อไฟล์พร้อมเลขบรรทัด, import edges , รายการ analytics calls และ scope (searched\_files, unresolved\_imports, truncated, commit\_sha)

### 4.3 Stage A และ Stage B (LLM)

- **Stage A** สร้าง `WorkflowMap`: states, outcomes (instrumentation: found\_in\_code / not\_found\_in\_scope / unknown) และ ui\_facts ทุกข้อต้องมี `code_ref` ที่มี file, lines และ quote ตรงตัว ถ้าไม่แน่ใจให้ละไว้
- **Stage B** สร้าง hypotheses อย่างน้อย 3 ข้อ ต้องมีอย่างน้อยหนึ่งข้อที่ไม่ใช่ปัญหา (เช่น browsing) ทุกข้อต้องอ้าง code evidence อย่างน้อยหนึ่งรายการ ไม่อย่างนั้นต้องติด `generic: true` ต้องมี H\_other (เหตุผลที่ยังไม่ได้เสนอ) เสมอ และ action ทุกตัวต้องระบุว่าผลแบบไหนขัดกับสมมติฐานใด พร้อมเหตุผล

### 4.4 Cohort Builder (SQL)

Cohort คำนวณ ณ data cutoff ของแต่ละ snapshot ระดับ attempt มีสถานะของตัวเอง แล้วจึงสรุปเป็นระดับ session

| ระดับ | สถานะ | เงื่อนไข (ตรวจตามลำดับ ตัวแรกที่ตรงชนะ) |
| --- | --- | --- |
| Attempt | `connected` / `rejected` / `errored` | มี outcome event ของ attempt\_id นั้น (rejected และ errored มีได้เฉพาะเมื่อ instrument แล้ว) |
| Attempt | `pending` | เริ่มไม่ถึง 60 วินาทีก่อน cutoff และยังไม่มี outcome |
| Attempt | `no_outcome_observed` | เกิน 60 วินาทีแล้วยังไม่มี outcome |
| Session 1 | `connected` | มีอย่างน้อยหนึ่ง attempt ที่ connected (ติดป้าย after\_retry ถ้ามี attempt ก่อนหน้าที่ไม่สำเร็จ คือ errored หรือ no\_outcome\_observed) |
| Session 2 | `attempted_no_success` | มี attempt แต่ไม่มี connected |
| Session 3 | `gate_event_no_attempt` | มี `wallet_gate_shown` แต่ไม่มี attempt |
| Session 4 | `no_gate_event` | ไม่เข้าเงื่อนไขข้างบน (รวมกรณี event หาย) |

ทุก session ยังมี **coverage** แยกจาก cohort ค่า `complete` ต้องผ่านสามข้อ: (1) `seq` ต่อเนื่องภายในรอบที่วิเคราะห์ ตั้งแต่เข้า ProjectPage จนถึง exit event (2) มี exit event (`not_now` หรือ `back`) และ (3) แอปเป็น build ที่ผ่าน instrumentation test ว่ายิง event ที่ rule ต้องใช้ทุกครั้ง (`build_verified`) `seq` ต่อเนื่องบอกได้แค่ว่า event ที่ถูกสร้างส่งมาครบ แต่ไม่ได้บอกว่าโค้ดสร้าง event ครบทุกเหตุการณ์ ใน MVP มีแค่ Micro Wallet Flow ที่เป็น verified build แอปอื่นจึงได้ `unknown` เสมอ ชื่อ cohort บอกแค่ว่ามีหรือไม่มี event ที่บันทึกไว้ ไม่ได้บอกว่าเหตุการณ์เกิดหรือไม่เกิด

**`build_verified` นับทีละ event ไม่ใช่ทั้ง build:** R2 ใช้ได้เมื่อเทสต์ว่า `wallet_gate_shown` ยิงหนึ่งครั้งต่อการแสดง gate ผ่านบน commit เดียวกับที่ deploy ระบบบันทึก event, test, commit และ passed\_at ลงช่อง verifications ของตาราง `run` เพื่อให้ report อ้างได้ว่า verified by test X at commit Y

`wallet_gate_shown` ยิงหนึ่งครั้งต่อการแสดง gate หนึ่งครั้ง (ไม่ใช่ทุก React re-render) ไม่ใช้ `apply_clicked` แทน เพราะการกดไม่ได้ยืนยันว่าผู้ใช้เห็น gate ค่า 60 วินาทีล็อกแล้ว Cohort ที่ใช้นับคำตอบคือ `server_cohort_at_shown` ซึ่ง **server สร้างเอง** จาก event ที่ seq ไม่เกิน `event_seq_at_shown` ไม่เชื่อค่าที่ client ส่งมาโดยตรง ถ้า event ก่อนหน้ายังมาไม่ครบ (seq ขาด) สถานะเป็น `pending` และยังไม่นับเข้ากลุ่มใด เมื่อหมดเวลารอให้เป็น `unknown_coverage` ถ้าผู้ใช้กลับไป connect สำเร็จหลังตอบ คำตอบยังนับในกลุ่มตอนที่ถูกถาม

แต่ละ session ยังติดป้าย exit type: `not_now` (กด Not now), `back` (ย้อนกลับเอง), `inactive` (ไม่มี event ≥ 10 นาที ซึ่งเป็นแค่เกณฑ์ inactivity ไม่ใช่หลักฐานว่าปิดแท็บ) และ `open` (ยัง active ตอน cutoff) ถามได้เฉพาะ `not_now` กับ `back` ที่เหลือรายงานแยกโดยไม่เดาเหตุผล

### 4.5 Lock

ก่อน probe แรกถูกแสดง ระบบบันทึก `InvestigationState v1` พร้อม data\_cutoff และ sha256 แล้วแสดง digest บนจอ console และส่งให้ mentor หรือกรรมการถือไว้ Hash chain ใน DB เดียวไม่ใช่หลักฐานอิสระ เพราะใครที่เขียน DB ได้ก็เขียน chain ใหม่ได้ digest ที่อยู่นอกระบบคือสิ่งที่ทำให้ตรวจได้จริง Event ที่มาหลัง cutoff สร้าง version ใหม่เสมอ ไม่แก้ v1

### 4.6 Evidence Selection Policy

Policy ไม่ได้เลือกจาก action ใดก็ได้ที่ LLM เขียนมา แต่เลือกจาก **action catalog ที่ทีมกำหนดและ review ก่อนงาน** LLM ทำได้แค่เสนอว่าจะใช้ action ไหนใน catalog กับพารามิเตอร์อะไร ตามกรอบ JITAI policy **กรองก่อน** ว่าทำได้และได้รับอนุญาต ณ decision point นั้นหรือไม่ **แล้วจึงจัดอันดับ** คะแนนทั้งหมดเป็น heuristic ของทีม ไม่ใช่ information gain ที่คำนวณได้

| action\_type | ทำอะไร | ผลที่ใช้ได้ | ต้นทุน |
| --- | --- | --- | --- |
| `check_event` | นับ event ที่มีอยู่ใน sub-cohort ตาม params ที่ตรวจได้ (`event`, `scope`) | `observed` / `not_observed` / `unknown_coverage` | tier 0 |
| `probe` | แสดงคำถามที่อนุมัติแล้ว ตัวเลือกแต่ละข้อ map กับ hypothesis | คำตอบ หรือ skip | tier 2 |
| `recommend_instrument` | บันทึกข้อแนะนำให้ dev | ไม่มีผลในงาน | ไม่ execute |

**Contradiction rule** เป็นกฎที่ทีมเขียนและ review ก่อนงาน และ**ผูกกับ hypothesis class ที่ทีมนิยามไว้** ไม่ใช่กับ ID ที่ LLM สร้าง เช่น class `HC-gate-permission` = "กังวลต่อคำขอสิทธิ์ที่แสดงใน gate" และ R2 = "HC-gate-permission ต้องมี gate ถูกแสดง" ความกังวลต่อ wallet แบบทั่วไปที่เกิดได้ก่อนเห็น gate เป็นอีก class หนึ่งที่ R2 ใช้ไม่ได้ สมมติฐานที่ LLM สร้างต้อง map เข้า class ใน catalog ถ้า map ไม่ได้ก็ยังแสดงใน report ได้ แต่ไม่มี rule ใดใช้กับมัน LLM อ้างได้แค่ `rule_id` ที่มีอยู่ ข้อความเหตุผลที่ LLM เขียนไม่มีผลต่อสถานะ และกฎใช้ได้กับ session ที่ coverage เป็น `complete` เท่านั้น ถ้าสร้าง partition ที่มีเหตุผลรองรับไม่ได้ ให้ `check_event` เป็นแค่การตรวจ telemetry ที่ไม่คำนวณ SPL1.1

| JITAI | ใน GhostReport |
| --- | --- |
| Decision point | DP0 รอบประเมิน telemetry บน console ทุก 30 วินาที (`check_event` เท่านั้น) · DP1 กด Not now ใน gate · DP2 ย้อนจาก ProjectPage (DP1 และ DP2 ตัดสินแค่ probe หรือไม่ทำอะไร จากแผนที่เตรียมไว้) |
| Action options | action ใน catalog · ไม่ทำอะไร (พร้อมเหตุผล) |
| Tailoring variables | cohort, coverage, consent, เคยถูกถามหรือยัง, สถานะการเก็บของแผน, UI state |
| Decision rule | `select_dp0()`, `plan_probe()` และ `at_exit()` ด้านล่าง |
| Proximal outcome | หลักฐานที่ตอบสมมติฐานที่ค้างอยู่ ต่อจำนวนครั้งที่รบกวนผู้ใช้ |
| Distal outcome | report ที่ทีม product ใช้ตัดสินใจได้โดยไม่อ้างเกินหลักฐาน |

ที่ DP0 action แต่ละตัวถูกประเมินครั้งเดียวต่อ `data_version` (ค่าที่เปลี่ยนเมื่อมี event ใหม่ใน sub-cohort) ที่ DP1 และ DP2 policy ไม่กลับไปตรวจ event อีก การกด Not now หรือ Back ซึ่งสร้าง event ใหม่จึงไม่ทำให้ tier 0 มาขวาง probe

```python
def select_dp0(sub, hyps, catalog, ctx):          # รันบน console ทุก 30 วินาที
    for a in catalog.checks(sub):
        if (a.id, ctx.data_version) in ctx.evaluated:
            continue
        if contradiction_value(a, hyps, ctx) > 0:  # = 0 ถ้า coverage ไม่ complete
            return Decision(a.id, reason=explain(a))   # ผลการตรวจเขียนลง result_json
    return Decision("no_action", recommendations=catalog.instruments(sub))

def plan_probe(sub, hyps, catalog, ctx):           # เตรียมไว้ล่วงหน้า client โหลดตอนเข้า ProjectPage
    p = catalog.probe_for(sub)
    if p and relevance(p, hyps) > 0 and collection_open(p, ctx):
        return ProbePlan(p.id, target_n=ctx.target_n, budget=ctx.budget, ends_at=ctx.ends_at)
    return None

def at_exit(session, plan, now, local_state):       # DP1/DP2 ฝั่ง client ไม่เรียก API
    if plan and now < plan.ends_at and not plan.closed_hint \
            and eligible_now(session, plan, local_state):
        return "show_probe"   # ProbeCard ส่ง probe_shown เองเมื่อ mount สำเร็จ (ครั้งเดียวต่อ exposure_id)
    return "no_action"
```

- `contradiction_value(a)` = จำนวนสมมติฐานที่ผลบางแบบของ `a` ขัดได้ตาม rule ที่ review แล้ว นับเฉพาะ session ที่ coverage complete และสมมติฐานที่มี class mapping อนุมัติแล้ว
- `relevance(p)` = จำนวนสมมติฐานใน sub-cohort ที่ตัวเลือกของ probe map ถึง ใช้ตอบว่า**คำถามนี้ถามเรื่องที่ถูกหรือไม่** แยกจากเรื่องเก็บคำตอบครบหรือยัง
- `collection_open(p)` = จำนวนคำตอบยังไม่ถึง `target_n`, จำนวนที่แสดงยังไม่ถึง `budget` และยังไม่ถึง `ends_at` ทั้งสามค่าล็อกแล้ว: target\_n 10, budget 30 และ ends\_at แยกตาม run (judging run ปิดศุกร์ 17:00, live run ปิดหลัง lock 12 นาที) คำตอบแรกไม่ทำให้หยุดเก็บจากคนอื่น
- `target_n` และ `budget` เป็น**เป้าหมายที่อาจเกินได้** ผู้ใช้ที่โหลดแผนไว้แล้วอาจได้เห็นคำถามหลังครบเป้า คำตอบเหล่านั้นเก็บตามจริง ส่วน `ends_at` ตรวจซ้ำตอนแสดงเสมอ และ `closed_hint` คือสถานะปิดที่ client ได้รับล่าสุดจาก server ถ้าไม่ได้รับก็ไม่ขวางการแสดง
- `eligible_now` ตรวจในเครื่องตอนแสดงจริง: ยอมรับ consent ที่หน้าแรกของเว็บ แล้ว, ยังไม่เคยถูกถามใน session นี้, ไม่อยู่ใน wallet popup และถ้าแผนเป็นของกลุ่มที่ไม่มี attempt ต้องยังไม่มี attempt เกิดขึ้น
- Gate check ใน MVP **ไม่คำนวณ SPL1.1** เพราะฝั่ง V− ว่าง ตามนิยามของ Rodler (2018) จึงไม่ใช่ discriminating query SPL1.1 ใช้เฉพาะเมื่อ catalog มี check ที่ทั้งสองฝั่งไม่ว่าง

* **MVP ไม่ตัดสมมติฐานทิ้ง** ผลจาก tier 0 ทำได้แค่ติดป้าย Contradicted by rule Rx ให้สมมติฐานใน sub-cohort นั้น
* **การไม่พบ event ไม่ใช่หลักฐานว่าเหตุการณ์ไม่เกิด** ถ้า coverage เป็น `unknown` ผลคือ `unknown_coverage` และไม่มีกฎใดถูกใช้
* Self-report, Skip, ข้อมูลหาย และคำตอบกำกวม ไม่ทำให้สมมติฐานใดถูก contradicted
* H\_other อยู่ในทุก investigation และหลายเหตุผลเกิดร่วมกันได้
* ทุก decision รวมถึง no\_action เขียนลง `decisions` พร้อม `data_version`
* **Test ที่ต้องผ่านก่อน G2:** ตรวจ event แล้วไม่ได้ข้อมูลใหม่ → เลือก probe ได้ → ตอบหรือข้ามได้ → report เปลี่ยนเฉพาะสิ่งที่หลักฐานรองรับ

**ตัวอย่าง:** sub-cohort ที่ไม่มี attempt มี H1, H2, H3 และ H\_other ที่ DP0 console รัน `check_event(wallet_gate_shown)` ผลแตกเป็นสามกลุ่ม: session ที่มี gate event, session ที่ไม่มี gate event และ coverage complete (H2 ติดป้าย Contradicted by rule R2) และ session ที่ coverage ไม่ครบ (ไม่ใช้กฎ) รอบถัดไป action เดิมถูกข้ามเพราะประเมินกับ data\_version นี้แล้ว พร้อมกันนั้น `plan_probe()` เตรียมแผนของกลุ่มนี้ไว้ ที่ DP1 หรือ DP2 client แสดง probe ถ้าแผนยังไม่ถึง ends\_at และ session ยังเข้าเกณฑ์ ณ ตอนนั้น กลุ่ม inactive ไม่ถูกถาม

### 4.7 Probe

- Stem ตายตัว DP1: "What best describes your decision not to connect right now?" DP2: "What were you hoping to do on this page?" (ไม่พูดถึง wallet เพราะผู้ใช้อาจยังไม่เห็น gate)
- LLM เสนอตัวเลือกจากสมมติฐาน ไม่เกิน 4 ข้อ ต่อท้ายด้วย "Something else" และ "Skip" เสมอ เลือกได้หลายข้อ DP1 มีตัวเลือก "Not sure who is asking" เสมอ (design hypothesis ของเรา อิงจาก Harbach & Johnson, CHI 2026)
- Probe ไม่ใช่ strong query ตามนิยามของ Rodler แม้มีตัวเลือก Other คำตอบจึงใช้ปรับสถานะหลักฐานเท่านั้น
- ผู้ดูแลอนุมัติคำถามและ class mapping พร้อมกันหนึ่งครั้ง ระบบเก็บ stem, ตัวเลือก และ mapping ไว้ใน `probe_questions` แบบแก้ไม่ได้
- สุ่มลำดับตัวเลือกที่มาจากสมมติฐาน และบันทึก options\_shown ตามลำดับ
- **แยกสามอย่าง:** probe plan (คำถามพร้อมและการเก็บยังเปิด), eligibility ตอนแสดงจริง และ exposure (การแสดงจริง) MVP ไม่มีการจอง budget ล่วงหน้า (ดู ADR-8)
- **บันทึก exposure ตอนแสดง ไม่ใช่ตอนตอบ:** component ของ probe สร้าง `exposure_id` แล้วส่ง `probe_shown` ด้วย `navigator.sendBeacon` เมื่อ mount สำเร็จเท่านั้น ส่งครั้งเดียวต่อ `exposure_id` และไม่ขวางการออก sendBeacon เป็นแบบ best-effort ไม่รับประกันว่าถึง server ทุกครั้ง คำตอบหรือ skip อ้าง `exposure_id` เดียวกัน ถ้าคำตอบมาถึงแต่ exposure หาย ระบบสร้าง exposure จากคำตอบและติดป้าย `inferred_from_response` ถ้าทั้งสองหาย report ต้องระบุข้อจำกัดของ exposure coverage ตามจริง
- นับ `shown`, `answered`, `skipped` และ `shown_no_response` (เห็นแล้วไม่ตอบ) แยกกัน

### 4.8 Reconciler (กฎกำหนดล่วงหน้า)

แต่ละสมมติฐานในแต่ละ sub-cohort มี**สองมิติแยกกัน** และแสดงคู่กันเสมอ

| มิติ | ค่าที่เป็นไปได้ | เงื่อนไข |
| --- | --- | --- |
| Self-report | Unresolved | ผู้ตอบ probe น้อยกว่า 3 |
| Self-report | Selected by ≥ 50% | ผู้ตอบอย่างน้อยครึ่งหนึ่งเลือกตัวเลือกนั้น (หลายสมมติฐานได้ป้ายนี้พร้อมกันได้) |
| Self-report | Selected | k > 0 แต่น้อยกว่าครึ่ง |
| Self-report | Not selected | k = 0 จากผู้ตอบ ≥ 3 |
| Observation | Contradicted by rule Rx | rule ที่ review แล้วใช้ได้ และ coverage complete |
| Observation | No contradiction | ไม่มี rule ใดขัด |
| Observation | Unknown coverage | coverage ไม่ครบ จึงไม่ใช้กฎ |

ถ้าสมมติฐานเดียวกันได้ทั้ง Selected และ Contradicted ระบบไม่เลือกข้างใด แต่ติดป้าย **Evidence conflict** และแสดงหลักฐานทั้งสองด้าน

เกณฑ์เหล่านี้เป็นกฎการแสดงผลที่ทีมเลือก ไม่ใช่เกณฑ์ความน่าเชื่อถือทางสถิติ **Denominator** ของแต่ละป้ายคือจำนวน session ที่ตอบจริงภายใน key `run_id + investigation_id + question_version + decision_point + cohort_at_shown` และได้เห็นตัวเลือกที่ map กับสมมติฐานนั้น Skip และ shown\_no\_response แสดงแยก `exposure_id` ใช้แค่เชื่อมคำตอบกับการแสดงแต่ละครั้ง ไม่ใช่ตัวจัดกลุ่ม ทุกป้ายต้องแสดง k of n เสมอ เพราะเลือกได้หลายข้อ เปอร์เซ็นต์รวมกันอาจเกิน 100% ระบบไม่ใช้คำว่า Confirmed หรือ Cause

## 5. Report

Report คือหน้าเดียวที่วาง v1 (ก่อนหลักฐานใหม่) กับ v2 (หลังหลักฐานใหม่) คู่กัน ทุกประโยคบนหน้าติดป้ายแหล่งที่มา และทุกตัวเลขคลิกย้อนไปหา event หรือคำตอบที่มาได้

| Panel | แสดงอะไร | ป้ายหลักฐาน |
| --- | --- | --- |
| Funnel | Visitors → Apply clicked → Attempted → Connected พร้อมจำนวนจริง | Observed |
| Workflow Map | states และ outcomes จากโค้ด คลิกแล้วเห็น file:line และ quote | Code evidence |
| Evidence Gaps | outcome ที่โค้ดรองรับแต่ analytics มองไม่เห็น และคำถามที่ตอบไม่ได้เพราะช่องว่างนั้น | Code evidence |
| Hypothesis Matrix | แถว = หลักฐาน, คอลัมน์ = สมมติฐาน, ช่อง = สอดคล้อง / ขัด / เป็นกลาง สีเปลี่ยนจาก v1 ไป v2 | Inferred → Self-report |
| Decision Trace | action ที่เลือก, tier, rule ที่ใช้, data\_version และเหตุผล ตามลำดับเวลา | Policy |
| Coverage | eligible, shown, answered, skipped, silent exit แยกตาม sub-cohort | Observed |
| Findings | สถานะของแต่ละสมมติฐานตามกฎ 4.8 | Self-report / Unresolved |
| Next Action | สิ่งที่ควรทำต่อ เช่น instrument `onReject`, เพิ่มข้อความบอกเงื่อนไขก่อนกด Apply | Recommendation |
| Limitations | coverage (ใครมีโอกาสถูกถาม), nonresponse (ใครเลือกไม่ตอบ), generalization (สรุปถึงกลุ่มใดได้), inactive ที่ถามไม่ได้, mock wallet ไม่เหมือน extension จริงเรื่องแหล่งที่มาของ UI | ต้องมีทุกครั้ง |

**ตัวอย่างข้อความใน Findings** (ตัวเลขสมมติ)

> Sub-cohort "gate event, chose Not now": 9 sessions, ถาม 9, ตอบ 6, ข้าม 3. "Didn't know I needed a wallet" = 4 of 6 → H1 Most reported (self-report). H2 Reported (2 of 6). 14 sessions never clicked Apply; 11 were inactive and could not be asked.

Findings ทุกบรรทัดเป็น claim ที่มีฟิลด์ `evidence_ids`, `scope` (population และ data cutoff), `claim_type` (observed / code-derived / self-reported / inferred), `rule_version` และ `limitations` ข้อความสร้างจาก template ที่บังคับเขียน "k of n respondents" หรือ "k of n sessions" ทุกครั้ง เพราะ 4 of 6 respondents กับ 4 of 6 visitors มีความหมายต่างกันมาก LLM เขียนได้แค่ย่อหน้าสรุป และต้องผ่าน claim checker ใน 6

## 6. Validation Guards

Guard เหล่านี้รันทุกครั้งที่ pipeline ทำงาน ถ้าข้อไหนไม่ผ่าน ผลลัพธ์จะไม่ถูกแสดงบนจอ ทำให้สิ่งที่กรรมการเห็นผ่านการตรวจแล้วเสมอ

| Guard | ตรวจอะไร | ถ้าไม่ผ่าน |
| --- | --- | --- |
| Schema | output ของ LLM ตรงกับ Pydantic model และไม่มีฟิลด์ probability | ส่งกลับให้ LLM แก้ 1 ครั้ง แล้ว fail |
| Code ref | file มีอยู่จริง, lines อยู่ในช่วงไฟล์, quote อยู่ในบรรทัดนั้นจริง ผ่านแปลว่า**อ้างอิงถูก** ไม่ได้แปลว่าโค้ดสนับสนุนคำอธิบาย ส่วนนั้นวัดใน E2 | ตัด claim นั้นทิ้ง และนับเป็น hallucinated ref |
| Code evidence ID | `code_evidence` ทุกตัวต้องมีอยู่ใน WorkflowMap เวอร์ชันเดียวกัน | ตัด ID นั้น ถ้าไม่เหลือให้ติด `generic: true` |
| Instrumentation scope | ถ้า scope ถูกตัด หรือ handler เรียก import ที่ resolve ไม่ได้ ค่าต้องเป็น `unknown` | บังคับเป็น `unknown` |
| Action catalog | `action_type` ต้องอยู่ใน catalog และ params ผ่าน schema ของ type นั้น | ตัด action ทิ้ง |
| Contradiction rule | อ้างได้เฉพาะ `rule_id` ที่ review แล้วใน catalog\_version ปัจจุบัน ข้อความจาก LLM ไม่มีผลต่อสถานะ และสมมติฐานต้องมี class mapping ที่ผู้ดูแลอนุมัติแล้ว | ตัด rule ที่อ้างทิ้ง |
| Event coverage | `seq` ต่อเนื่องภายในรอบที่วิเคราะห์ มี exit event และ build ผ่าน instrumentation test ถึงจะเป็น `complete` ไม่อย่างนั้นห้ามใช้ rule | ใช้ `unknown_coverage` |
| Event dedupe | event\_id ซ้ำไม่ถูกนับ และ attempt\_id ผูกกับ session เดียว | ทิ้งตัวซ้ำ |
| Specificity | hypothesis ที่ไม่มี code evidence ต้องติด `generic: true` | บังคับติดป้าย |
| Lock | sha256 ของ v1 ตรงกับ digest ที่แสดงนอกระบบก่อน probe แรก | หยุด report และแสดง error |
| Claim checker | ทุก claim ใน narrative ตรงกับ facts JSON ทั้ง numerator, denominator และ population | ใช้ข้อความ template แทน |
| Privacy | `props` มีแค่ key ใน whitelist ไม่มีรูปแบบที่ดูเหมือน address (`0x` ตามด้วย hex 40 ตัว) | ทิ้ง event นั้น |
| Probe eligibility | บันทึก probe\_shown ทุกครั้งที่แสดง, ไม่แสดงหลัง ends\_at, cohort นับจากตอนแสดงจริง, ไม่ถาม inactive หรือ open, ไม่ถามซ้ำ, Skip ไม่เปลี่ยนสถานะ, Not now ไม่รอ probe | unit test ล้ม |
| Untrusted repo | เนื้อหาใน repo ส่งให้ LLM เป็นข้อมูลในตัวคั่น, LLM ไม่มี tool ที่ execute ได้, prompt ไม่มี secret หรือ roles | ข้อความที่ฝังใน repo **ยังเปลี่ยน hypotheses และ action ที่เสนอได้** (indirect prompt injection) จึงต้องมี catalog และ rule ที่ review แล้วเป็นด่านกั้น และผู้ดูแลต้องอนุมัติ probe ก่อนใช้ |
| Blinding | roles อยู่ใน service แยกคนละ process, ไม่ mount โฟลเดอร์ roles ให้ engine และ engine ไม่มี credential เรียก service นั้น | test ล้ม |

## 7. Evaluation ก่อนและหลัง

Evaluation มีสี่ชุด ทุกชุดใช้ ground truth ที่ไม่ได้มาจาก LLM ตัวเดียวกับที่ถูกประเมิน และผลทั้งหมดเป็นผลเชิงพรรณนาจากตัวอย่างเล็ก ไม่อ้างนัยสำคัญทางสถิติ

| ชุด | คำถาม | ข้อมูล | Ground truth | Metric |
| --- | --- | --- | --- | --- |
| E1a Strip-and-restore (เลื่อนไปหลังงาน) | AI ระบุและกู้คืน instrumentation ที่เคยมีอยู่ได้ไหม | repo open source 2–3 ตัว ปัก commit SHA | ตาม Tao et al. (2026): ลบ analytics calls ออก แล้วใช้ตำแหน่งเดิมเป็นเฉลย denominator ของ recall = calls ที่ลบออก repo ต้องมี wallet analytics อยู่จริง และต้องตรวจว่าชื่อ event ไม่หลุดผ่าน type, test หรือ helper (leakage check) | ref validity rate, gap precision, gap recall |
| E1b Semantic evidence gap | AI เจอคำถามวินิจฉัยที่ log ที่มีอยู่ตอบไม่ได้ และเชื่อมกับสมมติฐานได้ไหม | 1–2 กรณีจาก ens-app-v3 @ 3c10925f ทำถ้ามีเวลาหลัง G2 | คนตรวจที่ไม่เห็นผล AI ก่อน ตัดสินว่า gap มีเหตุผลจากโค้ดและ diagnostic question หรือไม่ (event ที่คนไม่เคยเขียนไม่มีอยู่ในเฉลยของ E1a) | จำนวน gap ที่ผ่านการตรวจ, จำนวนที่ linter หาไม่ได้ |
| E2 Ablation (ตัดในงาน) | การอ่านโค้ดทำให้สมมติฐานดีขึ้นไหม | cohort data ชุดเดียวกัน รันสองแบบ: logs-only และ logs + code | ผู้ตรวจ blind ให้คะแนน specificity และตรวจว่าโค้ดที่อ้าง**สนับสนุน**สมมติฐานจริงไหม | สัดส่วน non-generic, supported-link rate |
| E3 Live loop (เฉพาะถ้าเข้ารอบ 20:00) | report v2 สอดคล้องกับสิ่งที่เกิดจริงแค่ไหน | sessions จากคนในห้องตอนนำเสนอรอบ finalist | role ที่สุ่ม (Funding Applicant / Explorer) ซึ่ง engine มองไม่เห็น | ตารางพรรณนา role × การกระทำ × คำตอบ แบบ k of n ไม่ใช่ diagnostic accuracy |
| E4 Interruption | ระบบรบกวนผู้ใช้เท่าไรต่อหลักฐานที่ได้ | judging run (ผู้เยี่ยมชมเว็บเดโม) และ live run ถ้ามี | นับจาก `probe_exposures` และ reviewer ตรวจ report | shown / answered / skipped / shown\_no\_response, คำตอบที่ใช้ได้ต่อ probe, จำนวน unsupported conclusions |

**เกณฑ์ยอมรับของ E1b** (ผู้ตรวจให้ผ่านหรือไม่ผ่านทีละข้อ gap หนึ่งจุดต้องผ่านทั้งสี่ข้อจึงนับ)

| Criterion | สิ่งที่ผู้ตรวจดู |
| --- | --- |
| Code grounding | file:line และ code path มีอยู่จริงที่ commit ที่ปักไว้ |
| Evidence gap validity | instrumentation ที่มีอยู่ตอบ diagnostic question ที่ระบุไม่ได้จริง |
| Hypothesis relevance | gap เชื่อมกับสมมติฐานที่แข่งกันอย่างมีเหตุผล |
| Actionability | หลักฐานที่เสนอมีโอกาสช่วยแยกสมมติฐาน โดยไม่อ้างเกินหลักฐาน |

**ก่อน (v1) และหลัง (v2) ใน E3 วัดอะไร**

- **ก่อน:** สถานะของทุกสมมติฐานใน v1 ที่ล็อกไว้ ซึ่งส่วนใหญ่ควรเป็น Unresolved
- **หลัง:** สถานะใน v2 แยกตาม sub-cohort พร้อม coverage
- **เปิดเผยการสุ่ม:** เทียบว่า session ที่ได้ role Explorer ส่วนใหญ่ไปตกที่ `no_gate_event` หรือตอบ "Just browsing" หรือไม่ ถ้าไม่ตรง ให้รายงานตามจริงว่า Inconclusive

**สิ่งที่ล็อกแล้ว (pre-register, 15 ต.ค.)**

- [x] Repo สำหรับ Part B และ E1b: ensdomains/ens-app-v3 @ 3c10925fa042568d4affd6897d34e42159abd7a3 (MIT) ส่วน aave/interface ตัดเพราะ license เป็น All Rights Reserved
- [x] Annotation: E1a เลื่อนไปหลังงานจึงไม่ต้องทำ ถ้าทำ E1b ให้คนที่ไม่ได้จูน prompt เขียน diagnostic question และ gap ของตัวเองก่อนรัน analyzer
- [x] เกณฑ์ใน 4.8 คงเดิม และแผนการถาม: target\_n 10, budget 30, pending 60 วินาที, judging run ปิดศุกร์ 17:00, live run ปิดหลัง lock 12 นาที
- [x] Role card สองแบบเป็นภาษาอังกฤษ (ด้านล่าง) สุ่ม 50/50 แบบ permuted block ขนาด 4 และบันทึก seed hash ไว้ก่อนเปิดเก็บ
- [x] Simulated RPC error 0.10 เฉพาะครั้งแรกของ session ลองใหม่ผ่านเสมอ และข้อความบอกว่าเป็นการจำลอง

**Role card A (Funding Applicant):** "Role: A team looking for funding. Your team just built a project at this hackathon and wants a small grant from the DAO community to keep going after the event. A friend sent you this app and said applications are open. Find a funding program that fits your team, and decide for yourself whether to apply now. Do what you'd really do. There's no right or wrong answer. About 2 minutes."

**Role card B (Explorer):** "Role: Someone curious about the community. You've heard this DAO community funds finance projects, and you want to see what projects are out there. You don't have a project of your own to fund right now. Look at whatever interests you, and decide for yourself what to do next in the app. Do what you'd really do. There's no right or wrong answer. About 2 minutes."

สองการ์ดยาวเท่ากัน ใช้โครงเดียวกัน และไม่พูดถึง wallet, connect หรือแบบสอบถาม

สถานะในงาน: E1a เลื่อนไปหลังงานและ E2 ตัด เพราะเกณฑ์ตัดสินไม่ได้ให้คะแนนสองชุดนี้ E1b ทำถ้ามีเวลาหลัง G2 E4 นับจาก judging run ส่วน E3 ทำเฉพาะถ้าเข้ารอบนำเสนอ 20:00

**ขอบเขตของสิ่งที่อ้างได้:** ไม่มีชุดใดใน E1–E4 ตอบว่า policy ดีกว่า exit survey แบบตายตัวหรือไม่ การทดสอบนั้น (E5: fixed probe เทียบกับ policy ภายใต้ budget เดียวกัน) ต้องใช้ผู้ตอบมากกว่าที่จะมีในห้อง จึงเป็น future work ในงานนี้ GhostReport อ้างได้แค่ **pipeline ทำงานได้ตั้งแต่ต้นจนจบ และทุกการตัดสินใจตรวจย้อนได้** E4 ไม่มีกลุ่ม holdout จึงอ้างไม่ได้ว่าถามน้อยลงโดยคุณภาพเท่าเดิม และระบบบันทึก options\_shown ตามลำดับไว้ เพื่อดูว่าตัวเลือกหรือลำดับชี้นำคำตอบหรือไม่

## 8. Model และ LLM Harness

ใช้ **DeepSeek API** เพราะต้นทุนต่ำพอสำหรับ prototype ทุก LLM stage ใช้รุ่นเดียวกัน แบ่งเป็นสองโหมด

- **Dev (จูน prompt, debug):** `deepseek-flash` แบบปิด thinking เพราะต้องรันซ้ำหลายสิบรอบ
- **Evaluation และเดโม:** ล็อกแล้วเป็น `deepseek-flash` แบบปิด thinking ตัวเดียวกับตอน dev และใช้รุ่นนี้จนจบงาน ผลทุกชุดอ้างได้เฉพาะรุ่นนี้เท่านั้น

**ใน DEMO mode:** Stage A/B รันครั้งเดียวบน seed run แล้ว lock ผลไว้ การเข้าชมแต่ละครั้งไม่เรียก LLM ปุ่ม Re-run investigation สำหรับผู้เยี่ยมชมเป็นงานเสริมที่ทำถ้าทัน และต้องจำกัดจำนวนครั้ง ตอนนี้มีแค่ operator ที่เรียก /api/analyze ได้

**งบประมาณ:** ยอดเงินตอนนี้ $4.89 ประมาณการต่อหนึ่ง investigation (ContextPack ราว 30k token, ราคาช่วง peak) คือ Flash ≈ $0.03–0.04 และ Pro ≈ $0.12–0.15 ช่วง peak ของ DeepSeek ตรงกับ 08:00–11:00 และ 13:00–17:00 เวลาไทย ซึ่งทับกับช่วงงานเกือบทั้งหมด thinking token คิดราคาเป็น output จึงแพงที่สุด ให้ตั้งการแจ้งเตือนยอดเงินและเติมสำรองก่อนวันศุกร์ เพื่อไม่ให้ API ปฏิเสธ request กลางเดโม

**Cache:** วาง ContextPack ไว้ต้น prompt เป็น prefix ที่ไม่เปลี่ยน แล้วค่อยวางคำสั่งต่อท้าย การรันซ้ำบน repo เดิมจะได้ราคา input แบบ cache hit

| Stage | งาน | การตั้งค่า |
| --- | --- | --- |
| A Workflow Map | อ่าน ContextPack แล้วสร้าง WorkflowMap | JSON output mode แล้ว validate ด้วย Pydantic |
| B Hypotheses | สร้าง hypotheses, เสนอ action จาก catalog, ตัวเลือกของ probe | JSON output mode แล้ว validate ด้วย Pydantic |
| Narrative | เขียนย่อหน้าสรุปจาก facts JSON | ผ่าน claim checker |

**LLM harness** คือ wrapper บางๆ ไฟล์เดียวที่ทุก stage เรียกผ่าน มีหน้าที่ดังนี้

- โหลด prompt จาก `prompts/<stage>.v<n>.md` และบันทึก prompt\_version ทุกครั้ง
- ส่ง JSON schema ที่ได้จาก Pydantic model และ validate คำตอบ ถ้าไม่ผ่านให้ส่ง error กลับไปให้แก้ 1 ครั้ง
- Cache คำตอบใน `llm_calls` โดยใช้ key = sha256(model + prompt\_version + input) รันซ้ำด้วย input เดิมได้ผลเดิม
- โหมด `REPLAY=1` ใช้เปิด saved run ที่ครบชุดเท่านั้น (ไฟล์ SQLite ของ run นั้น: events, responses, decisions, outputs) ไม่ใช่ fallback ของ live run เพราะ input ใหม่จะ cache miss เสมอ ถ้า API ล่มระหว่าง live run ให้แสดง report ด้วย template จากสิ่งที่มี และติดป้ายบนจอ
- เก็บ latency และ token เพื่อตอบคำถามกรรมการเรื่องต้นทุนต่อ investigation
- Token cap ของ ContextPack เริ่มที่ค่าที่ทีมทดลองแล้วว่าพอดี แล้วล็อกไว้ใน config

**สิ่งที่ห้ามทำ:** ใช้ model ตัวเดียวกันมาตัดสินว่าผลของตัวเองถูกหรือไม่ (ตามคำเตือนของ Balog et al., SIGIR 2025) การประเมินใน 7 จึงใช้คนที่ blind และ role ที่สุ่มไว้

## 9. Harness Tools และโครงสร้าง Repo

เครื่องมือทั้งหมดเป็นของที่ติดตั้งได้ในคำสั่งเดียว ไม่มี infrastructure ที่ต้องดูแลระหว่างงาน

| ใช้ทำอะไร | เครื่องมือ |
| --- | --- |
| Backend + API | FastAPI, Pydantic, SQLite (`sqlite3` หรือ SQLModel) |
| Frontend (wallet flow + console) | React + Vite, TypeScript |
| Live update บน console | Polling ทุก 3 วินาทีจาก FastAPI |
| ค้นโค้ด | ripgrep (`rg`) เรียกผ่าน subprocess |
| เรียก LLM | OpenAI Python SDK ชี้ base URL ไปที่ api.deepseek.com ผ่าน harness ใน 8 |
| Test | pytest สำหรับ policy, guards และ blinding |
| Eval runner | สคริปต์ Python ที่อ่าน fixtures แล้วเขียน CSV |
| เดโม | หน้าแรก (landing) ที่รับ consent และแจก role card, สคริปต์ seed, โหมด replay, ปุ่ม reset สำหรับ operator |
| เขียนโค้ด | Claude / Cursor ตามที่กติกาอนุญาต |

```text
ghostreport/
├─ app/                    # Micro Wallet Flow (React) — target ของการสืบสวน
├─ console/                # GhostReport Console (React)
├─ landing/                # หน้าแรก: consent, role card, 3 ขั้น, วิธีติดตั้ง
├─ engine/
│  ├─ api.py               # FastAPI routes
│  ├─ context_builder.py   # rg + import graph → ContextPack
│  ├─ llm.py               # harness: schema, retry, cache, replay
│  ├─ stages.py            # Stage A, Stage B, Narrative
│  ├─ analyze.py           # /api/analyze (operator เท่านั้น)
│  ├─ investigation.py
│  ├─ records.py
│  ├─ guards.py            # ทุก guard ใน 6
│  ├─ cohorts.py           # SQL cohort + exit type
│  ├─ policy.py            # select() + decision trace
│  ├─ probe.py             # eligibility + delivery
│  ├─ reconcile.py         # กฎ 4.8 → v2
│  ├─ report.py            # report v1 / v2
│  ├─ demo.py              # DEMO mode + seed
│  └─ models.py            # Pydantic schemas
├─ prompts/                # stage_a.v1.md, stage_b.v1.md, narrative.v1.md
├─ roles/                  # role service แยก process ไม่ mount ให้ engine
├─ tests/
└─ ghostreport.yaml        # config ของ target app (ดู 10) reader แบบย่อ
```

**เพิ่มในงาน (15 ต.ค.):**

- **Hosting:** URL สาธารณะสำหรับ frontend และ backend เก็บ key ใน env ฝั่ง server
- **U-Bot (5% ของคะแนน):** ใช้โหมด U-Code ร่างหน้าแรกของเว็บ และโหมด Professional ร่าง write-up กับ README เก็บ screenshot ไว้ และใส่ "U-Bot" ใน tech stack ตอนส่งงาน คู่มือ U-Bot ไม่มี API จึงไม่เชื่อมเข้า runtime
- **ส่งงาน:** hub.team1.network หัวหน้าทีมต้องลงทะเบียนและรอผู้จัดอนุมัติก่อนจึง submit ได้

## 10. Integrate เข้ากับ Repository อื่น

Engine ไม่รู้จักแอปใดเป็นการเฉพาะ มันรู้จักแค่ canonical event schema กับ ContextPack การต่อเข้ากับ repo ใหม่จึงเป็นการเขียน config หนึ่งไฟล์ ไม่ใช่การแก้ engine และแบ่งได้เป็นสี่ระดับตามสิ่งที่ทีมเจ้าของ repo ยอมให้

| ระดับ | ต้องมีอะไรจาก repo เป้าหมาย | ได้อะไร | ใน MVP |
| --- | --- | --- | --- |
| L0 Read-only | git URL + commit SHA | WorkflowMap, Evidence Gaps, hypotheses ที่อ้างโค้ด | ใช่ (Part B) |
| L1 Event adapter | export หรือ SQL query ของ analytics ที่มีอยู่ + mapping ชื่อ event | cohorts และ funnel จากพฤติกรรมจริง | ใช่ (แอปของเราเอง) |
| L2 Probe delivery | ฝัง component `<ProbeCard/>` หรือยิงผ่าน survey API ที่ทีมใช้อยู่ | คำตอบจากผู้ใช้จริงเข้าสู่ investigation | ใช่ (แอปของเราเอง) |
| L3 Instrumentation | สิทธิ์เปิด pull request | diff ที่เพิ่ม event ที่ขาด ให้ dev review | ไม่ (roadmap) |

**ไฟล์ config ของ repo เป้าหมาย**

```yaml
repo:
  url: https://github.com/<owner>/<repo>
  commit: <sha>
  include: ["src/**/*.ts", "src/**/*.tsx"]
workflow:
  name: wallet_onboarding
  keywords: [wallet, connect, requireWallet]
mode: behavioral              # หรือ code_only สำหรับ L0
events:                       # ชื่อใน analytics เดิม → canonical
  "Project Viewed": project_viewed
  "Apply Clicked": apply_clicked
  "Wallet Gate Shown": wallet_gate_shown
  "Wallet Connect Started": wallet_attempted
  "Wallet Connected": wallet_connected
  "Not Now Clicked": not_now_clicked
  "Back To List": back_nav
requires_seq: true            # ไม่มี seq → coverage เป็น unknown เสมอ
privacy:
  allowed_props: [project_id, page]
probe:
  delivery: component         # หรือ survey_api
  budget: 30
  consent_required: true
```

ถ้า mapping ไม่มี event ที่ catalog ต้องใช้ action นั้นจะไม่ถูกเสนอ และ report บอกว่าตรวจอะไรไม่ได้ เช่น ไม่มี `wallet_gate_shown` แปลว่า rule R2 ใช้ไม่ได้ ส่วน L0 (Part B ของเดโม) รันใน `code_only` mode: ได้ WorkflowMap, evidence gaps และ hypotheses แต่**ห้ามสร้าง behavioral findings** ไม่ต้อง deploy หรือแก้โค้ดของ repo คนอื่น และต้องเคารพ license ของ repo นั้น

**หน้า "ติดตั้งใน 3 ขั้น" บนเว็บเดโม:** (1) คัดลอก track.ts แล้วเรียก `track()` (2) เขียน ghostreport.yaml ไฟล์เดียวตามตัวอย่างข้างบน (reader ตอนนี้อ่านแค่ repo, include, keywords และ event mapping ฟิลด์อื่นในตัวอย่างยังเป็นแผน) (3) วาง \<ProbeCard/> ที่ทางออก หน้านี้คือหลักฐานด้าน Practicality ว่าทีม product นำไปใช้ได้จริง

**Part B:** รันแบบ `code_only` บน ensdomains/ens-app-v3 ที่ commit `3c10925fa042568d4affd6897d34e42159abd7a3` (MIT) ซึ่งมี event ของ PostHog เกี่ยวกับ wallet และ registration ส่วน aave/interface ไม่ใช้ เพราะ license เป็น All Rights Reserved

## 11. Team Split และ Timeline วันงาน

เป้าหมายสำคัญที่สุดคือ G2 ตอน 17:45 วันพฤหัส (ห้องปิด 18:00) เมื่อ loop ต้องรันได้ครบตั้งแต่ event จนถึง report v2 ด้วยข้อมูล seed แม้หน้าตาจะยังไม่สวย เพราะวันศุกร์ build ได้แค่ 10:00–14:00 และต้อง submit repo, demo website, deck และ write-up ภายใน 14:00 (ทีมตั้งเป้า 13:30)

&#91;embedded content: แผนวันงาน · 4 lanes, 4 ช่วง, 3 gates\]

ใส่ชื่อเจ้าของแต่ละ lane ได้โดยแก้ชื่อ lane ในภาพ หลังส่งงาน: ประกาศ finalist 17:05–17:15 และ top 3 ของแต่ละ track นำเสนอสด 20:00–21:00 G3 คือ freeze ตอน 12:00 วันศุกร์ หลังจากนั้นแก้แค่ bug แล้ว submit 13:30 ถ้าไม่ผ่าน G3 ให้ตัดงานตามลำดับในข้อ 12 และเขียนใน write-up ว่าเป็น partial prototype

## 12. Judge Notes: ความเสี่ยงที่ยังเหลือ

การออกแบบนี้ปิดจุดอ่อนหลักจากรอบก่อนได้แล้ว ที่เหลือคือความเสี่ยงด้าน execution ซึ่งแต่ละข้อมีทางสำรองที่เตรียมได้ก่อน

**เกณฑ์ตัดสินจริงจากผู้จัด:** App execution 40%, Practicality 40%, Usability & Design 10%, Innovation & Ecosystem 5% และ U-Bot integration 5% กรรมการเปิด repo, demo website และ deck เอง ความเสี่ยงที่หนักที่สุดจึงเป็นเว็บที่กรรมการเปิดแล้วใช้ไม่ได้

| ความเสี่ยง | สัญญาณเตือน | ทางสำรอง |
| --- | --- | --- |
| AI อ้างโค้ดผิดใน repo ที่ไม่คุ้น | ref validity ใน E1 ต่ำ | guard ตัด ref ผิดทิ้ง แล้วรายงานอัตราตามจริง อย่าเปลี่ยน repo หลังเห็นผล |
| เลือก repo ที่ AI ทำได้ดีมาโชว์ (cherry-pick) | ทดสอบหลายตัวแต่โชว์ตัวเดียว | บอกบนเวทีว่าทดสอบกี่ตัวและได้ผลเท่าไรทุกตัว |
| กรรมการเลือก repo ที่ไม่มี annotation | ไม่มี ground truth ให้เทียบ | แสดงแค่ ref validity กับตัวอย่าง gap แล้วบอกว่า precision วัดได้เฉพาะ repo ที่ annotate แล้ว |
| คนในห้องตอบ probe น้อย | sub-cohort มีคำตอบน้อยกว่า 3 | แสดงสถานะ Unresolved ตามจริง แล้วเปิด pilot replay ที่ติดป้าย |
| Wi-Fi หรือ API ล่ม | latency พุ่ง หรือ error | สลับเป็น `REPLAY=1` และติดป้ายบนจอ |
| Role card ทำให้คนมีเจตนาที่ไม่เป็นธรรมชาติ | กรรมการถามเรื่อง validity | ยอมรับว่าเป็น simulated work task ตาม Borlund (2003) ใช้เพื่อมี ground truth ไม่ได้อ้างว่าเป็นพฤติกรรมจริงในตลาด |
| เวลาไม่พอ | วงหลักยังไม่ผ่าน G2 ตอน 17:45 วันพฤหัส | ตัดตามลำดับ: narrative LLM → probe options จาก LLM (ใช้ตัวเลือกเขียนมือ) → Part B ห้ามตัดวงหลัก event → probe → report และเว็บที่ deploy แล้ว |
| เว็บเดโมล่มหรือช้าตอนกรรมการเปิด | เปิดจาก private window หรือมือถือแล้ว error | deploy ตั้งแต่วันพฤหัส ใช้ judging run ที่ lock ผลไว้ ไม่เรียก LLM ต่อการเข้าชม และมี REPLAY=1 สำรอง |
| กรรมการเจอ error จำลองแล้วนึกว่าแอปพัง | กด Connect ครั้งแรกแล้วเจอ error | ข้อความ error บอกว่าเป็นการจำลอง อัตรา 0.10 เฉพาะครั้งแรก และลองใหม่ผ่านเสมอ |
| ลิงก์ที่ส่งเปิดไม่ได้ | deck หรือ repo ขอสิทธิ์เข้าถึง | repo เป็น public, deck ตั้ง Anyone with the link can view และทดสอบทุกลิงก์ใน private window ก่อน submit |

**คำถามที่ต้องตอบได้ภายใน 15 วินาที**

- "ใครเขียน `connectWallet()`?" → ทีมเขียนเอง จึงมี Part B ที่รันกับ repo ที่ทีมไม่ได้เขียน
- "Linter ทำได้ไหม?" → linter บอกว่าบรรทัดไหนไม่มี event แต่ไม่บอกว่าช่องว่างนั้นทำให้แยกสมมติฐานคู่ไหนไม่ได้ ดูว่า rule ไหนต้องใช้ event นั้น
- "ต่างจาก LogRocket Galileo ตรงไหน?" → Galileo อธิบาย session ที่ถูกเก็บไว้แล้ว GhostReport ตัดสินว่าหลักฐานอะไรยังไม่มี และควรเก็บจาก cohort ไหน
- "ต่างจาก in-app survey อย่าง Sprig หรือ Pendo ตรงไหน?" → เครื่องมือพวกนั้นถามทุกคนที่เข้าเงื่อนไข GhostReport ตรวจ log ก่อน ถ้า log ตอบได้ก็ไม่ถาม อ่านโค้ดว่าเก็บอะไรและขาดอะไร ล็อกสมมติฐานก่อนถาม และทุกประโยคใน report ย้อนไปหาหลักฐานได้

**ช่อง pre-existing idea ในหน้าส่งงาน:** ติ๊กตามจริง เพราะไอเดียและ design ทำก่อนงาน ซึ่ง FAQ อนุญาต แล้วเขียนใน description ว่าออกแบบและค้นคว้าก่อนงาน ส่วนโค้ดทั้งหมดเขียนในงาน ดูได้จาก commit history ตั้งแต่ 15 ต.ค. จากนี้ commit หลังทำงานเสร็จแต่ละชิ้น history จะได้เห็นความคืบหน้า

## 13. Quality Scenarios และ Architecture Decisions

แต่ละ scenario คือ test ที่ต้องผ่านก่อน G3 และเป็นรายการซ้อมก่อนขึ้นเวทีไปด้วย (ยืมรูปแบบจาก arc42)

| เหตุการณ์ | พฤติกรรมที่ต้องตรวจได้ |
| --- | --- |
| ตรวจ event แล้วไม่มีข้อมูลใหม่ | policy ไม่เลือก action เดิมซ้ำ และเลื่อนไป probe ได้ |
| LLM API timeout | ผู้ใช้กด Not now แล้วออกได้ทันที ระบบไม่โหลดแผน probe ใหม่จนกว่า API จะกลับมา |
| คนเดียวเปิดหลาย session | แต่ละ session ถูกถามได้ไม่เกินหนึ่งครั้ง และ report นับตาม session (ไม่รับประกันเพดานรวมของ budget ดู ADR-8) |
| Event หายกลางทาง (seq ขาด) | coverage เป็น unknown และไม่มี rule ใดถูกใช้ (และต้องมี test ว่า gate component ยิง \`wallet\_gate\_shown\` หนึ่งครั้งต่อการแสดง gate หนึ่งครั้ง (ไม่ใช่ทุก React re-render) เพราะ R2 พึ่งข้อสมมตินี้) |
| Event ถูกส่งซ้ำ | จำนวน session และ attempt ไม่เพิ่ม |
| ผู้ใช้ตอบ probe แล้วกลับไป connect สำเร็จ | คำตอบยังนับใน cohort\_at\_shown |
| ContextPack ถูกตัด | report แสดงขอบเขตที่ขาด และติด `unknown` แทน `not_found_in_scope` |
| ผู้ใช้กด Skip | ไม่ถามซ้ำ และไม่เปลี่ยนป้ายของสมมติฐานใด |
| เปิด replay | โหลด run file ที่บันทึกไว้ทั้งชุด จอแสดงป้าย replay และไม่ปนกับ live run |
| Repo มีข้อความสั่ง LLM ฝังอยู่ | action ที่เสนอยังต้องอยู่ใน catalog, rule ต้องเป็นของที่ review แล้ว และไม่มีอะไรถูก execute |
| ผู้เยี่ยมชมหลายคนเปิดเว็บเดโมพร้อมกัน | แต่ละ session ต่อท้าย judging run ได้ report v2 คำนวณใหม่แบบตายตัว และไม่มีการเรียก LLM ต่อการเข้าชม |
| ผู้เยี่ยมชมกด Connect แล้วเจอ error จำลอง | ข้อความบอกว่าเป็นการจำลอง และลองใหม่แล้วผ่าน |
| ตรวจ repo public และ bundle ฝั่ง client | ไม่พบ DeepSeek key หรือ secret ใด ๆ |

**เกณฑ์ผ่านของวงจร probe → report** (ต้องผ่านก่อน G2)

| สถานการณ์ | ผลที่ต้องได้ |
| --- | --- |
| ห้าคนตอบคำถามเดียวกันในกลุ่มเดียวกัน | report แสดง n = 5 ไม่ใช่ห้ากลุ่มที่ n = 1 |
| คนแรกเลือกตัวเลือกที่ครอบคลุมทุกสมมติฐาน | ยังเก็บคำตอบจากคนถัดไปจนถึง target\_n, budget หรือเวลาสิ้นสุด |
| คนที่โหลดแผนแล้วไป Connect ก่อนกดย้อน | ไม่ถูกนับเป็นกลุ่มที่ไม่มี attempt ตอนถาม |
| กด Not now ซึ่งสร้าง event ใหม่ | DP1 ยังแสดง probe ได้ tier 0 ไม่มาขวาง |
| เห็น probe แล้วปิดแท็บ และ beacon ถึง server | นับเป็น shown\_no\_response |
| เห็น probe แล้วปิดแท็บ และ beacon หาย | ไม่มี exposure และ report ระบุข้อจำกัดของ exposure coverage (นับจาก seq ที่ขาด) |
| probe\_shown มาถึงก่อน wallet\_attempted ที่เกิดก่อนหน้า | cohort เป็น pending จนกว่า seq จะครบ และไม่ถูกนับเป็นกลุ่มที่ไม่มี attempt |
| โหลดแผนไว้แล้วกดออกหลัง ends\_at | ไม่แสดง probe |
| build ที่ไม่ผ่าน instrumentation test | R2 ไม่ถูกใช้ และ coverage เป็น unknown |

**Architecture Decision Records**

| # | การตัดสินใจ | เหตุผล | ผลที่ยอมรับ |
| --- | --- | --- | --- |
| ADR-1 | Policy เป็น deterministic | ตรวจซ้ำได้และอธิบายได้ทุกขั้น | ความถูกต้องยังขึ้นกับสมมติฐานและ rule ที่ป้อนเข้าไป |
| ADR-2 | Self-report ไม่ตัดสมมติฐาน | คำตอบของคนไม่ใช่ oracle อาจมีหลายเหตุผลหรือตอบไม่ตรง | report อาจเหลือหลายสมมติฐานค้าง ต้องยอมแสดง Unresolved |
| ADR-3 | Tier 1 เป็นแค่ recommendation ใน MVP | ไม่มีเวลาทำ flow ให้ dev อนุมัติและ deploy ระหว่างเดโม | ช่องว่างที่ต้อง instrument ถูกปิดไม่ได้ในงาน |
| ADR-4 | Open-world ทั้งโค้ดและ telemetry: ไม่พบ ≠ ไม่มี | Context Builder อ่านแค่บางไฟล์ และ event อาจหาย | report พูดได้แค่ "ไม่พบในขอบเขตที่ค้น" หรือ "ไม่มี event ที่บันทึกไว้" |
| ADR-5 | Digest ของ v1 อยู่นอกระบบ | hash chain ใน DB เดียวพิสูจน์ด้วยตัวเองไม่ได้ | ต้องมีคนนอกทีมถือ digest ก่อน probe แรก |
| ADR-6 | Action catalog, hypothesis class และ contradiction rule เขียนโดยทีม LLM แค่เลือก | LLM เขียนตรรกะผิดได้และโดน prompt injection ได้ | ระบบเสนอได้แค่ action ที่ทีมคิดไว้ล่วงหน้า |
| ADR-7 | อ้างแค่ pipeline feasibility ไม่อ้างว่า policy ดีกว่า survey ธรรมดา | ไม่มีผู้ตอบพอสำหรับ E5 | คำตอบต่อคำถาม "ต่างจาก Google Form ตรงไหน" ต้องเน้นหลักฐานจากโค้ดและความตรวจย้อนได้ ไม่ใช่ประสิทธิภาพการถาม |
| ADR-8 | MVP ไม่มีระบบจอง budget ล่วงหน้า (grant) | เดโมไม่ต้องพิสูจน์การบังคับเพดาน budget แบบห้ามเกิน และ grant เพิ่ม state ที่ต้องทดสอบหลายจุด | จำนวน probe อาจเกิน budget เมื่อมี client พร้อมกันหรือคนเดียวเปิดหลาย session target\_n เป็นเป้าหมายที่อาจเกินได้ ระบบที่ต้องรับประกันเพดานจริงค่อยเพิ่มการจองภายหลัง ขึ้นกับว่าต้องรับประกันเพดานแบบใด |
