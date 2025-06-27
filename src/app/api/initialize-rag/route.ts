import { NextResponse } from 'next/server';
import { RAGSystem } from '@/lib/rag';

export async function POST() {
  try {
    console.log('RAG 시스템 초기화 시작...');
    
    const ragSystem = new RAGSystem();
    
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
    
    // 노션 데이터 가져오기
    const notionResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/update-notion-data`, {
      method: 'POST',
    });
    
    if (!notionResponse.ok) {
      throw new Error('노션 데이터를 가져올 수 없습니다.');
    }
    
    const { data: notionData } = await notionResponse.json();
    
    if (!notionData || notionData.length === 0) {
      throw new Error('노션 데이터가 비어있습니다.');
    }
    
    console.log(`${notionData.length}개의 노션 페이지를 처리 중...`);
    
    // 노션 데이터를 청크로 분할
    const chunks = await ragSystem.processNotionData(notionData);
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