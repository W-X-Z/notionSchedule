# Notion 챗봇

내부 관리용 Notion 데이터 기반 AI 챗봇 웹사이트입니다.

## 주요 기능

- 🤖 **AI 챗봇**: OpenAI API를 활용한 지능형 챗봇
- 📋 **Notion 연동**: Notion 데이터베이스에서 정보를 가져와 답변에 활용
- ⚙️ **설정 관리**: API 키, 모델, 프롬프트 등을 웹 인터페이스에서 관리
- 💾 **로컬 스토리지**: 민감한 정보를 브라우저 로컬 스토리지에 안전하게 저장
- 🔄 **실시간 업데이트**: 최신 Notion 데이터를 실시간으로 동기화

## 기술 스택

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **APIs**: Notion API, OpenAI API
- **Deployment**: Vercel

## 페이지 구성

### 메인 페이지 (`/`)
- 심플한 챗봇 UI
- 기본 질문 선택지 3개 제공
- 실시간 채팅 인터페이스
- 대화 내역 관리

### 설정 페이지 (`/settings`)
- Notion API 키 및 데이터베이스 ID 설정
- OpenAI API 키 및 모델 선택
- 시스템 프롬프트 커스터마이징
- DB 업데이트 버튼 (Notion 데이터 동기화)

## 시작하기

### 1. 프로젝트 설치

```bash
npm install
```

### 2. 애플리케이션 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)으로 접속합니다.

### 3. 설정 구성

1. 우측 상단의 톱니바퀴 아이콘을 클릭하여 설정 페이지로 이동
2. 필요한 API 키와 설정을 입력:
   - **Notion API 키**: Notion 통합에서 발급받은 API 키
   - **데이터베이스 ID**: 연동할 Notion 데이터베이스 ID
   - **OpenAI API 키**: OpenAI에서 발급받은 API 키
   - **모델**: 사용할 OpenAI 모델 선택
   - **시스템 프롬프트**: AI 응답 스타일 설정
3. 설정 저장 후 "DB 업데이트" 버튼을 클릭하여 Notion 데이터 동기화

## API 키 발급 방법

### Notion API 키
1. [Notion Developers](https://developers.notion.com/)에서 새 통합 생성
2. API 키 복사
3. 데이터베이스를 통합에 연결

### OpenAI API 키
1. [OpenAI Platform](https://platform.openai.com/)에서 API 키 생성
2. 적절한 사용량 제한 설정

## 배포

### Vercel 배포
1. Vercel 계정 생성
2. GitHub 레포지토리 연결
3. 자동 배포 설정

```bash
# 또는 Vercel CLI 사용
npm i -g vercel
vercel
```

## 주의사항

- 모든 API 키는 로컬 스토리지에 저장되므로 브라우저를 청소하면 재설정이 필요합니다
- 내부 관리용으로 설계되었으므로 공개 배포 시 보안에 주의하세요
- API 사용량에 따른 요금이 발생할 수 있습니다

## 라이선스

MIT License
