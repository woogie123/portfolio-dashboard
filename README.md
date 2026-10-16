# 2호 펀드 회수관리 Dashboard

포트폴리오 회사 현황을 입력·조회하는 정적 웹페이지입니다.
화면은 GitHub Pages, 로그인과 데이터는 Supabase(이메일/비밀번호 + RLS)를 사용합니다.

```
index.html / styles.css / app.js   화면 (빌드 불필요)
config.js                          Supabase URL, anon 키
supabase/schema.sql                테이블, 권한(RLS) 설정 SQL
```

`config.js`가 비어 있으면 저장되지 않는 **데모 모드**로 열립니다.

## 1. Supabase 설정 (최초 1회)

1. https://supabase.com 에서 프로젝트 생성 (Region: Northeast Asia (Seoul) 권장)
2. **Authentication > Sign In / Providers > Email**
   - **Allow new users to sign up: 끄기** (관리자가 만든 계정만 로그인)
   - 필요하면 Confirm email 설정도 확인
3. **Authentication > Users > Add user** 로 사용자 계정 생성 (이메일/비밀번호, Auto Confirm 체크)
4. **SQL Editor** 에 `supabase/schema.sql` 전체를 붙여넣고 Run
5. 본인 계정을 편집자로 승격: schema.sql 맨 아래 주석의 `update public.profiles ...` 문을 이메일을 바꿔 실행
   - 새 계정은 기본이 `viewer`(조회만)입니다. 편집이 필요한 사람만 `editor` 로 바꾸세요.
6. **Project Settings > API** 에서 `Project URL` 과 `anon public` 키를 `config.js` 에 입력
   - **`service_role` 키는 절대 넣지 마세요.**

## 2. 로컬에서 확인

`index.html` 을 더블클릭하면 일부 브라우저에서 스크립트가 제한될 수 있으니, 간단한 로컬 서버를 쓰세요.
(Python 또는 Node 설치 시) `python -m http.server 8000` → http://localhost:8000

## 3. GitHub Pages 배포

1. GitHub에서 새 저장소 생성 (실데이터는 올리지 않습니다. 코드만 올립니다)
2. 이 폴더에서:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<계정>/<저장소>.git
   git push -u origin main
   ```
3. 저장소 **Settings > Pages > Build and deployment**: Source = `Deploy from a branch`, Branch = `main` / `(root)`
4. 잠시 후 `https://<계정>.github.io/<저장소>/` 로 접속

## 4. 보안 점검 체크리스트

- [ ] Supabase 회원가입(Sign up) 비활성화
- [ ] 세 테이블 모두 RLS 활성화 (schema.sql이 처리)
- [ ] 비로그인 상태(시크릿 창)에서 데이터가 보이지 않음
- [ ] viewer 계정으로 로그인해 수정·추가 버튼이 막혀 있고, DB에도 쓰기가 거부됨
- [ ] 저장소에 `service_role` 키, 실데이터, CSV가 없음
- [ ] 비밀번호는 길고 고유하게, 가능하면 Supabase MFA 활성화

## 참고

- 금액 단위는 억원입니다. MOIC = 보유지분 평가액 / 투자금액.
- 데이터 백업: 화면의 "CSV 내보내기" 또는 Supabase 대시보드의 백업 기능을 이용하세요.
- 검색엔진 노출 방지용 `noindex` 메타가 들어 있지만, 접근 제어는 Supabase 로그인이 담당합니다.
