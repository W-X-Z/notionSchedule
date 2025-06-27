'use client';

import { useState, useEffect, useRef } from 'react';
import { Settings, Send, RotateCcw, Bot, User, Sparkles, MessageCircle, Zap, Database } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const DEFAULT_QUESTIONS = [
  {
    icon: <MessageCircle className="w-5 h-5" />,
    text: "팀의 최근 업무 진행상황은 어떻게 되나요?",
    gradient: "from-blue-500 to-cyan-500"
  },
  {
    icon: <Zap className="w-5 h-5" />,
    text: "프로젝트 일정과 마일스톤은 무엇인가요?",
    gradient: "from-purple-500 to-pink-500"
  },
  {
    icon: <Database className="w-5 h-5" />,
    text: "회의록에서 중요한 액션 아이템들은 무엇인가요?",
    gradient: "from-green-500 to-emerald-500"
  }
];

export default function Home() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    console.log('=== 메시지 전송 시작 ===');
    console.log('사용자 질문:', content);

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // 로컬 스토리지에서 설정과 Notion 데이터 가져오기
      const savedSettings = localStorage.getItem('notion-chatbot-settings');
      const notionData = localStorage.getItem('notion-data') || '';

      console.log('저장된 설정 있음:', !!savedSettings);
      console.log('Notion 데이터 길이:', notionData.length);

      if (!savedSettings) {
        throw new Error('설정이 저장되지 않았습니다. 설정 페이지에서 API 키를 설정해주세요.');
      }

      const settings = JSON.parse(savedSettings);
      console.log('설정 키들:', Object.keys(settings));
      
      if (!settings.openaiApiKey) {
        throw new Error('OpenAI API 키가 설정되지 않았습니다. 설정 페이지에서 API 키를 설정해주세요.');
      }

      if (!notionData) {
        console.log('WARNING: Notion 데이터가 비어있음');
        // 오류를 던지지 않고 경고만 출력
      } else {
        console.log('Notion 데이터 샘플:', notionData.substring(0, 200) + '...');
        console.log('전체 Notion 데이터:', notionData); // 전체 데이터 확인
      }

      console.log('API 호출 준비...');
      const requestBody = { 
        message: content.trim(),
        notionData: notionData
      };
      console.log('요청 본문 크기:', JSON.stringify(requestBody).length);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${btoa(encodeURIComponent(JSON.stringify(settings)))}`,
        },
        body: JSON.stringify(requestBody),
      });

      console.log('API 응답 상태:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.log('API 오류 응답:', errorData);
        throw new Error(errorData.error || 'AI 응답을 받는 중 오류가 발생했습니다.');
      }

      const data = await response.json();
      console.log('API 응답 데이터:', data);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: error instanceof Error ? error.message : '죄송합니다. 응답을 생성하는 중 오류가 발생했습니다. 설정을 확인해주세요.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleDefaultQuestion = (question: string) => {
    sendMessage(question);
  };

  const clearMessages = () => {
    setMessages([]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-100/60 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-4 -right-4 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-indigo-600/20 rounded-full blur-3xl animate-float"></div>
        <div className="absolute -bottom-8 -left-8 w-96 h-96 bg-gradient-to-tr from-purple-400/20 to-pink-600/20 rounded-full blur-3xl animate-float" style={{animationDelay: '3s'}}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-cyan-400/10 to-blue-600/10 rounded-full blur-3xl animate-pulse-subtle"></div>
      </div>

      {/* Header */}
      <header className="glass-effect border-b border-white/20 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                  Notion 챗봇
                </h1>
                <p className="text-sm text-gray-500">AI-powered knowledge assistant</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={clearMessages}
                className="p-3 text-gray-600 hover:text-gray-800 hover:bg-white/80 rounded-xl transition-all duration-200 hover:shadow-lg"
                title="대화 초기화"
              >
                <RotateCcw size={20} />
              </button>
              <button
                onClick={() => router.push('/settings')}
                className="p-3 text-gray-600 hover:text-gray-800 hover:bg-white/80 rounded-xl transition-all duration-200 hover:shadow-lg"
                title="설정"
              >
                <Settings size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="card max-w-4xl mx-auto min-h-[calc(100vh-12rem)]">
          {/* Messages */}
          <div className="h-[calc(100vh-16rem)] overflow-y-auto p-6 space-y-6 scrollbar-hide">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <div className="mb-12">
                  <div className="w-20 h-20 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6 animate-float">
                    <Bot className="w-10 h-10 text-white" />
                  </div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-4">
                    안녕하세요! 👋
                  </h2>
                  <p className="text-gray-600 text-lg max-w-md mx-auto leading-relaxed">
                    Notion 데이터를 기반으로 도움을 드릴 준비가 되었습니다.
                    <br />아래 질문을 선택하거나 직접 질문해보세요.
                  </p>
                </div>
                
                {/* Default Questions */}
                <div className="space-y-4 max-w-2xl mx-auto">
                  {DEFAULT_QUESTIONS.map((question, index) => (
                    <button
                      key={index}
                      onClick={() => handleDefaultQuestion(question.text)}
                      className={`w-full p-6 text-left bg-gradient-to-r ${question.gradient} rounded-2xl text-white transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] transform group`}
                    >
                      <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0 w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center group-hover:bg-white/30 transition-colors">
                          {question.icon}
                        </div>
                        <div className="flex-1">
                          <span className="font-medium text-white/90 group-hover:text-white transition-colors">
                            {question.text}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex items-start space-x-4 ${
                      message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                    }`}
                  >
                    <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                      message.role === 'user' 
                        ? 'bg-gradient-to-br from-indigo-600 to-purple-600' 
                        : 'bg-gradient-to-br from-emerald-500 to-teal-600'
                    }`}>
                      {message.role === 'user' ? (
                        <User className="w-5 h-5 text-white" />
                      ) : (
                        <Bot className="w-5 h-5 text-white" />
                      )}
                    </div>
                    
                    <div className={`flex-1 max-w-3xl ${
                      message.role === 'user' ? 'text-right' : 'text-left'
                    }`}>
                      <div className={`inline-block p-4 rounded-2xl shadow-sm ${
                        message.role === 'user'
                          ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white'
                          : 'bg-white/70 backdrop-blur-sm border border-gray-200/50 text-gray-800'
                      }`}>
                        <p className="whitespace-pre-wrap leading-relaxed">
                          {message.content}
                        </p>
                      </div>
                      <div className="mt-2">
                        <span className="text-xs text-gray-500">
                          {message.timestamp.toLocaleTimeString('ko-KR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="bg-white/70 backdrop-blur-sm border border-gray-200/50 p-4 rounded-2xl shadow-sm">
                        <div className="flex items-center space-x-3">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                          </div>
                          <span className="text-gray-600 text-sm">응답 생성 중...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-gray-200/50 p-6 bg-white/30 backdrop-blur-sm">
            <form onSubmit={handleSubmit} className="flex space-x-4">
              <div className="flex-1">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="질문을 입력하세요..."
                  className="input-field text-base"
                  disabled={isLoading}
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="btn-primary flex items-center justify-center w-14 h-14 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none"
              >
                <Send size={20} />
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
