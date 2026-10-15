# GhostReport — Core Paper Review

Oct 15, 2026 · @Sinu

งานหลักทั้งหกเรื่องรองรับ GhostReport ได้จริง แต่หลายเรื่องรองรับคนละแบบกับที่เราเคยอ้างไว้ และมีสองเรื่อง (Tao, Rodler) ที่ช่วยลดงานของเราได้ Tao, Rodler และ Borlund อ่านจากฉบับเต็ม ส่วนอีกสามเรื่องอ่านจาก abstract

## ภาพรวม

| Paper | อ่านจาก | รองรับอะไร | อ้างอะไรไม่ได้ | ผลต่อ design |
| --- | --- | --- | --- | --- |
| [Tao et al. 2026](https://arxiv.org/pdf/2607.05785v1) | ฉบับเต็ม | การมี log ไม่เท่ากับการมีหลักฐานพอวินิจฉัย | intent ของผู้ใช้, การหาช่องว่าง, และ KeyBag F1 ไม่ได้พิสูจน์ว่าเพียงพอต่อการวินิจฉัย | E1a แบบ strip-and-restore พร้อม leakage check (เลื่อนไปหลังงาน) |
| [Rodler 2018](https://easychair.org/publications/paper/zHgj/open) | ฉบับเต็ม | การจัดอันดับ query โดยไม่ใช้ prior (SPL1.1) | เหตุผลของคนที่ซ้อนกันได้, คำตอบของคนที่ไม่ใช่ oracle | ใช้ SPL1.1 กับ binary query ที่ partition มีเหตุผลรองรับ ส่วน survey เป็นหลักฐานที่มี noise |
| [Baxter 2014](https://research.google/pubs/esm-versus-logs-filling-in-the-gaps/) | abstract | log บอก WHAT ไม่บอก WHY | ว่า probe แบบแตะครั้งเดียวได้ผล | ใช้เป็น hook บนสไลด์ปัญหา |
| [Harbach & Johnson 2026](https://research.google/pubs/who-am-i-talking-to-a-large-scale-measurement-of-surface-attribution-across-real-world-security-and-privacy-interfaces/) | abstract | ผู้ใช้มักบอกไม่ได้ว่าใครเป็นคนขอสิทธิ์ | พฤติกรรมจริงกับ crypto wallet, ว่าตัวเลือกใหม่ใน probe ได้ผล | ตัวเลือก probe เป็น design hypothesis ของเรา และข้อจำกัดของ mock |
| [Bethlehem 2010](https://dare.uva.nl/id/73f3f091-40be-41b4-8f0a-debd8c5b4259) | abstract | self-selection ทำให้ผล survey เชื่อถือไม่ได้ | ว่า k of n กำจัด selection bias | coverage และ self-selection ขึ้นกับประชากรเป้าหมายและ eligibility ต้องรายงานแยก |
| [Borlund 2003](https://informationr.net/ir/8-3/paper152.html) | ฉบับเต็ม | role card ให้ทั้งความสมจริงและการควบคุม | การนำไปใช้กับ wallet onboarding, ว่ากลุ่มที่ไม่มี task เท่ากับ real information need | role card สองแบบที่ใกล้ตัวคนในงาน |

## 1. Tao et al. (2026): ให้วิธีประเมิน E1 สำเร็จรูป

**สิ่งที่ทำจริง:** ใช้ 1,223 instances จาก repo open source 10 ตัวและ repo ในอุตสาหกรรม 8 ตัว ใช้ parser เฉพาะภาษาถอด observability statements ออกโดยคง business logic และ control flow ไว้ แล้วให้ coding agent เติมกลับ วัดสองแกน คือ Position F1 (ใส่ถูกตำแหน่งไหม) และ KeyBag F1 ซึ่งวัด**ความทับซ้อนของ token** ระหว่างสิ่งที่ agent เขียนกับของที่คนเขียนไว้ในตำแหน่งเดียวกัน KeyBag F1 จึงเป็น lexical proxy ของเนื้อหาการวินิจฉัย ไม่ได้พิสูจน์ว่า log เพียงพอต่อการวินิจฉัยจริง งานนี้แยกเรื่องนั้นไปวัดด้วย Fault Signals Rate ตอน runtime

**ผลลัพธ์:** Position F1 สูงกว่า KeyBag F1 ในทุกแบบของ prompt เช่น แบบ few-shot ได้ 0.594 เทียบกับ 0.383 เมื่อสั่ง agent ตรงๆ ให้ปรับ observability มันสร้าง statement มากขึ้นแต่ precision ลดลงชัดเจน ส่วนตัวอย่าง few-shot จากไฟล์เดียวกันช่วยให้ดีขึ้นทั้งเนื้อหาและตำแหน่ง ฝั่ง runtime ระบบที่ agent สร้างแสดง fault signal ได้แค่ 4.95–13.99% ของ fault ที่ใส่เข้าไป

**สิ่งที่อ้างไม่ได้:** งานนี้ศึกษา fault signal ใน microservice ไม่ใช่ intent ของผู้ใช้ และวัดการ*สร้าง* instrumentation ไม่ใช่การ*หา*ช่องว่าง

**สิ่งที่ควรนำมาใช้:**

- **E1a แบบ strip-and-restore:** ลบ `track()` / `capture()` ออกจาก repo dApp ให้ GhostReport หาว่าควรมี event ตรงไหน แล้วเทียบกับของเดิม ได้เฉลยโดยไม่ต้อง annotate ด้วยมือ ข้อจำกัดสำคัญประการหนึ่งที่งานนี้ยอมรับคือ instrumentation ที่คนเขียนไม่ใช่เพดานที่ดีที่สุด
- **Protocol ขั้นต่ำของ E1a:**
  1. เลือก repo ที่**มี analytics calls เกี่ยวกับ wallet อยู่จริง** ถ้าไม่มีก็ทำ E1a ไม่ได้ ปัญหานี้แก้ด้วย prompt ไม่ได้
  2. เก็บ commit และ instrumentation เดิมไว้เป็นเฉลย
  3. สร้างสำเนาที่ลบ instrumentation ออกโดยไม่แตะ business logic
  4. **Leakage check:** ค้นว่าชื่อ event ยังหลุดอยู่ใน type, test, helper หรือ constant หรือไม่ ถ้าลบไม่ได้ให้บันทึกว่าอะไรยังมองเห็นอยู่
  5. ประเมินการกู้คืน event และตำแหน่งเทียบกับของเดิม
- **E1a ผ่านไม่ได้แปลว่า E1b ผ่าน:** E1a วัดการกู้คืน instrumentation ที่เคยมีอยู่ ส่วน E1b วัดการเจอช่องว่างที่ทำให้แยกสาเหตุไม่ได้ ซึ่งเป็น product thesis จริง
- เรื่อง over-generation ตรงกับ design ของเรา เราไม่ถามว่าขาด event อะไรบ้าง แต่ถามว่าขาดอะไรที่ทำให้แยกสมมติฐานไม่ได้
- ใส่ analytics calls ที่มีอยู่แล้วใน repo ลงใน ContextPack เป็นตัวอย่าง few-shot (ยกเว้นตอนรัน E1a ที่ลบออกแล้ว)

เกณฑ์ยอมรับของ E1b (code grounding, ความถูกต้องของ gap, ความเกี่ยวข้องกับสมมติฐาน, actionability) อยู่ในข้อ 7 ของเอกสาร System Design

**สถานะในงาน (15 ต.ค.):** ไม่รัน E1a ในงาน เพราะเกณฑ์ตัดสินไม่ได้ให้คะแนนส่วนนี้ ส่วนการพิสูจน์ว่า code-awareness ใช้กับโค้ดที่ทีมไม่ได้เขียนได้ ใช้ Part B บน ensdomains/ens-app-v3 ที่ commit 3c10925f (license MIT) ใน code\_only mode แทน

## 2. Rodler (2018): ใช้ได้ แต่ข้อสมมติต่างจากโจทย์ของเราสองข้อ

**ศัพท์ที่อ้างได้ถูกต้อง:** แต่ละ query แบ่ง hypotheses เป็นสามกลุ่ม คือกลุ่มที่ทำนายคำตอบบวก กลุ่มที่ทำนายคำตอบลบ และกลุ่มที่ไม่ทำนายอะไรเลย (uncommitted) query ที่ทั้งสองฝั่งไม่ว่างเรียกว่า discriminating query และ query ที่ไม่มี uncommitted hypotheses เลยเรียกว่า strong query

**Measure ที่ไม่ต้องใช้ probability มีอยู่จริง:** Split-In-Half (SPL) พยายามตัด hypotheses ให้ได้ครึ่งหนึ่งพอดี งานนี้แนะนำว่าถ้าไม่มี prior ที่สมเหตุสมผลและเลือกตัดแบบ greedy ควรใช้ SPLy ที่ y มากกว่า 1 เล็กน้อย เช่น 1.1 แทน SPL ปกติ กฎ "ไม่ใช้ probability" ของเราจึงมีเหตุผลรองรับจากงานนี้โดยตรง

**ข้อสมมติที่ไม่ตรงกับเรา:**

- Oracle ตอบ binary query ถูกเสมอ
- มี **target hypothesis ที่ต้องการค้นหา** แต่ผู้ใช้หนึ่งคน แม้ใน session เดียว ก็มีหลายเหตุผลพร้อมกันได้ เช่น ไม่เข้าใจสิทธิ์ ไม่ไว้ใจ dApp และยังไม่ได้คิดจะสมัคร การจำกัดไว้ที่ระดับ session จึงยังไม่พอ

> We apply SPL₁.₁ only to diagnostic questions with defensible binary outcome partitions. For potentially overlapping human motivations, it serves as a heuristic rather than a guaranteed hypothesis-elimination method.

**ผลต่อ design:**

- สูตรที่ใช้: SPLz(Q) = | |V+| − |V−| | + z·|V0| เลือก query ที่คะแนนต่ำที่สุด ใช้ z = 1.1 เป็น heuristic จัดอันดับที่ไม่ต้องใช้ probability
- A2 ("session มี gate event หรือไม่") เป็น observation ระดับผู้ใช้ ไม่ใช่การตรวจโค้ด การทำนายผลของ A2 ขึ้นกับว่านิยามสมมติฐานไว้แคบแค่ไหน ถ้า H2 คือ **"กังวลต่อคำขอสิทธิ์ที่แสดงใน gate"** H2 ต้องการให้ผู้ใช้เห็น gate จริง แต่ถ้า H2 คือ "ไม่ไว้ใจ wallet" แบบทั่วไป ผู้ใช้อาจกังวลตั้งแต่ก่อนเห็น gate และ H2 ไม่ได้ทำนายผลของ A2 เลย ความกังวลแบบทั่วไปจึงต้องเป็นอีกสมมติฐานหนึ่ง (หรือตกอยู่ใน H\_other)
- Prediction ต้องมาจากนิยามที่ทีมเขียนและมีเหตุผลรองรับ ห้ามให้ AI กำหนดเพื่อให้ partition ดูสมดุล ถ้ายังสร้าง partition ที่มีเหตุผลไม่ได้ ให้ A2 เป็นแค่ telemetry inspection action ที่ไม่คำนวณ SPL1.1
- ด้วยนิยามแคบของ H2 และสมมติฐานชุดปัจจุบัน ฝั่ง V− ว่าง A2 จึงไม่ใช่ discriminating query ตามนิยาม
- Evidence action ไม่ต้องผ่าน SPL1.1 ทุกตัว action ที่ตรวจโค้ด (repository inspection) หรือ recommendation ไม่ใช่ query ต่อผู้ใช้
- เมื่อมีแค่สามสมมติฐาน หลาย query แบ่งได้ 1:2 เท่ากัน ต้นทุน, privacy และภาระของผู้ใช้จึงเป็นตัวตัดสินจริง
- **probe ไม่กลายเป็น strong query เพียงเพราะมีตัวเลือก Other** คำตอบจาก probe เป็นหลักฐานที่มี noise ใช้ปรับสถานะเท่านั้น ไม่ใช้ตัดสมมติฐาน

> A recorded UI exposure event is a proxy for actual user exposure, not proof of perception. Missing events must not be treated as proof that the corresponding UI was never shown.

ใน design ของเรา R2 จึงใช้ได้เฉพาะ session ที่ coverage ครบ (`seq` ต่อเนื่องและมี exit event) ซึ่งตัดกรณี event หายระหว่างทางออกไปได้ แต่ยังพึ่งข้อสมมติว่า gate component ยิง event ทุกครั้งที่ render จริง ข้อสมมตินี้ต้องมี test รองรับ และการมี gate event ก็ไม่ได้แปลว่าผู้ใช้อ่านคำขอสิทธิ์แล้ว

## 3. Baxter (2014): ใช้ได้แค่เป็น hook

ชิ้นนี้เป็น abstract ของการนำเสนอที่ American Anthropological Association 2014 Annual Conference ไม่ใช่ paper ฉบับเต็ม แนวคิดหลักคือ analytics บอกได้แค่ว่าเกิดอะไร (WHAT) แต่ไม่บอกว่าทำไม (WHY) โดยยกตัวอย่าง Google Flu Trends ที่ข่าวทำให้คนค้นคำเดิมเพราะอยากรู้ ไม่ใช่เพราะป่วย

ตัวอย่างนี้เหมาะกับสไลด์ปัญหา เพราะเป็นเรื่องเดียวกับ cohort ที่แค่เข้ามาดูโครงการ แต่**อย่าใช้อ้างเป็นหลักฐานว่า probe ของเราได้ผล** เพราะ ESM ในงานนี้คือการให้ผู้เข้าร่วมบันทึกประสบการณ์ตลอดห้าวันพร้อมส่งรูป ซึ่งเป็นเครื่องมือคนละขนาดกับคำถามแตะครั้งเดียวของเรา

## 4. Harbach & Johnson (CHI 2026): สมมติฐานที่เรายังไม่มี และข้อจำกัดของ mock wallet

**สิ่งที่พบ:** จาก vignette survey สองชุด (N=4,400 และ N=3,057) ผู้ใช้ระบุแหล่งที่มาของ UI ได้ถูกเพียง 55% บน desktop และ 53% บนมือถือ ความคุ้นเคยและ brand cue ที่ชัดช่วยได้มาก แต่ตำแหน่งของ UI แทบไม่มีผล

**ผลต่อ GhostReport:**

- H2 (กังวลเรื่องสิทธิ์) อาจซ่อนเหตุผลอีกแบบ คือ**ไม่แน่ใจว่าใครเป็นคนขอ** (dApp, wallet หรือ browser) เราจึงเพิ่มตัวเลือก probe "Not sure who is asking" ข้อนี้เป็น **design hypothesis ของเรา** งานนี้ไม่ได้ทดสอบว่าการถามแบบนี้ได้ผล
- **ข้อจำกัดที่ต้องเขียนลงเอกสาร:** mock wallet popup อยู่ในหน้าเว็บ ไม่ใช่ extension จริง ปัญหาเรื่องแหล่งที่มาของ UI ในเดโมจึงไม่เหมือนของจริง และผลจาก mock ไม่ generalize ไปถึง wallet จริง
- งานนี้วัดจาก vignette ไม่ใช่พฤติกรรมจริง และไม่ได้ศึกษา crypto wallet โดยตรง

## 5. Bethlehem (2010): ใช้ได้แค่ครึ่งเดียว

อ่านได้แค่ abstract (เว็บ Wiley บล็อก แต่ UvA มี PDF แบบ open access) ปัญหาหลักของ web survey มีสองข้อ คือ under-coverage และ self-selection ซึ่งทำให้ค่าประมาณเอนเอียงได้ทั้งคู่ งานนี้ทดลองวิธีแก้ เช่น adjustment weighting และ reference survey แล้วสรุปว่า under-coverage อาจหายไปเองในอนาคต แต่ self-selection ทำให้ผลเชื่อถือไม่ได้

**สำหรับเรา:** ทั้งสองปัญหาเกี่ยว ขึ้นกับว่า report พูดถึงประชากรกลุ่มไหน ถ้าพูดถึงเฉพาะคนที่มาถึง decision point under-coverage แทบไม่มีผล แต่ถ้าคำถามคือ "ทำไมผู้ใช้ทิ้ง wallet onboarding" กลุ่มที่ปิดแท็บไปก่อนได้รับ probe ก็อยู่ในประชากรเป้าหมาย และอาจมีเหตุผลต่างจากคนที่ถูกถาม Report จึงต้องแยกสามเรื่องเสมอ:

- **Coverage:** ใครมีโอกาสได้รับ probe
- **Nonresponse:** ในกลุ่มที่มีโอกาส ใครเลือกไม่ตอบ
- **Generalization:** คำตอบสรุปถึงกลุ่มใดได้จริง

กฎ "k of n respondents" เหมาะกับการรายงาน แต่**ไม่ได้กำจัด selection bias** ทุก report จึงต้องบันทึกนิยามประชากรเป้าหมายและจำนวน exposure (eligible → shown → answered / skipped / shown\_no\_response ตาม probe\_exposures ใน System Design และนับ session ที่ inactive ซึ่งถามไม่ได้แยกต่างหาก) ไว้คู่กันเสมอ

## 6. Borlund (2003): ใช้ออกแบบ role card ได้ตรงที่สุด

Simulated work task คือเรื่องเล่าสั้นๆ ที่ทำให้ผู้ทดสอบเกิดความต้องการและตีความสถานการณ์ด้วยตัวเอง ให้ทั้งความสมจริงและการควบคุมการทดลอง

**คำแนะนำที่นำมาใช้ได้:**

- ออกแบบสถานการณ์ให้ผู้ทดสอบเห็นตัวเองในนั้น หัวข้อน่าสนใจ และมีบริบทพอให้จินตนาการตาม ใช้สองการ์ดคือ **Funding Applicant** และ **Explorer** ข้อความฉบับจริงเป็นภาษาอังกฤษตาม UI ของแอป และล็อกไว้ในข้อ 7 ของ System Design
- Borlund แนะนำให้ใช้ความต้องการจริงคู่กับความต้องการจำลอง โดยให้ความต้องการจริงเป็น baseline แต่ความต้องการจริงต้องมาจากผู้ใช้เอง การให้คนเข้ามาโดยไม่มี task **ไม่เท่ากับ** real information need กลุ่มแบบนั้นเป็นแค่เงื่อนไขการทดลองเพิ่มเติมที่เราเสนอเอง และไม่ใส่ใน MVP เพราะคนในห้องมีน้อย
- Pilot test ก่อนทดสอบจริง ในงานนี้คือรัน seed และลองเว็บเดโมเองก่อนส่งงาน (พฤหัสเย็นถึงศุกร์เช้า) ข้อแนะนำนี้มาจากประสบการณ์ที่ผู้วิจัยรายงาน ไม่ใช่ผลการทดลอง

**ข้อจำกัด:** หลักฐานในงานนี้มาจากพฤติกรรมการค้นข้อมูล (IR) การนำมาใช้กับ wallet onboarding เป็นสมมติฐานของเรา

## สิ่งที่แก้ในเอกสาร System Design แล้ว

ทั้งห้าข้อใส่ใน System Design แล้วเมื่อ 15 ต.ค. ทุกข้อทำให้งานเล็กลงหรือเท่าเดิม

- [x] แยก E1 เป็น E1a (strip-and-restore: กู้คืน instrumentation ที่เคยมีได้ไหม มีเฉลยอัตโนมัติ) และ E1b (semantic evidence gap: ตรวจด้วยคน 1–2 กรณีตามเกณฑ์สี่ข้อในเอกสาร System Design) เพราะ event ที่คนไม่เคยเขียนไม่มีอยู่ในเฉลยแบบ strip-and-restore
- [x] ใช้ SPL1.1 เฉพาะ diagnostic query ที่มี binary partition ที่มีเหตุผลรองรับ และไม่อ้างการรับประกันการตัดสมมติฐานกับ human intent ที่มีหลายสาเหตุซ้อนกัน
- [x] Contradiction rule ผูกกับนิยามสมมติฐานที่ทีมเขียน ไม่ใช่กับ ID ที่ LLM สร้าง
- [x] เพิ่มตัวเลือก "Not sure who is asking" ใน probe และข้อจำกัดของ mock wallet เรื่องแหล่งที่มาของ UI
- [x] Report แยก coverage, nonresponse และ generalization

## Sources

- [Tao et al., Can Large Language Models Generate Observability-Aware Code? (arXiv 2607.05785)](https://arxiv.org/pdf/2607.05785v1)
- [Rodler, On Active Learning Strategies for Sequential Diagnosis (DX'17)](https://easychair.org/publications/paper/zHgj/open)
- [Baxter, ESM Versus Logs: Filling in the Gaps](https://research.google/pubs/esm-versus-logs-filling-in-the-gaps/)
- [Harbach & Johnson, Who am I Talking to? (CHI 2026)](https://research.google/pubs/who-am-i-talking-to-a-large-scale-measurement-of-surface-attribution-across-real-world-security-and-privacy-interfaces/)
- [Bethlehem, Selection Bias in Web Surveys (UvA repository)](https://dare.uva.nl/id/73f3f091-40be-41b4-8f0a-debd8c5b4259)
- [Borlund, The IIR evaluation model (Information Research 8(3))](https://informationr.net/ir/8-3/paper152.html)
