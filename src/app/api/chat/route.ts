import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(request: NextRequest) {
  try {
    console.log('=== Chat API 호출 시작 ===');
    const body = await request.json();
    const { message, notionData } = body;
    
    console.log('받은 메시지:', message);
    console.log('Notion 데이터 길이:', notionData?.length || 0);

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

    // Notion 데이터 확인
    if (!notionData || notionData.trim() === '') {
      console.log('WARNING: Notion 데이터가 비어있음');
    } else {
      console.log('Notion 데이터 샘플 (첫 100자):', notionData.substring(0, 100) + '...');
    }

    // 시스템 메시지 구성
    const systemMessage = `${systemPrompt || '당신은 도움이 되는 AI 어시스턴트입니다.'}

다음은 Notion 데이터베이스의 내용입니다:
${notionData}

위 정보를 바탕으로 사용자의 질문에 답변해주세요.

**중요**: 날짜 관련 질문에 답할 때는 다음 사항을 반드시 고려하세요:
- 모든 관련 항목의 날짜를 정확히 확인하고 비교하세요
- 날짜 형식을 올바르게 해석하세요 (YYYY-MM-DD)
- 프로젝트 완료/마무리를 묻는 질문에서는 End Date, 완료일, 종료일 등의 속성을 우선 확인하세요
- 답변하기 전에 관련된 모든 데이터를 검토하고 가장 정확한 정보를 제공하세요`;

    console.log('시스템 메시지 길이:', systemMessage.length);
    console.log('시스템 프롬프트:', systemPrompt || '기본 프롬프트 사용');

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

    return NextResponse.json({ message: response });
  } catch (error) {
    console.error('=== Chat API 오류 발생 ===');
    console.error('오류 타입:', error?.constructor?.name);
    console.error('오류 메시지:', error instanceof Error ? error.message : String(error));
    console.error('오류 스택:', error instanceof Error ? error.stack : 'No stack trace');
    
    // OpenAI API 오류인 경우 더 자세한 정보
    if (error && typeof error === 'object' && 'response' in error) {
      console.error('OpenAI API 응답 상태:', (error as any).response?.status);
      console.error('OpenAI API 응답 데이터:', (error as any).response?.data);
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 