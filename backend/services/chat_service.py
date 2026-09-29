"""
Chat Service Module for Omnisage Medical Record Aggregator.

This module implements the RAG (Retrieval-Augmented Generation) chatbot.
It embeds user queries, retrieves relevant document chunks from the embeddings
store, constructs context-aware prompts, and generates responses with citations.
"""

import json
from datetime import datetime
from sqlalchemy.orm import Session
from backend.config import settings
from backend.models.ai_models import (
    RecordEmbedding, ChatConversation, ChatMessage
)
from backend.models import MedicalRecord
from backend.services.ollama_client import ollama_client


RAG_SYSTEM_PROMPT = """You are a helpful medical health assistant for the Omnisage platform. You help patients understand their medical records, health history, and provide clear explanations.

IMPORTANT RULES:
1. Answer ONLY based on the provided medical record context. Do not make up information.
2. If the context doesn't contain enough information to answer, say so honestly.
3. Use simple, patient-friendly language.
4. When referencing specific records, mention the file name.
5. For medical values, explain what they mean in plain language.
6. Never provide medical diagnoses or treatment advice — only explain existing records.
7. Be concise but thorough."""


class ChatService:
    """
    RAG chatbot service for answering questions about medical records.

    Retrieves relevant document chunks via embedding similarity,
    constructs context-enriched prompts, and manages conversation history.
    """

    @staticmethod
    def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
        """
        Computes cosine similarity between two vectors.

        Args:
            vec_a (list[float]): First vector.
            vec_b (list[float]): Second vector.

        Returns:
            float: Cosine similarity score between -1 and 1.
        """
        if not vec_a or not vec_b or len(vec_a) != len(vec_b):
            return 0.0

        dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
        norm_a = sum(a * a for a in vec_a) ** 0.5
        norm_b = sum(b * b for b in vec_b) ** 0.5

        if norm_a == 0 or norm_b == 0:
            return 0.0

        return dot_product / (norm_a * norm_b)

    @staticmethod
    def retrieve_relevant_chunks(
        query: str, db: Session, top_k: int = None, user_id: int = 1
    ) -> list[dict]:
        """
        Retrieves the most relevant document chunks for a user query.

        Embeds the query, computes cosine similarity against all stored
        embeddings, and returns the top-K most similar chunks.

        Args:
            query (str): The user's natural language query.
            db (Session): Active database session.
            top_k (int): Number of results to return (default from config).
            user_id (int): The user ID to filter records.

        Returns:
            list[dict]: Ranked list of chunks with keys:
                record_id, file_name, category, chunk_text, similarity_score.
        """
        top_k = top_k or settings.RAG_TOP_K

        # Embed the query. This is allowed to fail (e.g. Ollama unreachable)
        # without taking down the whole chat request — send_message() below
        # already has its own try/except around the final generate() call
        # that turns an Ollama failure into a normal, specific in-conversation
        # reply ("I'm sorry, I encountered an error processing your request:
        # <real reason>"). Previously this embed() call was NOT wrapped, so
        # if Ollama was down, this raised straight out of send_message(), past
        # that graceful-degradation handling, as a hard 503 with no message/
        # citations ever stored — which is what the frontend's generic
        # "Please make sure Ollama is running" fallback was actually masking.
        try:
            query_embedding = ollama_client.embed(query)
        except Exception:
            return []

        # Get all embeddings for this user's records
        embeddings = (
            db.query(RecordEmbedding, MedicalRecord)
            .join(MedicalRecord, RecordEmbedding.record_id == MedicalRecord.id)
            .filter(MedicalRecord.user_id == user_id)
            .all()
        )

        if not embeddings:
            return []

        # Compute similarities
        results = []
        for emb, record in embeddings:
            try:
                stored_embedding = json.loads(emb.embedding) if isinstance(emb.embedding, str) else emb.embedding
                score = ChatService._cosine_similarity(query_embedding, stored_embedding)
                results.append({
                    "record_id": record.id,
                    "file_name": record.file_name,
                    "category": record.category,
                    "record_date": str(record.record_date) if record.record_date else None,
                    "chunk_text": emb.chunk_text,
                    "similarity_score": round(score, 4),
                })
            except Exception:
                continue

        # Sort by similarity descending and take top-K
        results.sort(key=lambda x: x["similarity_score"], reverse=True)
        return results[:top_k]

    @staticmethod
    def send_message(
        message: str, conversation_id: str, db: Session, user_id: int = 1
    ) -> dict:
        """
        Processes a user message through the RAG pipeline and generates a response.

        Creates a new conversation if conversation_id is None. Retrieves
        relevant context chunks, builds a prompt with conversation history,
        and generates a response with citations.

        Args:
            message (str): The user's message.
            conversation_id (str or None): Existing conversation ID, or None for new.
            db (Session): Active database session.
            user_id (int): The authenticated user's ID.

        Returns:
            dict: Response with keys: conversation_id, message, citations.
        """
        # Get or create conversation
        if conversation_id:
            conversation = db.query(ChatConversation).filter(
                ChatConversation.id == conversation_id,
                ChatConversation.user_id == user_id,
            ).first()
            if not conversation:
                raise ValueError("Conversation not found.")
        else:
            conversation = ChatConversation(user_id=user_id)
            db.add(conversation)
            db.commit()
            db.refresh(conversation)

        # Store the user message
        user_msg = ChatMessage(
            conversation_id=conversation.id,
            role="user",
            content=message,
        )
        db.add(user_msg)
        db.commit()

        # Update conversation title from first message
        if len(conversation.messages) <= 1:
            conversation.title = message[:80] + ("..." if len(message) > 80 else "")
            db.commit()

        # Retrieve relevant context
        relevant_chunks = ChatService.retrieve_relevant_chunks(
            query=message, db=db, user_id=user_id
        )

        # Build context string
        context_parts = []
        citations = []
        seen_records = set()

        for chunk in relevant_chunks:
            if chunk["similarity_score"] < 0.3:
                continue
            context_parts.append(
                f"[From: {chunk['file_name']} | {chunk['category']}]\n{chunk['chunk_text']}"
            )
            if chunk["record_id"] not in seen_records:
                citations.append({
                    "record_id": chunk["record_id"],
                    "file_name": chunk["file_name"],
                    "category": chunk["category"],
                })
                seen_records.add(chunk["record_id"])

        context = "\n\n---\n\n".join(context_parts) if context_parts else "No relevant medical records found."

        # Build conversation history (last 6 messages for context)
        history_msgs = (
            db.query(ChatMessage)
            .filter(ChatMessage.conversation_id == conversation.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(7)
            .all()
        )
        history_msgs.reverse()

        history_text = ""
        for msg in history_msgs[:-1]:  # Exclude the current message
            role_label = "Patient" if msg.role == "user" else "Assistant"
            history_text += f"{role_label}: {msg.content}\n\n"

        # Build the final prompt
        prompt = f"""Medical Records Context:
{context}

{f"Conversation History:{chr(10)}{history_text}" if history_text else ""}
Patient's Question: {message}

Provide a helpful, accurate answer based on the medical records above."""

        # Generate response
        try:
            response_text = ollama_client.generate(
                prompt=prompt,
                system=RAG_SYSTEM_PROMPT,
                temperature=0.3,
            )
        except Exception as e:
            response_text = f"I'm sorry, I encountered an error processing your request: {str(e)}"
            citations = []

        # Store assistant response
        assistant_msg = ChatMessage(
            conversation_id=conversation.id,
            role="assistant",
            content=response_text,
            citations=citations,
        )
        db.add(assistant_msg)
        conversation.updated_at = datetime.utcnow()
        db.commit()

        return {
            "conversation_id": conversation.id,
            "message": response_text,
            "citations": citations,
        }
