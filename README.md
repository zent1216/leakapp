# 누수설비 업무관리 앱 v2

단일 HTML 파일로 운영하던 누수설비 업무관리 앱을 React + TypeScript + Vite + Firebase 구조로 재개발한 버전입니다.

## 주요 구조

- 로그인: Firebase Auth
- 업무 데이터: Firestore `jobs`, `clients`, `companies` 컬렉션
- 사진 파일: Firebase Storage
- 사진 메타데이터: Firestore 작업 문서의 `photos` 배열에 URL과 Storage 경로만 저장
- 배포: Firebase Hosting

## 준비물

1. Node.js LTS 설치
2. Firebase 프로젝트 생성
3. Firebase Console에서 Authentication, Firestore Database, Storage, Hosting 활성화
4. Authentication 로그인 제공업체에서 이메일/비밀번호와 Google 로그인 활성화

## 로컬 실행

```bash
npm install
copy .env.example .env
npm run dev
```

Mac 또는 Linux에서는 아래처럼 복사합니다.

```bash
cp .env.example .env
```

`.env` 파일에는 Firebase Console > 프로젝트 설정 > 일반 > 내 앱 > SDK 설정 및 구성 값을 입력합니다.

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

## 빌드 확인

```bash
npm run build
```

빌드가 성공하면 `dist` 폴더가 생성됩니다.

## Firebase 규칙 배포

이 저장소에는 `firestore.rules`, `storage.rules`, `firebase.json`이 포함되어 있습니다.

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules,storage
```

## Firebase Hosting 배포

```bash
npm run build
firebase deploy --only hosting
```

전체 배포는 아래 명령으로 실행할 수 있습니다.

```bash
firebase deploy
```

현재 Firebase 프로젝트는 `leakapp-c603d`로 연결되어 있습니다.

- Firebase Console: https://console.firebase.google.com/project/leakapp-c603d/overview
- 배포된 앱: https://leakapp-c603d.web.app

사진 업로드를 사용하려면 Firebase Console > Storage에서 `Get started`를 눌러 Storage를 먼저 활성화한 뒤 아래 명령으로 Storage 규칙을 배포합니다.

```bash
firebase deploy --only storage --project leakapp-c603d
```

## 현재 포함된 기능

- 작업 등록, 수정, 삭제
- 작업 상태 관리: 진행중, 완료, AS
- 조치 전/후 현장 사진 업로드 및 삭제
- 고객/의뢰처 등록
- 월별 완료 건수, AS 건수, 순매출 요약
- 사업자 정보 저장
- 견적서, 소견서, 보험 제출 서류 PDF 생성

## Firestore 데이터 구조

```txt
jobs/{jobId}
clients/{clientId}
companies/{companyId}
```

각 문서는 `ownerId` 필드로 로그인 사용자의 UID를 저장합니다. 보안 규칙은 본인 데이터만 읽고 쓸 수 있도록 제한합니다.

## Storage 데이터 구조

```txt
users/{uid}/jobs/{jobId}/before/{photoId}.jpg
users/{uid}/jobs/{jobId}/after/{photoId}.jpg
```

사진 파일은 Storage에 저장하고, Firestore에는 아래처럼 참조 정보만 저장합니다.

```ts
{
  id: string;
  url: string;
  storagePath: string;
  group: 'before' | 'after';
  createdAt: number;
}
```

## GitHub 운영 방식

GitHub에는 소스코드만 보관하고, 실제 앱 실행은 Firebase Hosting으로 배포하는 방식을 권장합니다.

```bash
git add .
git commit -m "rebuild leakapp v2"
git push
```
