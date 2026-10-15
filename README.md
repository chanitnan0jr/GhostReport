# GhostReport

GhostReport ช่วยทีม product และ developer สืบหาว่า **ยังขาดหลักฐานอะไรในการอธิบายจุดที่ผู้ใช้หยุดทำงานต่อ** โดยอ่าน source code ประกอบกับ event ที่มีอยู่ เสนอสมมติฐานให้คนตรวจ และถามผู้ใช้เพิ่มเติมแบบข้ามได้ในจังหวะที่เหมาะสม

ผลลัพธ์คือ Report ที่แยกสิ่งที่สังเกตได้ สิ่งที่ผู้ใช้บอก และข้อที่ยังตอบไม่ได้ พร้อมอ้างอิงโค้ดและหลักฐาน ไม่สรุปว่าพบสาเหตุแน่นอนจากคำตอบไม่กี่คน

**สถานะ:** hackathon prototype ของ workflow สมัครทุน DAO พร้อม mock wallet การวิเคราะห์และ rule ปัจจุบันออกแบบสำหรับ wallet onboarding การนำไปใช้กับ workflow อื่นต้องปรับ integration และทบทวน rule เพิ่ม

## เริ่มอ่านและใช้งาน

**[คู่มือภาษาไทย: ภาพรวม แนวคิดจาก Paper และการติดตั้ง](docs/PROJECT_GUIDE.th.md)**

- [ใครใช้ และระบบทำงานอย่างไร](docs/PROJECT_GUIDE.th.md#overview)
- [งานวิจัยที่อยู่เบื้องหลัง และขอบเขตที่อ้างได้](docs/PROJECT_GUIDE.th.md#research)
- [ติดตั้งผ่าน Shell และเปิดเดโม](docs/PROJECT_GUIDE.th.md#quickstart)
- [ตั้ง API key วิเคราะห์ใหม่ และเปิดรับคำตอบ 12 นาที](docs/PROJECT_GUIDE.th.md#live)
- [การกำหนดเวลาและการอ่าน Report](docs/PROJECT_GUIDE.th.md#timing)
- [นำไปใช้กับ repository ของทีม](docs/PROJECT_GUIDE.th.md#integration)

## เส้นทางใช้งาน

1. **ทีมตั้ง investigation:** เชื่อม repo กับ events ให้ AI เสนอ workflow และสมมติฐาน จากนั้นคนตรวจและล็อก baseline v1
2. **ผู้ใช้ลองแอป:** ระบบเก็บ event และเสนอคำถามเพิ่มเติมเฉพาะทางออกที่เข้าเกณฑ์ ผู้ใช้ข้ามได้และออกจากหน้าได้ทันที
3. **ทีมดู Report:** เปรียบเทียบ v1 กับหลักฐานปัจจุบัน ดู coverage, คำตอบ, decision trace และคำแนะนำว่าควรเก็บหลักฐานเพิ่มตรงไหน

Report เปิดดูได้ระหว่างเก็บข้อมูลและ refresh ทุก 3 วินาที เวลา 12 นาทีในตัวอย่างคือช่วงเปิดรับคำตอบ ไม่ใช่เวลาที่ต้องรอก่อนมี Report

## โครงสร้าง

| ส่วน       | หน้าที่                                         | เอกสาร                                                  |
| ---------- | ----------------------------------------------- | ------------------------------------------------------- |
| `landing/` | หน้าเริ่มต้น แจก role card และพาไปดูผล          | [Landing README](landing/README.md)                     |
| `app/`     | แอปขอทุนที่เป็นเป้าหมายการสืบสวน                | [App README](app/README.md)                             |
| `console/` | Report และเครื่องมือสำหรับ operator             | [Console README](console/README.md)                     |
| `engine/`  | อ่านโค้ด เรียก LLM ตรวจหลักฐาน และประกอบ Report | [คู่มือการทำงาน](docs/PROJECT_GUIDE.th.md#architecture) |
| `roles/`   | สุ่มบทบาทใน process และฐานข้อมูลแยกจาก engine   | [ขอบเขตข้อมูล](docs/PROJECT_GUIDE.th.md#privacy)        |

เอกสารออกแบบฉบับเต็ม: [System Design](<GhostReport v5 — System Design.md>) · [Core Paper Review](<GhostReport — Core Paper Review.md>)

## Local URLs

หลังทำตาม Quick Start ให้เข้าผ่าน `http://localhost:5175/` เพื่อให้ทุกหน้ามี origin เดียวกัน:

| URL                   | หน้า                                |
| --------------------- | ----------------------------------- |
| `/`                   | Landing                             |
| `/app/`               | แอปขอทุน                            |
| `/report/`            | Report สาธารณะ                      |
| `/report/?operator=1` | เครื่องมือ operator ต้องกรอก token  |
| `/sandbox/`           | Sandbox: run จำลองของผู้เยี่ยมชมเอง |

### Sandbox

`/sandbox/` สร้าง run จำลองแยกต่อผู้เยี่ยมชม (mode `sandbox`, SQLite ของตัวเอง ไม่ปนกับ judging run และลบเองหลัง 3 ชั่วโมง) แล้วพาเดินครบวงจรในหน้า Segments และ Report:

1. สร้าง traffic ก่อนล็อก: session จำลองเดินตาม flow ของแอปทีละทางแยก ส่ง event ผ่าน ingest ปกติ
2. Investigate: AI เขียนสมมติฐานและคำถามจาก snapshot (Stage B ครั้งเดียว ใช้ Workflow Map ที่เตรียมไว้) หรือใช้ investigation ที่เตรียมไว้โดยไม่เรียก AI
3. Approve and lock v1 และแสดง sha256
4. สร้าง traffic หลังล็อก พร้อมกำหนดคำตอบที่ซ่อนไว้ ทางออกที่เข้าเกณฑ์จะเจอคำถามผ่านโค้ดตรวจ eligibility และ exposure ชุดเดียวกับแอป
5. Reveal เทียบสัดส่วนที่ตั้งไว้กับ "k of n respondents" ใน Report

ทุกหน้าที่เปิด sandbox มีป้าย "Simulation — answers come from the mix you set. This shows the pipeline, not real user insight." เพดาน AI คือ 3 ครั้งต่อ sandbox และ 30 ครั้งรวมทุก sandbox (`GHOST_SANDBOX_LLM_RUNS`) ปิด sandbox ได้ด้วย `engine.demo serve --no-sandbox` โค้ดอยู่ที่ [engine/sandbox.py](engine/sandbox.py) และ [console/src/sandbox/](console/src/sandbox/)

ใช้ Python 3.11+, uv, Node.js 22.13+, npm และ ripgrep ดูคำสั่งติดตั้ง dependency และการตั้งค่า server ใน[คู่มือ](docs/PROJECT_GUIDE.th.md#quickstart) การเปิดเดโมที่เตรียมไว้แล้วไม่ต้องมี LLM API key; การกด Analyze หรือวิเคราะห์ repo ใหม่ต้องมี `DEEPSEEK_API_KEY`
