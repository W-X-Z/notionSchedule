import { NextRequest, NextResponse } from 'next/server';
import { RAGSystem } from '@/lib/rag';
import { Client } from '@notionhq/client';

export async function POST(request: NextRequest) {
  try {
    console.log('RAG 시스템 초기화 시작...');
    
    const body = await request.json();
    const { openaiApiKey, notionApiKey, notionDatabaseId } = body;

    if (!openaiApiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'OpenAI API 키가 필요합니다.',
        },
        { status: 400 }
      );
    }

    if (!notionApiKey || !notionDatabaseId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Notion API 키와 데이터베이스 ID가 필요합니다.',
        },
        { status: 400 }
      );
    }
    
    const ragSystem = new RAGSystem();
    ragSystem.initializeOpenAI(openaiApiKey);
    
    // 기존 데이터가 있는지 확인
    const hasExistingData = await ragSystem.loadFromLocalStorage();
    
    if (hasExistingData) {
      const status = ragSystem.getStatus();
      return NextResponse.json({
        success: true,
        message: '기존 RAG 데이터를 로드했습니다.',
        status,
      });
    }
    
    // 노션 데이터 직접 가져오기 (내부 API 호출 대신)
    console.log('노션 데이터를 가져오는 중...');
    const notion = new Client({
      auth: notionApiKey,
    });

    // 데이터베이스 쿼리 실행
    let allResults: unknown[] = [];
    let hasMore = true;
    let nextCursor: string | undefined = undefined;

    while (hasMore) {
      const response = await notion.databases.query({
        database_id: notionDatabaseId,
        start_cursor: nextCursor,
        page_size: 100,
      });

      allResults = allResults.concat(response.results);
      hasMore = response.has_more;
      nextCursor = response.next_cursor || undefined;
    }

    // 간단한 텍스트 추출 함수
    const extractSimpleText = (page: unknown): string => {
      const pageObj = page as Record<string, unknown>;
      const properties = pageObj.properties as Record<string, unknown>;
      
      let text = '';
      
      // 제목 추출
      for (const [, value] of Object.entries(properties)) {
        const prop = value as any;
        if (prop.type === 'title' && prop.title) {
          const title = prop.title.map((t: any) => t.plain_text).join('');
          text += `제목: ${title}\n`;
          break;
        }
      }
      
      // 기본 속성들 추출
      for (const [key, value] of Object.entries(properties)) {
        const prop = value as any;
        if (prop.type === 'rich_text' && prop.rich_text?.length > 0) {
          const content = prop.rich_text.map((t: any) => t.plain_text).join('');
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
    
    if (!notionData.trim()) {
      throw new Error('노션 데이터가 비어있습니다.');
    }
    
    console.log(`노션 데이터를 처리 중... (${allResults.length}개 항목)`);
    
    // 노션 API에서 받은 텍스트 데이터를 RAG용 객체 배열로 변환
    const notionPages = [{
      id: 'notion-data',
      properties: {
        title: {
          title: [{ plain_text: '노션 데이터베이스' }]
        }
      },
      content: notionData,
      last_edited_time: new Date().toISOString(),
      url: `https://notion.so/${notionDatabaseId}`
    }];
    
    // 노션 데이터를 청크로 분할
    const chunks = await ragSystem.processNotionData(notionPages);
    console.log(`${chunks.length}개의 청크를 생성했습니다.`);
    
    // 임베딩 생성
    await ragSystem.generateEmbeddings();
    console.log('임베딩 생성 완료');
    
    // 로컬 스토리지에 저장
    await ragSystem.saveToLocalStorage();
    console.log('RAG 데이터 저장 완료');
    
    const status = ragSystem.getStatus();
    
    return NextResponse.json({
      success: true,
      message: 'RAG 시스템이 성공적으로 초기화되었습니다.',
      status,
    });
    
  } catch (error) {
    console.error('RAG 초기화 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const ragSystem = new RAGSystem();
    await ragSystem.loadFromLocalStorage();
    const status = ragSystem.getStatus();
    
    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error('RAG 상태 확인 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
} 