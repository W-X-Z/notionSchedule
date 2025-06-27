'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Save, RefreshCw, Eye, EyeOff, Sparkles, Database, Bot, Zap, CheckCircle, AlertCircle, Brain, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Settings {
  notionApiKey: string;
  notionDatabaseId: string;
  openaiApiKey: string;
  openaiModel: string;
  systemPrompt: string;
}

const DEFAULT_PROMPT = `당신은 Notion 데이터베이스의 정보를 바탕으로 답변하는 AI 어시스턴트입니다. 
다음 규칙을 따라 답변해주세요:

1. 제공된 Notion 데이터만을 기반으로 답변하세요.
2. 데이터에 없는 정보는 추측하지 말고 "해당 정보를 찾을 수 없습니다"라고 답변하세요.
3. 답변은 한국어로 정확하고 친근하게 작성하세요.
4. 가능한 한 구체적인 정보와 날짜를 포함하여 답변하세요.
5. 날짜를 비교할 때는 반드시 정확한 날짜 순서대로 분석하세요 (YYYY-MM-DD 형식).
6. "마무리", "완료", "종료"된 프로젝트를 찾을 때는 End Date, 완료일, 종료일 등의 속성을 우선적으로 확인하세요.
7. 여러 프로젝트의 날짜를 비교할 때는 모든 관련 프로젝트의 날짜를 나열하고 가장 최근 날짜를 정확히 찾아주세요.`;

const OPENAI_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o', description: '최신 모델, 가장 뛰어난 성능' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: '빠르고 효율적인 모델' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: '향상된 성능과 속도' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: '경제적이고 빠른 모델' }
];

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>({
    notionApiKey: '',
    notionDatabaseId: '',
    openaiApiKey: '',
    openaiModel: 'gpt-4o-mini',
    systemPrompt: DEFAULT_PROMPT
  });
  const [showNotionKey, setShowNotionKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isUpdatingSystem, setIsUpdatingSystem] = useState(false);
  const [ragStatus, setRagStatus] = useState<{
    chunksCount: number;
    embeddingsCount: number;
    isReady: boolean;
  } | null>(null);

  useEffect(() => {
    // 로컬 스토리지에서 설정 불러오기
    const savedSettings = localStorage.getItem('notion-chatbot-settings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }

    // 마지막 업데이트 시간 불러오기
    const lastUpdate = localStorage.getItem('notion-data-last-updated');
    if (lastUpdate) {
      setLastUpdated(lastUpdate);
    }

    // RAG 상태 확인
    checkRAGStatus();
  }, []);

  const handleInputChange = (field: keyof Settings, value: string) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const saveSettings = () => {
    setSaveStatus('saving');
    try {
      localStorage.setItem('notion-chatbot-settings', JSON.stringify(settings));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const checkRAGStatus = async () => {
    try {
      const response = await fetch('/api/initialize-rag', {
        method: 'GET',
      });

      if (response.ok) {
        const data = await response.json();
        setRagStatus(data.status);
      }
    } catch {
      // RAG 상태 확인 실패 시 무시
    }
  };

  const updateSystemData = async () => {
    if (!settings.notionApiKey || !settings.notionDatabaseId) {
      alert('Notion API 키와 데이터베이스 ID를 먼저 설정해주세요.');
      return;
    }

    if (!settings.openaiApiKey) {
      alert('OpenAI API 키를 먼저 설정해주세요.');
      return;
    }

    setIsUpdatingSystem(true);
    try {
      // RAG 초기화 (내부적으로 노션 데이터 업데이트도 수행)
      const response = await fetch('/api/initialize-rag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          openaiApiKey: settings.openaiApiKey,
          notionApiKey: settings.notionApiKey,
          notionDatabaseId: settings.notionDatabaseId,
        }),
      });

      if (!response.ok) {
        throw new Error('시스템 업데이트에 실패했습니다.');
      }

      const data = await response.json();
      const updateTime = new Date().toLocaleString('ko-KR');
      setLastUpdated(updateTime);
      localStorage.setItem('notion-data-last-updated', updateTime);
      setRagStatus(data.status);
      
      alert(`시스템이 성공적으로 업데이트되었습니다. (${data.status.chunksCount}개 청크, ${data.status.embeddingsCount}개 임베딩)`);
    } catch (error) {
      console.error('시스템 업데이트 오류:', error);
      alert('시스템 업데이트 중 오류가 발생했습니다.');
    } finally {
      setIsUpdatingSystem(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-100/60 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-4 -right-4 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-indigo-600/20 rounded-full blur-3xl animate-float"></div>
        <div className="absolute -bottom-8 -left-8 w-96 h-96 bg-gradient-to-tr from-purple-400/20 to-pink-600/20 rounded-full blur-3xl animate-float" style={{animationDelay: '3s'}}></div>
      </div>

      {/* Header */}
      <header className="glass-effect border-b border-white/20 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.back()}
              className="p-3 text-gray-600 hover:text-gray-800 hover:bg-white/80 rounded-xl transition-all duration-200 hover:shadow-lg"
              title="뒤로 가기"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                  설정
                </h1>
                <p className="text-sm text-gray-500">API 키 및 환경 설정</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {/* Notion Settings Card */}
          <div className="card p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center">
                <Database className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Notion 설정</h2>
                <p className="text-gray-600">Notion 데이터베이스 연결 설정</p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Notion API 키
                </label>
                <div className="relative">
                  <input
                    type={showNotionKey ? 'text' : 'password'}
                    value={settings.notionApiKey}
                    onChange={(e) => handleInputChange('notionApiKey', e.target.value)}
                    placeholder="secret_xxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="input-field pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNotionKey(!showNotionKey)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {showNotionKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  데이터베이스 ID
                </label>
                <input
                  type="text"
                  value={settings.notionDatabaseId}
                  onChange={(e) => handleInputChange('notionDatabaseId', e.target.value)}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="input-field"
                />
              </div>
            </div>
          </div>

          {/* OpenAI Settings Card */}
          <div className="card p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-2xl flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">OpenAI 설정</h2>
                <p className="text-gray-600">AI 모델 및 API 설정</p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  OpenAI API 키
                </label>
                <div className="relative">
                  <input
                    type={showOpenaiKey ? 'text' : 'password'}
                    value={settings.openaiApiKey}
                    onChange={(e) => handleInputChange('openaiApiKey', e.target.value)}
                    placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="input-field pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {showOpenaiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  AI 모델
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {OPENAI_MODELS.map(model => (
                    <label
                      key={model.id}
                      className={`relative flex items-start p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        settings.openaiModel === model.id
                          ? 'border-indigo-500 bg-indigo-50/50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="model"
                        value={model.id}
                        checked={settings.openaiModel === model.id}
                        onChange={(e) => handleInputChange('openaiModel', e.target.value)}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{model.name}</div>
                        <div className="text-sm text-gray-600">{model.description}</div>
                      </div>
                      {settings.openaiModel === model.id && (
                        <CheckCircle className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                      )}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* System Prompt Card */}
          <div className="card p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">시스템 프롬프트</h2>
                <p className="text-gray-600">AI 응답 스타일 및 규칙 설정</p>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                AI가 응답할 때 사용할 지침
              </label>
              <textarea
                value={settings.systemPrompt}
                onChange={(e) => handleInputChange('systemPrompt', e.target.value)}
                rows={10}
                className="input-field resize-none"
                placeholder="시스템 프롬프트를 입력하세요..."
              />
            </div>
          </div>

          {/* System Management Card */}
          <div className="card p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-violet-600 to-purple-600 rounded-2xl flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">시스템 관리</h2>
                <p className="text-gray-600">Notion 데이터 동기화 및 RAG 시스템</p>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-violet-50 to-purple-50/50 p-6 rounded-2xl border border-violet-200/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-gray-700 font-medium mb-2">
                    Notion 데이터를 가져와 RAG 시스템을 업데이트합니다.
                  </p>
                  <div className="space-y-2">
                    {ragStatus && ragStatus.isReady ? (
                      <>
                        <div className="flex items-center space-x-2 text-sm text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <span>RAG 시스템 활성화됨</span>
                        </div>
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <Search className="w-4 h-4" />
                          <span>{ragStatus.chunksCount}개 문서 청크, {ragStatus.embeddingsCount}개 임베딩</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center space-x-2 text-sm text-orange-600">
                        <AlertCircle className="w-4 h-4" />
                        <span>RAG 시스템이 초기화되지 않았습니다</span>
                      </div>
                    )}
                    {lastUpdated && (
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span>마지막 업데이트: {lastUpdated}</span>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={updateSystemData}
                  disabled={isUpdatingSystem || !settings.openaiApiKey || !settings.notionApiKey || !settings.notionDatabaseId}
                  className="btn-primary flex items-center space-x-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                >
                  <Brain size={18} className={isUpdatingSystem ? 'animate-pulse' : ''} />
                  <span>{isUpdatingSystem ? '시스템 업데이트 중...' : 'Notion & RAG 업데이트'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={saveSettings}
              disabled={saveStatus === 'saving'}
              className={`btn-primary flex items-center space-x-2 min-w-[120px] justify-center ${
                saveStatus === 'saved' ? 'bg-green-600 hover:bg-green-700' : ''
              } ${
                saveStatus === 'error' ? 'bg-red-600 hover:bg-red-700' : ''
              }`}
            >
              {saveStatus === 'saving' && <RefreshCw size={18} className="animate-spin" />}
              {saveStatus === 'saved' && <CheckCircle size={18} />}
              {saveStatus === 'error' && <AlertCircle size={18} />}
              {saveStatus === 'idle' && <Save size={18} />}
              <span>
                {saveStatus === 'saving' && '저장 중...'}
                {saveStatus === 'saved' && '저장 완료'}
                {saveStatus === 'error' && '저장 실패'}
                {saveStatus === 'idle' && '설정 저장'}
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
} 