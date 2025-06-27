import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { RAGSystem } from '@/lib/rag';

// 간단한 타입 정의
interface SimpleNotionProperty {
  type: string;
  title?: Array<{ plain_text: string }>;
  rich_text?: Array<{ plain_text: string }>;
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== Chat API 호출 시작 ===');
    const body = await request.json();
    const { message, notionData, useRAG = true } = body;
    
    console.log('받은 메시지:', message);
    console.log('Notion 데이터 길이:', notionData?.length || 0);
    console.log('RAG 사용 여부:', useRAG);

    if (!message) {
      console.log('ERROR: 메시지가 없음');
      return NextResponse.json(
        { error: '메시지가 필요합니다.' },
        { status: 400 }
      );
    }

    // 클라이언트에서 전송된 설정 정보 확인
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      console.log('ERROR: Authorization 헤더가 없음');
      return NextResponse.json(
        { error: '인증 정보가 필요합니다.' },
        { status: 401 }
      );
    }

    // Authorization 헤더에서 설정 정보 추출 (Base64 디코딩)
    console.log('Authorization 헤더 디코딩 시작');
    const encodedSettings = authHeader.replace('Bearer ', '');
    console.log('인코딩된 설정 길이:', encodedSettings.length);
    
    const decodedSettings = atob(encodedSettings);
    console.log('Base64 디코딩 완료, 길이:', decodedSettings.length);
    
    const finalSettings = decodeURIComponent(decodedSettings);
    console.log('URI 디코딩 완료, 길이:', finalSettings.length);
    
    const settings = JSON.parse(finalSettings);
    console.log('설정 파싱 완료:', Object.keys(settings));
    
    const { openaiApiKey, openaiModel, systemPrompt } = settings;

    if (!openaiApiKey) {
      console.log('ERROR: OpenAI API 키가 없음');
      return NextResponse.json(
        { error: 'OpenAI API 키가 설정되지 않았습니다.' },
        { status: 400 }
      );
    }

    console.log('OpenAI API 키 확인 완료');
    console.log('사용할 모델:', openaiModel || 'gpt-4o-mini');

    // OpenAI 클라이언트 초기화
    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    let contextData = '';
    let searchInfo = '';
    let ragSuccess = false;

    // RAG 시스템 사용 시도
    if (useRAG && settings.notionApiKey && settings.notionDatabaseId) {
      try {
        console.log('RAG 시스템 초기화 중...');
        const ragSystem = new RAGSystem();
        ragSystem.initializeOpenAI(openaiApiKey);
        
        // 서버리스 환경에서는 실시간으로 RAG 시스템 구축
        console.log('노션 데이터를 가져와서 RAG 시스템 구축 중...');
        
        // initialize-rag API와 동일한 로직으로 노션 데이터 가져오기
        const { Client } = await import('@notionhq/client');
        const notion = new Client({
          auth: settings.notionApiKey,
        });

        // 데이터베이스 쿼리 실행
        let allResults: unknown[] = [];
        let hasMore = true;
        let nextCursor: string | undefined = undefined;

        while (hasMore) {
          const response = await notion.databases.query({
            database_id: settings.notionDatabaseId,
            start_cursor: nextCursor,
            page_size: 100,
          });

          allResults = allResults.concat(response.results);
          hasMore = response.has_more;
          nextCursor = response.next_cursor || undefined;
        }

        if (allResults.length === 0) {
          throw new Error('노션 데이터베이스가 비어있습니다.');
        }

        // 간단한 텍스트 추출
        const extractSimpleText = (page: unknown): string => {
          const pageObj = page as Record<string, unknown>;
          const properties = pageObj.properties as Record<string, unknown>;
          
          let text = '';
          
          // 제목 추출
          for (const [, value] of Object.entries(properties)) {
            const prop = value as SimpleNotionProperty;
            if (prop.type === 'title' && prop.title) {
              const title = prop.title.map((t) => t.plain_text).join('');
              text += `제목: ${title}\n`;
              break;
            }
          }
          
          // 기본 속성들 추출
          for (const [key, value] of Object.entries(properties)) {
            const prop = value as SimpleNotionProperty;
            if (prop.type === 'rich_text' && prop.rich_text && prop.rich_text.length > 0) {
              const content = prop.rich_text.map((t) => t.plain_text).join('');
              if (content) {
                text += `${key}: ${content}\n`;
              }
            }
          }
          
          text += `생성일: ${new Date(pageObj.created_time as string).toLocaleString('ko-KR')}\n`;
          text += `마지막 수정: ${new Date(pageObj.last_edited_time as string).toLocaleString('ko-KR')}\n`;
          text += '---\n';
          
          return text;
        };

        const notionData = allResults.map(extractSimpleText).join('\n');
        
        // RAG용 객체 배열로 변환
        const notionPages = [{
          id: 'notion-data',
          properties: {
            title: {
              title: [{ plain_text: '노션 데이터베이스' }]
            }
          },
          content: notionData,
          last_edited_time: new Date().toISOString(),
          url: `https://notion.so/${settings.notionDatabaseId}`
        }];
        
        // 노션 데이터를 청크로 분할
        const chunks = await ragSystem.processNotionData(notionPages);
        console.log(`${chunks.length}개의 청크를 생성했습니다.`);
        
        // 임베딩 생성
        await ragSystem.generateEmbeddings();
        console.log('임베딩 생성 완료');
        
        // 관련 정보 검색
        const searchResults = await ragSystem.searchSimilarChunks(message, 5);
        contextData = ragSystem.formatSearchResults(searchResults);
        searchInfo = `RAG 검색: ${searchResults.length}개 관련 문서 발견 (평균 유사도: ${(searchResults.reduce((sum, r) => sum + r.score, 0) / searchResults.length * 100).toFixed(1)}%)`;
        ragSuccess = true;
        
        console.log('RAG 검색 완료:', searchInfo);
        console.log('컨텍스트 데이터 길이:', contextData.length);
        
      } catch (ragError) {
        console.warn('RAG 시스템 사용 실패, 기존 방식으로 전환:', ragError);
        ragSuccess = false;
      }
    }

    // RAG 실패 또는 비활성화 시 기존 데이터 사용
    if (!ragSuccess) {
      if (!notionData || notionData.trim() === '') {
        console.log('WARNING: Notion 데이터가 비어있음');
        contextData = '사용 가능한 데이터가 없습니다.';
      } else {
        contextData = notionData;
        console.log('기존 Notion 데이터 사용, 샘플 (첫 100자):', notionData.substring(0, 100) + '...');
      }
      searchInfo = '전체 데이터베이스 검색';
    }

    // 시스템 메시지 구성
    const baseSystemPrompt = systemPrompt || '당신은 도움이 되는 AI 어시스턴트입니다.';
    
    const systemMessage = ragSuccess 
      ? `${baseSystemPrompt}

사용자의 질문과 관련하여 다음 정보를 검색했습니다:

${contextData}

위 검색된 정보를 주로 참고하여 사용자의 질문에 정확하고 도움이 되는 답변을 제공해주세요.
검색된 정보와 관련이 없는 질문이라면, 관련 정보를 찾을 수 없다고 명확히 말씀해주세요.
답변할 때는 어떤 문서나 정보를 참고했는지 언급해주세요.

**중요**: 날짜 관련 질문에 답할 때는 다음 사항을 반드시 고려하세요:
- 모든 관련 항목의 날짜를 정확히 확인하고 비교하세요
- 날짜 형식을 올바르게 해석하세요 (YYYY-MM-DD)
- 프로젝트 완료/마무리를 묻는 질문에서는 End Date, 완료일, 종료일 등의 속성을 우선 확인하세요
- 답변하기 전에 관련된 모든 데이터를 검토하고 가장 정확한 정보를 제공하세요`
      : `${baseSystemPrompt}

다음은 Notion 데이터베이스의 내용입니다:
${contextData}

위 정보를 바탕으로 사용자의 질문에 답변해주세요.

**중요**: 날짜 관련 질문에 답할 때는 다음 사항을 반드시 고려하세요:
- 모든 관련 항목의 날짜를 정확히 확인하고 비교하세요
- 날짜 형식을 올바르게 해석하세요 (YYYY-MM-DD)
- 프로젝트 완료/마무리를 묻는 질문에서는 End Date, 완료일, 종료일 등의 속성을 우선 확인하세요
- 답변하기 전에 관련된 모든 데이터를 검토하고 가장 정확한 정보를 제공하세요`;

    console.log('시스템 메시지 길이:', systemMessage.length);
    console.log('검색 정보:', searchInfo);

    // OpenAI API 호출
    console.log('OpenAI API 호출 시작...');
    const completion = await openai.chat.completions.create({
      model: openaiModel || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemMessage,
        },
        {
          role: 'user',
          content: message,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    console.log('OpenAI API 응답 받음');
    console.log('응답 선택지 수:', completion.choices?.length || 0);
    
    const response = completion.choices[0]?.message?.content || '응답을 생성할 수 없습니다.';
    console.log('최종 응답 길이:', response.length);
    console.log('최종 응답 샘플:', response.substring(0, 100) + (response.length > 100 ? '...' : ''));

    return NextResponse.json({ 
      message: response,
      searchInfo,
      ragUsed: ragSuccess,
      contextLength: contextData.length
    });
  } catch (error) {
    console.error('=== Chat API 오류 발생 ===');
    console.error('오류 타입:', error?.constructor?.name);
    console.error('오류 메시지:', error instanceof Error ? error.message : String(error));
    console.error('오류 스택:', error instanceof Error ? error.stack : 'No stack trace');
    
    // OpenAI API 오류인 경우 더 자세한 정보
    if (error && typeof error === 'object' && 'response' in error) {
      console.error('OpenAI API 응답 상태:', (error as any).response?.status); // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error('OpenAI API 응답 데이터:', (error as any).response?.data); // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 