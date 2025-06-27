import OpenAI from 'openai';

export interface DocumentChunk {
  id: string;
  content: string;
  metadata: {
    title: string;
    pageId: string;
    lastModified: string;
    url?: string;
    properties?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    chunkIndex?: number;
    totalChunks?: number;
  };
  embedding?: number[];
}

export interface SearchResult {
  chunk: DocumentChunk;
  score: number;
}

export class RAGSystem {
  private chunks: DocumentChunk[] = [];
  private embeddings: Map<string, number[]> = new Map();
  private openai: OpenAI | null = null;

  /**
   * OpenAI 클라이언트 초기화
   */
  initializeOpenAI(apiKey: string) {
    this.openai = new OpenAI({
      apiKey: apiKey,
    });
  }

  /**
   * Notion 데이터를 처리하여 청크로 분할
   */
  async processNotionData(notionData: any[]): Promise<DocumentChunk[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
    this.chunks = [];
    
    for (const page of notionData) {
      const content = this.extractTextContent(page);
      const title = page.properties?.title?.title?.[0]?.plain_text || 'Untitled';
      
      // 페이지를 청크로 분할
      const pageChunks = this.splitIntoChunks(content, title, page);
      this.chunks.push(...pageChunks);
    }
    
    return this.chunks;
  }

  /**
   * 페이지에서 텍스트 콘텐츠 추출
   */
  private extractTextContent(page: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
    let content = '';
    
    // 직접 content 속성이 있는 경우 (chat API에서 전처리된 데이터)
    if (page.content) {
      return page.content;
    }
    
    // 제목 추출
    if (page.properties?.title?.title) {
      const title = page.properties.title.title
        .map((t: any) => t.plain_text) // eslint-disable-line @typescript-eslint/no-explicit-any
        .join('');
      content += `제목: ${title}\n`;
    }
    
    // 다른 속성들 추출
    if (page.properties) {
      for (const [key, property] of Object.entries(page.properties)) {
        if (key === 'title') continue; // 이미 처리됨
        
        const propertyText = this.extractPropertyText(property);
        if (propertyText) {
          content += `${key}: ${propertyText}\n`;
        }
      }
    }
    
    // 페이지 메타데이터
    if (page.created_time) {
      content += `생성일: ${new Date(page.created_time).toLocaleString('ko-KR')}\n`;
    }
    if (page.last_edited_time) {
      content += `마지막 수정: ${new Date(page.last_edited_time).toLocaleString('ko-KR')}\n`;
    }
    
    return content;
  }

  /**
   * 프로퍼티에서 텍스트 추출
   */
  private extractPropertyText(property: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!property) return '';
    
    switch (property.type) {
      case 'title':
        return property.title?.[0]?.plain_text || '';
      case 'rich_text':
        return property.rich_text?.map((t: any) => t.plain_text).join('') || ''; // eslint-disable-line @typescript-eslint/no-explicit-any
      case 'select':
        return property.select?.name || '';
      case 'multi_select':
        return property.multi_select?.map((s: any) => s.name).join(', ') || ''; // eslint-disable-line @typescript-eslint/no-explicit-any
      case 'date':
        return property.date?.start || '';
      case 'number':
        return property.number?.toString() || '';
      case 'checkbox':
        return property.checkbox ? '예' : '아니오';
      case 'url':
        return property.url || '';
      case 'email':
        return property.email || '';
      case 'phone_number':
        return property.phone_number || '';
      default:
        return '';
    }
  }

  /**
   * 콘텐츠를 청크로 분할
   */
  private splitIntoChunks(content: string, title: string, page: any): DocumentChunk[] { // eslint-disable-line @typescript-eslint/no-explicit-any
    const chunks: DocumentChunk[] = [];
    const chunkSize = 1000;
    const overlap = 200;
    
    // 페이지 메타데이터 추출 (날짜 정보 포함)
    const metadata: Record<string, any> = { // eslint-disable-line @typescript-eslint/no-explicit-any
      title,
      pageId: page.id || 'unknown',
      lastModified: page.last_edited_time || new Date().toISOString(),
      url: page.url,
      properties: {}
    };
    
    // 날짜 속성 추출하여 메타데이터에 저장
    if (page.metadata?.properties) {
      metadata.properties = { ...page.metadata.properties };
    } else if (page.properties) {
      // 직접 properties에서 날짜 정보 추출
      for (const [key, property] of Object.entries(page.properties)) {
        const prop = property as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (prop.type === 'date' && prop.date?.start) {
          metadata.properties[key] = prop.date.start;
          if (prop.date.end) {
            metadata.properties[`${key}_end`] = prop.date.end;
          }
        }
      }
    }
    
    if (content.length <= chunkSize) {
      // 내용이 청크 크기보다 작으면 그대로 사용
      chunks.push({
        id: `${page.id || 'chunk'}-0`,
        content,
        metadata: {
          title: metadata.title,
          pageId: metadata.pageId,
          lastModified: metadata.lastModified,
          url: metadata.url,
          properties: metadata.properties,
          chunkIndex: 0,
          totalChunks: 1
        }
      });
    } else {
      // 내용을 여러 청크로 분할
      let startIndex = 0;
      let chunkIndex = 0;
      
      while (startIndex < content.length) {
        const endIndex = Math.min(startIndex + chunkSize, content.length);
        const chunkContent = content.substring(startIndex, endIndex);
        
        chunks.push({
          id: `${page.id || 'chunk'}-${chunkIndex}`,
          content: chunkContent,
          metadata: {
            title: metadata.title,
            pageId: metadata.pageId,
            lastModified: metadata.lastModified,
            url: metadata.url,
            properties: metadata.properties,
            chunkIndex,
            totalChunks: Math.ceil(content.length / (chunkSize - overlap))
          }
        });
        
        startIndex += chunkSize - overlap;
        chunkIndex++;
      }
    }
    
    return chunks;
  }

  /**
   * 청크들의 임베딩 생성
   */
  async generateEmbeddings(): Promise<void> {
    console.log(`${this.chunks.length}개 청크의 임베딩을 생성 중...`);
    
    const batchSize = 100; // OpenAI API 제한 고려
    
    for (let i = 0; i < this.chunks.length; i += batchSize) {
      const batch = this.chunks.slice(i, i + batchSize);
      const texts = batch.map(chunk => chunk.content);
      
      try {
        if (!this.openai) {
          throw new Error('OpenAI 클라이언트가 초기화되지 않았습니다.');
        }

        const response = await this.openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: texts,
        });
        
        response.data.forEach((embedding: any, index: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const chunkId = batch[index].id;
          this.embeddings.set(chunkId, embedding.embedding);
          this.chunks[i + index].embedding = embedding.embedding;
        });
        
        console.log(`${Math.min(i + batchSize, this.chunks.length)}/${this.chunks.length} 임베딩 완료`);
      } catch (error) {
        console.error('임베딩 생성 오류:', error);
        throw error;
      }
    }
  }

  /**
   * 쿼리에 대한 유사한 청크 검색 (날짜 필터링 개선)
   */
  async searchSimilarChunks(query: string, topK: number = 5): Promise<SearchResult[]> {
    // 쿼리 임베딩 생성
    const queryEmbedding = await this.getQueryEmbedding(query);
    
    // 현재 날짜 기준 설정
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // 날짜 관련 키워드 감지
    const isRecentQuery = /최근|요즘|지금|오늘|이번|근래/i.test(query);
    const isUpcomingQuery = /다가오는|앞으로|미래|예정|곧/i.test(query);
    const isPastQuery = /지난|과거|전에|이전/i.test(query);
    
    // 모든 청크와 유사도 계산
    const similarities: SearchResult[] = [];
    
    for (const chunk of this.chunks) {
      if (!chunk.embedding) continue;
      
      const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      
      // 날짜 필터링 적용
      if (isRecentQuery || isUpcomingQuery || isPastQuery) {
        const chunkDates = this.extractDatesFromChunk(chunk);
        
        if (chunkDates.length > 0) {
          let dateMatches = false;
          
          for (const chunkDate of chunkDates) {
            if (isRecentQuery) {
              // 최근: 현재 날짜 기준 ±7일
              if (chunkDate >= sevenDaysAgo && chunkDate <= sevenDaysLater) {
                dateMatches = true;
                break;
              }
            } else if (isUpcomingQuery) {
              // 다가오는: 현재 날짜 이후
              if (chunkDate > now) {
                dateMatches = true;
                break;
              }
            } else if (isPastQuery) {
              // 지난: 현재 날짜 이전
              if (chunkDate < now) {
                dateMatches = true;
                break;
              }
            }
          }
          
          // 날짜 조건에 맞지 않으면 제외 (단, 너무 오래된 데이터는 더 강하게 필터링)
          if (!dateMatches) {
            // 2024년 이전 데이터는 "최근"에서 완전 제외
            if (isRecentQuery && chunkDates.some(d => d.getFullYear() < 2024)) {
              continue;
            }
            // 다른 경우는 유사도를 낮춤
            similarities.push({
              chunk,
              score: similarity * 0.3 // 날짜 조건에 맞지 않으면 점수를 크게 낮춤
            });
            continue;
          }
          
          // 날짜 조건에 맞으면 보너스 점수
          similarities.push({
            chunk,
            score: similarity * 1.2 // 날짜 조건에 맞으면 점수 향상
          });
        } else {
          // 날짜 정보가 없는 청크는 점수를 낮춤
          similarities.push({
            chunk,
            score: similarity * 0.5
          });
        }
      } else {
        // 날짜 관련 쿼리가 아닌 경우 기본 점수
        similarities.push({
          chunk,
          score: similarity
        });
      }
    }
    
    // 유사도 순으로 정렬하여 상위 K개 반환
    return similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * 쿼리 임베딩 생성
   */
  private async getQueryEmbedding(query: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI 클라이언트가 초기화되지 않았습니다.');
    }

    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    
    return response.data[0].embedding;
  }

  /**
   * 코사인 유사도 계산
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 검색 결과를 컨텍스트로 변환
   */
  formatSearchResults(results: SearchResult[]): string {
    if (results.length === 0) {
      return '관련된 정보를 찾을 수 없습니다.';
    }
    
    let context = '다음은 관련된 정보들입니다:\n\n';
    
    results.forEach((result, index) => {
      const { chunk, score } = result;
      context += `[${index + 1}] ${chunk.metadata.title}\n`;
      context += `${chunk.content}\n`;
      context += `(유사도: ${(score * 100).toFixed(1)}%)\n\n`;
    });
    
    return context;
  }

  /**
   * 데이터 저장 (임시 디렉토리 또는 메모리)
   */
  async saveToLocalStorage(): Promise<void> {
    const data = {
      chunks: this.chunks,
      embeddings: Array.from(this.embeddings.entries()),
      lastUpdated: new Date().toISOString(),
    };
    
    // Node.js 환경에서는 임시 디렉토리 사용 (Vercel 호환)
    if (typeof window === 'undefined') {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');
        
        // Vercel에서는 /tmp 디렉토리만 쓰기 가능
        const tmpDir = os.tmpdir();
        const dataPath = path.join(tmpDir, 'rag-data.json');
        
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
        console.log(`RAG 데이터를 임시 디렉토리에 저장했습니다: ${dataPath}`);
      } catch (error) {
        console.warn('파일 시스템 저장 실패, 메모리에서만 유지됩니다:', error);
        // 파일 저장에 실패해도 메모리에는 데이터가 있으므로 계속 진행
      }
    }
  }

  /**
   * 데이터 로드 (임시 디렉토리에서)
   */
  async loadFromLocalStorage(): Promise<boolean> {
    try {
      if (typeof window === 'undefined') {
        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');
        
        // 임시 디렉토리에서 데이터 찾기
        const tmpDir = os.tmpdir();
        const dataPath = path.join(tmpDir, 'rag-data.json');
        
        if (!fs.existsSync(dataPath)) {
          console.log('임시 디렉토리에 RAG 데이터가 없습니다.');
          return false;
        }
        
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        
        this.chunks = data.chunks || [];
        this.embeddings = new Map(data.embeddings || []);
        
        console.log(`${this.chunks.length}개 청크와 ${this.embeddings.size}개 임베딩을 로드했습니다.`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('데이터 로드 오류:', error);
      return false;
    }
  }

  /**
   * RAG 시스템 상태 확인
   */
  getStatus() {
    return {
      chunksCount: this.chunks.length,
      embeddingsCount: this.embeddings.size,
      isReady: this.chunks.length > 0 && this.embeddings.size > 0,
    };
  }

  /**
   * 청크에서 날짜 정보 추출
   */
  private extractDatesFromChunk(chunk: DocumentChunk): Date[] {
    const dates: Date[] = [];
    const content = chunk.content;
    
    // 한국어 날짜 형식 매칭 (예: 2025. 6. 27., 2025년 6월 27일)
    const koreanDateRegex = /(\d{4})[년\.\s]*(\d{1,2})[월\.\s]*(\d{1,2})[일\.\s]*/g;
    let match;
    
    while ((match = koreanDateRegex.exec(content)) !== null) {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]) - 1; // JavaScript Date는 0-based month
      const day = parseInt(match[3]);
      
      if (year >= 2020 && year <= 2030 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
        dates.push(new Date(year, month, day));
      }
    }
    
    // ISO 날짜 형식 매칭 (예: 2025-06-27)
    const isoDateRegex = /(\d{4})-(\d{2})-(\d{2})/g;
    while ((match = isoDateRegex.exec(content)) !== null) {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]) - 1;
      const day = parseInt(match[3]);
      
      if (year >= 2020 && year <= 2030 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
        dates.push(new Date(year, month, day));
      }
    }
    
    // 메타데이터에서 날짜 정보 추출
    if (chunk.metadata.properties) {
      for (const [key, value] of Object.entries(chunk.metadata.properties)) {
        if (key.toLowerCase().includes('date') || key.includes('날짜') || key.includes('일정')) {
          if (typeof value === 'string') {
            const date = new Date(value);
            if (!isNaN(date.getTime()) && date.getFullYear() >= 2020 && date.getFullYear() <= 2030) {
              dates.push(date);
            }
          }
        }
      }
    }
    
    return dates;
  }
} 