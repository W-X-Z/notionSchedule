import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';

export async function POST(request: NextRequest) {
  let apiKey: string = '';
  let databaseId: string = '';
  
  try {
    const body = await request.json();
    ({ apiKey, databaseId } = body);

    if (!apiKey || !databaseId) {
      return NextResponse.json(
        { error: 'API 키와 데이터베이스 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // Notion 클라이언트 초기화
    const notion = new Client({
      auth: apiKey,
    });

    // 데이터베이스 쿼리 실행
    let allResults: any[] = [];
    let hasMore = true;
    let nextCursor: string | undefined = undefined;

    while (hasMore) {
      const response = await notion.databases.query({
        database_id: databaseId,
        start_cursor: nextCursor,
        page_size: 100,
        // 정렬 옵션 제거 (데이터베이스에 없는 속성으로 인한 오류 방지)
      });

      allResults = allResults.concat(response.results);
      hasMore = response.has_more;
      nextCursor = response.next_cursor || undefined;
    }

    // 페이지 내용 추출
    const extractedData = await Promise.all(
      allResults.map(async (page: any) => {
        try {
          // 페이지 내용 가져오기
          const pageContent = await notion.blocks.children.list({
            block_id: page.id,
          });

          // 페이지 제목 추출
          const title = extractTitle(page.properties);
          
          // 페이지 내용 텍스트 추출
          const content = extractContentFromBlocks(pageContent.results);
          
          // 페이지 속성 추출
          const properties = extractProperties(page.properties);

          return {
            id: page.id,
            title,
            content,
            properties,
            url: page.url,
            createdTime: page.created_time,
            lastEditedTime: page.last_edited_time,
          };
        } catch (error) {
          console.error(`Error processing page ${page.id}:`, error);
          return {
            id: page.id,
            title: 'Error loading page',
            content: '',
            properties: {},
            url: page.url,
            createdTime: page.created_time,
            lastEditedTime: page.last_edited_time,
          };
        }
      })
    );

    // 데이터 정리 및 텍스트 형태로 변환
    const formattedData = extractedData
      .map((item) => {
        let text = `제목: ${item.title}\n`;
        
        // 속성 추가
        if (Object.keys(item.properties).length > 0) {
          text += '속성:\n';
          Object.entries(item.properties).forEach(([key, value]) => {
            text += `- ${key}: ${value}\n`;
          });
        }
        
        // 내용 추가
        if (item.content) {
          text += `내용:\n${item.content}\n`;
        }
        
        // 날짜 정보를 더 명확하게 표시
        text += `생성일: ${new Date(item.createdTime).toLocaleString('ko-KR')}\n`;
        text += `마지막 수정: ${new Date(item.lastEditedTime).toLocaleString('ko-KR')}\n`;
        
        // ISO 날짜도 포함 (정확한 비교를 위해)
        text += `생성일(ISO): ${item.createdTime}\n`;
        text += `마지막 수정(ISO): ${item.lastEditedTime}\n`;
        text += '---\n';
        
        return text;
      })
      .join('\n');

    return NextResponse.json({
      success: true,
      count: extractedData.length,
      data: formattedData,
    });
  } catch (error) {
    console.error('Notion API error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'undefined',
      databaseId: databaseId || 'undefined'
    });
    
    return NextResponse.json(
      { 
        error: 'Notion 데이터를 가져오는 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

// 페이지 제목 추출
function extractTitle(properties: any): string {
  for (const [key, value] of Object.entries(properties)) {
    if ((value as any).type === 'title' && (value as any).title) {
      return (value as any).title
        .map((text: any) => text.plain_text)
        .join('');
    }
  }
  return 'Untitled';
}

// 페이지 속성 추출
function extractProperties(properties: any): Record<string, string> {
  const extracted: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(properties)) {
    const prop = value as any;
    
    switch (prop.type) {
      case 'rich_text':
        if (prop.rich_text && prop.rich_text.length > 0) {
          extracted[key] = prop.rich_text
            .map((text: any) => text.plain_text)
            .join('');
        }
        break;
      case 'number':
        if (prop.number !== null) {
          extracted[key] = prop.number.toString();
        }
        break;
      case 'select':
        if (prop.select && prop.select.name) {
          extracted[key] = prop.select.name;
        }
        break;
      case 'multi_select':
        if (prop.multi_select && prop.multi_select.length > 0) {
          extracted[key] = prop.multi_select
            .map((item: any) => item.name)
            .join(', ');
        }
        break;
      case 'date':
        if (prop.date && prop.date.start) {
          extracted[key] = prop.date.start;
        }
        break;
      case 'checkbox':
        extracted[key] = prop.checkbox ? '예' : '아니오';
        break;
      case 'url':
        if (prop.url) {
          extracted[key] = prop.url;
        }
        break;
      case 'email':
        if (prop.email) {
          extracted[key] = prop.email;
        }
        break;
      case 'phone_number':
        if (prop.phone_number) {
          extracted[key] = prop.phone_number;
        }
        break;
    }
  }
  
  return extracted;
}

// 블록에서 텍스트 내용 추출
function extractContentFromBlocks(blocks: any[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'paragraph':
          return block.paragraph?.rich_text
            ?.map((text: any) => text.plain_text)
            .join('') || '';
        case 'heading_1':
          return `# ${block.heading_1?.rich_text
            ?.map((text: any) => text.plain_text)
            .join('') || ''}`;
        case 'heading_2':
          return `## ${block.heading_2?.rich_text
            ?.map((text: any) => text.plain_text)
            .join('') || ''}`;
        case 'heading_3':
          return `### ${block.heading_3?.rich_text
            ?.map((text: any) => text.plain_text)
            .join('') || ''}`;
        case 'bulleted_list_item':
          return `• ${block.bulleted_list_item?.rich_text
            ?.map((text: any) => text.plain_text)
            .join('') || ''}`;
        case 'numbered_list_item':
          return `1. ${block.numbered_list_item?.rich_text
            ?.map((text: any) => text.plain_text)
            .join('') || ''}`;
        case 'to_do':
          const checked = block.to_do?.checked ? '[x]' : '[ ]';
          return `${checked} ${block.to_do?.rich_text
            ?.map((text: any) => text.plain_text)
            .join('') || ''}`;
        case 'quote':
          return `> ${block.quote?.rich_text
            ?.map((text: any) => text.plain_text)
            .join('') || ''}`;
        case 'code':
          return `\`\`\`\n${block.code?.rich_text
            ?.map((text: any) => text.plain_text)
            .join('') || ''}\n\`\`\``;
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join('\n');
} 