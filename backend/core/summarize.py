from typing import Optional
from services.api_client import api_client

async def summarize_extracted_content(text: str, source_type: str = "text") -> str:
    """Summarize extracted OCR or ASR text using AI for better UI display."""
    if not text or len(text.strip()) < 10:
        return text

    prompt = f"""
    Please provide a very concise summary (one sentence, max 20 words) of the following {source_type} content extracted from a student's upload.
    This summary will be shown in a 'Learning Context' sidebar.
    If the content is in Chinese, summarize in Chinese. If in English, summarize in English.

    Content:
    {text[:2000]}
    """

    try:
        messages = [{"role": "user", "content": prompt}]
        response = await api_client.deepseek.chat_completion(messages=messages, max_tokens=100)
        if response.success and response.data:
            summary = response.data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            return summary
    except Exception as e:
        print(f"⚠️ Summary failed: {e}")

    return text[:60] + "..."
