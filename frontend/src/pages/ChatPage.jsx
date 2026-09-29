/**
 * ChatPage.jsx
 *
 * Full-page AI chat assistant powered by RAG (Retrieval-Augmented Generation).
 * Features a conversation sidebar, message thread with citations, typing
 * indicator, and example query suggestions for new conversations.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, Plus, Trash2, SendHorizontal,
  Bot, FileText, Sparkles,
} from 'lucide-react';
import { apiService } from '../services/apiService';

/**
 * AI Chat assistant page component.
 *
 * @returns {JSX.Element}
 */
export default function ChatPage() {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [convsLoading, setConvsLoading] = useState(true);
  const messagesEndRef = useRef(null);

  const EXAMPLE_QUERIES = [
    'What medications am I currently taking?',
    'Explain my latest blood test results',
    'What medical conditions have been identified?',
    'Show my cholesterol trend over time',
  ];

  /** Load conversation list on mount. */
  useEffect(() => {
    loadConversations();
  }, []);

  /** Auto-scroll to bottom on new messages. */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  /**
   * Loads all conversations from the API.
   */
  const loadConversations = async () => {
    setConvsLoading(true);
    try {
      const data = await apiService.getConversations();
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setConvsLoading(false);
    }
  };

  /**
   * Loads a specific conversation's messages.
   *
   * @param {string} convId - The conversation UUID.
   */
  const loadConversation = async (convId) => {
    try {
      const data = await apiService.getConversation(convId);
      setActiveConvId(convId);
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  };

  /**
   * Starts a fresh conversation.
   */
  const handleNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
    setInputValue('');
  };

  /**
   * Sends a message (or starts a new conversation).
   *
   * @param {string} [overrideMsg] - Optional message to send (for suggestion chips).
   */
  const handleSend = async (overrideMsg) => {
    const msg = overrideMsg || inputValue.trim();
    if (!msg || isLoading) return;

    setInputValue('');

    // Optimistic UI: add user message immediately
    const userMsg = { id: Date.now(), role: 'user', content: msg, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const result = await apiService.sendChatMessage(activeConvId, msg);

      // Set conversation ID if new
      if (!activeConvId) {
        setActiveConvId(result.conversation_id);
      }

      // Add assistant message
      const assistantMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: result.message,
        citations: result.citations || [],
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Refresh conversation list
      loadConversations();
    } catch (err) {
      // Surface the backend's actual error detail (e.g. "Ollama server is
      // not running.", or a specific model/DB error) instead of always
      // showing the same generic message regardless of what really failed —
      // a hardcoded "make sure Ollama is running" is actively misleading
      // when the real cause is something else entirely, and makes real
      // problems undiagnosable from the UI alone.
      const detail = err.response?.data?.detail;
      const errorMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: detail
          ? `Sorry, I encountered an error: ${detail}`
          : 'Sorry, I encountered an error reaching the server. Please check your connection and try again.',
        citations: [],
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Deletes a conversation.
   *
   * @param {Event} e - Click event (to stop propagation).
   * @param {string} convId - Conversation UUID to delete.
   */
  const handleDelete = async (e, convId) => {
    e.stopPropagation();
    try {
      await apiService.deleteConversation(convId);
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (activeConvId === convId) {
        handleNewChat();
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  /**
   * Formats a date string for display.
   *
   * @param {string} dateStr - ISO date string.
   * @returns {string} Formatted date.
   */
  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000) return 'Today';
    if (diff < 172800000) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-layout">
      {/* ── Conversation Sidebar ── */}
      <div className="chat-sidebar">
        <div className="chat-sidebar-header">
          <button className="chat-new-btn" onClick={handleNewChat}>
            <Plus className="h-4 w-4" />
            New Chat
          </button>
        </div>
        <div className="chat-conv-list">
          {convsLoading ? (
            <p style={{ padding: '16px', fontSize: '12px', color: '#475569', textAlign: 'center' }}>Loading...</p>
          ) : conversations.length === 0 ? (
            <p style={{ padding: '16px', fontSize: '12px', color: '#475569', textAlign: 'center' }}>No conversations yet</p>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`chat-conv-item ${activeConvId === conv.id ? 'chat-conv-item--active' : ''}`}
                onClick={() => loadConversation(conv.id)}
              >
                <div>
                  <div className="chat-conv-title">{conv.title}</div>
                  <div className="chat-conv-date">{formatDate(conv.updated_at)}</div>
                </div>
                <button
                  className="chat-conv-delete"
                  onClick={(e) => handleDelete(e, conv.id)}
                  title="Delete conversation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Main Chat Area ── */}
      <div className="chat-main">
        {activeConvId || messages.length > 0 ? (
          <>
            {/* Header */}
            <div className="chat-header">
              <Bot className="h-5 w-5" style={{ color: 'hsl(215,90%,60%)' }} />
              <span className="chat-header-title">
                {conversations.find(c => c.id === activeConvId)?.title || 'New Conversation'}
              </span>
            </div>

            {/* Messages */}
            <div className="chat-messages">
              {messages.map((msg) => (
                <div key={msg.id} className={`chat-msg chat-msg--${msg.role}`}>
                  <div className="chat-msg-content">{msg.content}</div>
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="chat-citations">
                      {msg.citations.map((cit, i) => (
                        <span key={i} className="chat-citation-chip">
                          <FileText className="h-3 w-3" />
                          {cit.file_name}
                        </span>
                      ))}
                    </div>
                  )}
                  <span className="chat-msg-time">{formatTime(msg.created_at)}</span>
                </div>
              ))}
              {isLoading && (
                <div className="chat-typing-indicator">
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="chat-input-bar">
              <input
                className="chat-input"
                placeholder="Ask about your medical records..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                disabled={isLoading}
              />
              <button
                className="chat-send-btn"
                onClick={() => handleSend()}
                disabled={isLoading || !inputValue.trim()}
              >
                <SendHorizontal className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          /* ── Empty State ── */
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <Sparkles className="h-7 w-7" />
            </div>
            <h2 className="chat-empty-title">Ask anything about your health records</h2>
            <p className="chat-empty-sub">
              Your AI health assistant can answer questions about your medical history,
              lab results, medications, and more — all based on your uploaded records.
            </p>
            <div className="chat-suggestion-grid">
              {EXAMPLE_QUERIES.map((q, i) => (
                <button
                  key={i}
                  className="chat-suggestion-chip"
                  onClick={() => handleSend(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
