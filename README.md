# SEOUL BITES PH — 포스기 없는 다지점(학교·로드샵) POS · 키오스크 · 횡령방지 시스템

필리핀 분식(오뎅·컵밥·라면·떡볶이·음료) 다지점 운영을 위해 **전용 POS/키오스크 기계 없이 일반 태블릿·스마트폰만으로 매장을 돌리는** 통합 시스템입니다.

---

## 📱 태블릿에서 주소만 쳐서 바로 여는 2가지 방법

### 방법 1. GitHub Pages로 바로 열기 (서버비 0원 · 단일 태블릿 / 체험용)
* 저장소의 `docs/index.html`이 GitHub Pages 정적 웹앱으로 포함되어 있습니다.
* GitHub 저장소 **Settings → Pages → Source: `Deploy from a branch` (`main` / `/docs`)** 로 켜두면 태블릿 브라우저에 `https://<아이디>.github.io/<저장소명>/` 주소만 입력해 즉시 열 수 있습니다.
* ✅ **장점:** 서버 비용 0원, 인터넷만 열리면 태블릿 1대만 쓰는 학교 부스에서 즉시 입력·거스름돈 계산·마감·안내문 인쇄 가능 (`localStorage` 자동 저장).
* ⚠️ **한계:** 정적 페이지이므로 **손님 태블릿 ↔ 주방 태블릿 ↔ 사장님 폰** 간 실시간 원격 동기화는 되지 않습니다.

### 방법 2. 실시간 다기기 · 다지점 클라우드 서버 연동 (추천 · 실전용)
* **손님 키오스크/테이블 QR → 주방 KDS(띵동 알림) → 블라인드 마감 → 사장님 폰 실시간 적발**을 모두 연결하려면 Node.js 백엔드([server.js](server.js))를 실행해야 합니다.
* 외부 패키지(`npm install`) 없이 Node.js 22.5+ 내장 SQLite(`node:sqlite`)로 동작합니다.
* **클라우드 배포 (Railway / Render / Fly.io):** 이 GitHub 저장소를 연결하면 바로 온라인 URL(`https://내매장.up.railway.app` 등)이 발급되어 어느 분점 태블릿·사장님 폰에서도 주소만 치고 접속할 수 있습니다. ([render.yaml](render.yaml), [Dockerfile](Dockerfile) 포함)
* **매장 로컬 실행:**
  ```bash
  node server.js
  ```

---

## 주요 기능

1. **⚡ 학교분점 직원 초고속 2-Tap POS (`/?mode=pos`)**
   - 10:30 쉬는시간 30분 러시용 `₱50 / ₱100 / ₱150 / ₱200` 원클릭 콤보
   - `딱맞게 / ₱100 / ₱200 / ₱500` 거스름돈(`₱50×N장`) 즉시 계산
   - 단골 식권(펀치카드 `₱200` 4칸 / `₱500` 10칸) 발급·1초 차감
2. **📱 로드샵 셀프 키오스크 & 테이블 QR (`/?mode=kiosk&table=T1`)**
   - `EN+한 / English / 한국어 / Taglish` 4개 언어 전환 + PIN(`7777`) 화면 잠금
   - PayMongo Dynamic QR Ph 웹훅 자동입금 연동
3. **🍳 주방 & 픽업 KDS + 58mm 주문표 (`/?mode=kitchen`)**
   - 미결제 주문 조리 금지, 직원 임의 삭제 불가(사장님 PIN 취소 승인 요청)
   - BIR EOPT Act 준수 `ORDER SLIP ONLY — NOT AN OFFICIAL BIR INVOICE` 및 `₱500+` 수기 SI 알림
4. **🔒 알바생 블라인드 마감 & 📊 사장님 다지점 감시 (`/?mode=closeout`, `/?mode=admin`)**
   - 예상 매출·재고 비공개 마감 → 현금 과부족(Over/Short) & 1:1 꼬치/용기 오차 적발
   - 다지점 합산 BIR `₱3,000,000` VAT 한도 게이지 + 텔레그램 실시간 알림 + CSV 다운로드
5. **🖨️ 돈통 · 카운터 안내문 스튜디오 (`/?mode=signage`)**
   - 필리핀 중앙은행(BSP) 규정 준수 영문·따갈로그 **"구겨진 지폐 펴서 넣기"** 안내문 및 QR 인쇄

자세한 세팅 안내는 [SETUP_GUIDE.md](SETUP_GUIDE.md)를 참고하세요.
