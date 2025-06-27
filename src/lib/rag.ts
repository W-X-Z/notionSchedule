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
   * 노션 데이터를 청킹하여 처리
   */
  async processNotionData(notionData: any[]): Promise<DocumentChunk[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const chunks: DocumentChunk[] = [];
    
    for (const page of notionData) {
      // 페이지 제목과 내용을 결합
      const title = page.properties?.title?.title?.[0]?.plain_text || 'Untitled';
      const content = this.extractTextContent(page);
      
      if (content.trim().length < 50) continue; // 너무 짧은 내용은 제외
      
      // 큰 내용을 청크로 분할
      const pageChunks = this.splitIntoChunks(content, title, page);
      chunks.push(...pageChunks);
    }
    
    this.chunks = chunks;
    return chunks;
  }

  /**
   * 텍스트 내용 추출
   */
  private extractTextContent(page: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
    let content = '';
    
    // 제목 추가
    const title = page.properties?.title?.title?.[0]?.plain_text || '';
    if (title) content += `제목: ${title}\n\n`;
    
    // 프로퍼티들 추가
    if (page.properties) {
              for (const [propertyKey, value] of Object.entries(page.properties)) {
          if (propertyKey === 'title') continue;
          const textValue = this.extractPropertyText(value);
          if (textValue) {
            content += `${propertyKey}: ${textValue}\n`;
          }
        }
    }
    
    // 페이지 내용 추가 (만약 있다면)
    if (page.content) {
      content += `\n내용:\n${page.content}`;
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
   * 텍스트를 의미있는 청크로 분할
   */
  private splitIntoChunks(content: string, title: string, page: any): DocumentChunk[] { // eslint-disable-line @typescript-eslint/no-explicit-any
    const chunks: DocumentChunk[] = [];
    const maxChunkSize = 1000; // 토큰 제한 고려
    const overlap = 200; // 청크 간 겹침
    
    // 문단 단위로 먼저 분할
    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0);
    
    let currentChunk = '';
    let chunkIndex = 0;
    
    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk.length > 0) {
        // 현재 청크 저장
        chunks.push({
          id: `${page.id}_chunk_${chunkIndex}`,
          content: currentChunk.trim(),
          metadata: {
            title,
            pageId: page.id,
            lastModified: page.last_edited_time || new Date().toISOString(),
            url: page.url,
            properties: page.properties,
          }
        });
        
        // 겹침을 위해 마지막 부분 유지
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(overlap / 5)); // 대략적인 겹침
        currentChunk = overlapWords.join(' ') + '\n\n' + paragraph;
        chunkIndex++;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }
    
    // 마지막 청크 저장
    if (currentChunk.trim().length > 0) {
      chunks.push({
        id: `${page.id}_chunk_${chunkIndex}`,
        content: currentChunk.trim(),
        metadata: {
          title,
          pageId: page.id,
          lastModified: page.last_edited_time || new Date().toISOString(),
          url: page.url,
          properties: page.properties,
        }
      });
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
   * 쿼리에 대한 유사한 청크 검색
   */
  async searchSimilarChunks(query: string, topK: number = 5): Promise<SearchResult[]> {
    // 쿼리 임베딩 생성
    const queryEmbedding = await this.getQueryEmbedding(query);
    
    // 모든 청크와 유사도 계산
    const similarities: SearchResult[] = [];
    
    for (const chunk of this.chunks) {
      if (!chunk.embedding) continue;
      
      const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      similarities.push({
        chunk,
        score: similarity
      });
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
   * 데이터 저장 (로컬 스토리지)
   */
  async saveToLocalStorage(): Promise<void> {
    const data = {
      chunks: this.chunks,
      embeddings: Array.from(this.embeddings.entries()),
      lastUpdated: new Date().toISOString(),
    };
    
    // Node.js 환경에서는 파일 시스템 사용
    if (typeof window === 'undefined') {
      const fs = await import('fs');
      const path = await import('path');
      
      const dataPath = path.join(process.cwd(), 'data', 'rag-data.json');
      const dir = path.dirname(dataPath);
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    }
  }

  /**
   * 데이터 로드 (로컬 스토리지)
   */
  async loadFromLocalStorage(): Promise<boolean> {
    try {
      if (typeof window === 'undefined') {
        const fs = await import('fs');
        const path = await import('path');
        
        const dataPath = path.join(process.cwd(), 'data', 'rag-data.json');
        
        if (!fs.existsSync(dataPath)) {
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
} 