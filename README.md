# Humanoid × MBTI

세미나 "Why humanoids need agentic vision"에서 QR로 접속해 쓰는 모바일 페이지입니다.

- `index.html`: 청중용 페이지 (MBTI 선택 또는 5문항 퀴즈 → 연구 분야, 논문, 정반대 유형 보완)
- `live.html`: 발표 화면용 페이지 (QR 코드, 실시간 유형 분포, 축별 비율, 정반대 짝 수)

## 1. Firebase 설정 (현장 통계용, 약 5분)

1. https://console.firebase.google.com 에서 **프로젝트 추가**를 누릅니다. Google Analytics는 꺼도 됩니다.
2. 왼쪽 메뉴 **빌드 → Realtime Database → 데이터베이스 만들기**를 누릅니다. 위치는 아무거나 고르고 **잠금 모드**로 시작합니다.
3. **규칙** 탭에 `database.rules.json` 내용을 붙여 넣고 **게시**합니다.
4. **프로젝트 설정(톱니바퀴) → 내 앱 → 웹(</>)**으로 앱을 추가합니다. 나오는 `firebaseConfig` 값을 `js/firebase-config.js`에 붙여 넣습니다. `databaseURL` 값이 꼭 들어 있어야 합니다.

`apiKey`는 웹에 공개되어도 괜찮은 값입니다. 실제 보안은 3번에서 넣은 규칙이 담당합니다. 규칙은 MBTI 4글자만 저장되도록 막아 두었습니다.

## 1-1. 관리자 계정 (집계 초기화용)

1. Firebase 콘솔 **빌드 → Authentication → 시작하기 → 로그인 방법**에서 **이메일/비밀번호**를 사용 설정합니다.
2. **Users 탭 → 사용자 추가**를 누릅니다. 이메일은 `admin@humanoid-mbti.firebaseapp.com`, 비밀번호는 원하는 값으로 정합니다.
3. Realtime Database **규칙** 탭에 최신 `database.rules.json`을 다시 붙여 넣고 **게시**합니다. 이 규칙은 관리자 계정만 응답을 지울 수 있게 합니다.
4. (선택) Authentication **설정 → 사용자 작업**에서 "생성(가입) 사용 설정"을 끄면, 다른 사람이 계정을 새로 만들 수 없게 됩니다.

관리자 페이지 주소는 `.../humanoid-mbti/admin.html`입니다. 사이트 어디에도 링크되어 있지 않습니다.

## 2. GitHub Pages로 배포

```bash
cd humanoid-mbti
git init && git add . && git commit -m "Humanoid MBTI site"
gh repo create humanoid-mbti --public --source=. --push
gh api -X POST repos/{owner}/humanoid-mbti/pages -f "source[branch]=main" -f "source[path]=/"
```

1~2분 뒤 `https://<GitHub아이디>.github.io/humanoid-mbti/` 주소로 접속할 수 있습니다.

## 3. 발표 당일

- **리허설**: `live.html?demo`를 열면 가짜 데이터로 화면을 미리 볼 수 있습니다.
- **발표 직전 초기화**: `admin.html`에서 관리자 비밀번호로 로그인한 뒤 **집계 초기화**를 누릅니다. Firebase 콘솔의 Realtime Database에서 `votes` 항목을 직접 지워도 됩니다.
- **발표 중**: `live.html`을 화면에 띄웁니다. QR 코드는 사이트 주소로 자동 생성됩니다. 다른 주소를 쓰려면 `live.html?url=https://...`처럼 붙입니다.
- 같은 기기에서 다시 응답하면 이전 응답을 덮어써서 중복으로 세지 않습니다. "다른 유형 구경하기"로 둘러본 결과는 집계되지 않습니다.

## 논문 목록 수정

`papers/group*.json`을 고친 뒤 아래를 실행합니다. 빠진 항목이나 중복 논문이 있으면 오류를 알려 줍니다.

```bash
python3 tools/build_papers.py
```

## 로컬에서 보기

```bash
python3 -m http.server 8931
# http://localhost:8931
```
